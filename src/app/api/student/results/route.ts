import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AllowedRole = "student" | "teacher" | "admin";
interface DecodedWithRole extends DecodedIdToken { role?: AllowedRole | string }

// ---------- Төрөл ----------
type HistoryPoint = { date: string; total: number; part1?: number; part2?: number };
type SubjectResult = { average: number; history: HistoryPoint[] };
type ResultsByStudent = Record<string, Record<string, SubjectResult>>;

// ---------- Util ----------
function toYMD(d: any): string {
  try {
    if (!d) return "";
    if (typeof d?.toDate === "function") d = d.toDate();
    const dt = typeof d === "string" ? new Date(d) : (d as Date);
    if (!(dt instanceof Date) || isNaN(dt.getTime())) return "";
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  } catch { return ""; }
}

const toNum = (v: any): number | undefined => {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v);
  return undefined;
};

// Firestore-д part1/part2 нь шууд тоо эсвэл {percentCorrect, numCorrect, numQuestions} байж болно
function extractPartPercent(x: any): number | undefined {
  const direct = toNum(x);
  if (direct !== undefined) return direct;

  if (x && typeof x === "object") {
    const pc = toNum(x.percentCorrect);
    if (pc !== undefined) return pc;

    const nc = toNum(x.numCorrect), nq = toNum(x.numQuestions);
    if (nc !== undefined && nq) {
      return Number(((nc / nq) * 100).toFixed(1));
    }
  }
  return undefined;
}

// Нийт хувийг гаргана: direct > жинлэсэн(p1/p2) > ганц хэсэг
function computeTotals(v: any): { total: number | null; part1?: number; part2?: number } {
  const direct = v?.percentCorrect ?? v?.percentage ?? v?.percent ?? v?.score ?? v?.average ?? v?.total;
  const directNum = typeof direct === "string" ? Number(direct) : direct;

  const p1 = extractPartPercent(v?.part1);
  const p2 = extractPartPercent(v?.part2);

  if (typeof directNum === "number" && isFinite(directNum)) {
    return { total: Number(directNum), part1: p1, part2: p2 };
  }

  // Жинлэсэн дундаж (асуултын тоогоор) — боломжтой үед
  const n1 = toNum(v?.part1?.numQuestions) ?? 0;
  const n2 = toNum(v?.part2?.numQuestions) ?? 0;
  if (typeof p1 === "number" && typeof p2 === "number" && (n1 + n2) > 0) {
    const total = Number(((p1 * n1 + p2 * n2) / (n1 + n2)).toFixed(1));
    return { total, part1: p1, part2: p2 };
  }

  // Ганц хэсэг байвал тэрийг нийт гэж үзнэ
  if (typeof p1 === "number") return { total: p1, part1: p1, part2: p2 };
  if (typeof p2 === "number") return { total: p2, part1: p1, part2: p2 };

  return { total: null, part1: p1, part2: p2 };
}

// ---------- Handler ----------
export async function GET(req: NextRequest) {
  try {
    const authz = req.headers.get("Authorization");
    if (!authz?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const token = authz.slice("Bearer ".length);
    const decoded = (await adminAuth.verifyIdToken(token)) as DecodedWithRole;

    // зөвшөөрөгдсөн сурагчийн id
    const email = ((decoded.email ?? "") as string).toLowerCase().trim();
    let studentId: string | null = null;

    const udoc = await adminDb.collection("users").doc(decoded.uid).get();
    if (udoc.exists) {
      const u = udoc.data() || {};
      const sid = String(u.studentId || u.studentID || u.student_id || "").trim();
      if (sid) studentId = sid;
    }
    if (!studentId && email) {
      for (const field of ["email", "parentEmail1", "parentEmail2"]) {
        const snap = await adminDb.collection("students").where(field, "==", email).limit(1).get();
        if (!snap.empty) { studentId = snap.docs[0].id; break; }
      }
    }
    if (!studentId) return NextResponse.json({ error: "STUDENT_NOT_FOUND" }, { status: 404 });

    // results/*
    const rSnap = await adminDb
      .collection("students").doc(studentId)
      .collection("results")
      .limit(1000)
      .get();

    const perSubject: Record<string, { totals: number[]; history: HistoryPoint[] }> = {};
    const subjectSet = new Set<string>();

    for (const d of rSnap.docs) {
      const v: any = d.data() || {};
      const subject = String(v.subject ?? "").trim();
      if (!subject) continue;
      subjectSet.add(subject);

      const { total, part1, part2 } = computeTotals(v);
      if (total == null) continue;

      const date =
        toYMD(v.updatedAt) ||
        toYMD(v.uploadedAt) ||
        toYMD(v.date) ||
        toYMD((d as any).updateTime?.toDate?.()) ||
        toYMD((d as any).createTime?.toDate?.()) ||
        "";

      if (!perSubject[subject]) perSubject[subject] = { totals: [], history: [] };
      perSubject[subject].totals.push(total);
      perSubject[subject].history.push({
        date,
        total: Number(total.toFixed(1)),
        part1: typeof part1 === "number" ? Number(part1.toFixed(1)) : undefined,
        part2: typeof part2 === "number" ? Number(part2.toFixed(1)) : undefined,
      });
    }

    // finalize
    const subjectRes: Record<string, SubjectResult> = {};
    Object.entries(perSubject).forEach(([subj, agg]) => {
      const avg = agg.totals.length
        ? Number((agg.totals.reduce((a, b) => a + b, 0) / agg.totals.length).toFixed(1))
        : 0;
      const history = agg.history
        .filter(h => !!h.date)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      subjectRes[subj] = { average: avg, history };
    });

    const payload: { subjects: string[]; results: ResultsByStudent } = {
      subjects: Array.from(subjectSet).sort(),
      results: { [studentId]: subjectRes },
    };
    return NextResponse.json(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/student/results] ERROR:", msg);
    return NextResponse.json({ error: "SERVER_ERROR", detail: msg }, { status: 500 });
  }
}