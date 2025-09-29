// src/app/api/student/results/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AllowedRole = "student" | "teacher" | "admin";
interface DecodedWithRole extends DecodedIdToken { role?: AllowedRole | string }

// ---------- Types ----------
type HistoryPoint = { date: string; total: number; part1?: number; part2?: number };
type SubjectResult = { average: number; history: HistoryPoint[] };
type ResultsByStudent = Record<string, Record<string, SubjectResult>>;

// ---------- Helpers ----------
function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

const toNum = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
};

function extractPartPercent(x: unknown): number | undefined {
  const direct = toNum(x);
  if (direct !== undefined) return direct;

  if (x && typeof x === "object") {
    const obj = x as Record<string, unknown>;
    const pc = toNum(obj.percentCorrect);
    if (pc !== undefined) return pc;
    const nc = toNum(obj.numCorrect);
    const nq = toNum(obj.numQuestions);
    if (nc !== undefined && nq && nq > 0) return Number(((nc / nq) * 100).toFixed(1));
  }
  return undefined;
}

function computeTotals(row: { score?: unknown; raw?: any }): { total: number | null; part1?: number; part2?: number } {
  const direct = toNum(row.score);
  const p1 = extractPartPercent(row?.raw?.part1);
  const p2 = extractPartPercent(row?.raw?.part2);

  if (typeof direct === "number") return { total: Number(direct), part1: p1, part2: p2 };

  // Weighted by questions if available
  const n1 = toNum(row?.raw?.part1?.numQuestions) ?? 0;
  const n2 = toNum(row?.raw?.part2?.numQuestions) ?? 0;
  if (typeof p1 === "number" && typeof p2 === "number" && (n1 + n2) > 0) {
    const total = Number(((p1 * n1 + p2 * n2) / (n1 + n2)).toFixed(1));
    return { total, part1: p1, part2: p2 };
  }

  if (typeof p1 === "number") return { total: p1, part1: p1, part2: p2 };
  if (typeof p2 === "number") return { total: p2, part1: p1, part2: p2 };
  return { total: null, part1: p1, part2: p2 };
}

// ---------- Handler ----------
export async function GET(req: NextRequest) {
  try {
    // 1) Auth
    const authz = req.headers.get("Authorization");
    if (!authz?.startsWith("Bearer ")) return noStoreJson({ error: "UNAUTHORIZED" }, 401);
    const token = authz.slice("Bearer ".length);

    let decoded: DecodedWithRole;
    try {
      decoded = (await adminAuth.verifyIdToken(token)) as DecodedWithRole;
    } catch {
      return noStoreJson({ error: "INVALID_TOKEN" }, 401);
    }

    const uid = decoded.uid;
    const email = String(decoded.email ?? "").toLowerCase().trim();

    // 2) studentId олох (users/{uid}.studentId → students.email/parentEmailX fallback)
    let studentId: string | null = null;

    const linkDoc = await adminDb.collection("users").doc(uid).get();
    if (linkDoc.exists) {
      const u = linkDoc.data() || {};
      const sid = String(u.studentId || u.studentID || u.student_id || "").trim();
      if (sid) studentId = sid;
    }

    if (!studentId && email) {
      for (const field of ["email", "parentEmail1", "parentEmail2"] as const) {
        const snap = await adminDb.collection("students").where(field, "==", email).select().limit(1).get();
        if (!snap.empty) { studentId = snap.docs[0].id; break; }
      }
    }

    if (!studentId) return noStoreJson({ error: "STUDENT_NOT_FOUND" }, 404);

    // 3) results_flat-аас тухайн оюутны бүх дүнг хамгийн бага талбараар унших
    // fields: subject, date(YYYY-MM-DD), score, raw.part1, raw.part2
    const resSnap = await adminDb
      .collection("results_flat")
      .where("studentId", "==", studentId)
      .select("subject", "date", "score", "raw.part1", "raw.part2")
      .limit(1000)
      .get();

    // 4) Агрегац: subject -> { average, history[] }
    const perSubject: Record<string, { totals: number[]; history: HistoryPoint[] }> = {};
    const subjectSet = new Set<string>();

    for (const d of resSnap.docs) {
      const v = d.data() as {
        subject?: string;
        date?: string;
        score?: number | string;
        raw?: { part1?: unknown; part2?: unknown };
      };

      const subject = String(v.subject ?? "").trim();
      if (!subject) continue;
      subjectSet.add(subject);

      const { total, part1, part2 } = computeTotals({ score: v.score, raw: v.raw });
      if (total == null) continue;

      // date нь `YYYY-MM-DD` хэлбэр гэж тохирсон
      const date = (typeof v.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.date)) ? v.date : "";

      if (!perSubject[subject]) perSubject[subject] = { totals: [], history: [] };
      perSubject[subject].totals.push(total);
      perSubject[subject].history.push({
        date,
        total: Number(total.toFixed(1)),
        part1: typeof part1 === "number" ? Number(part1.toFixed(1)) : undefined,
        part2: typeof part2 === "number" ? Number(part2.toFixed(1)) : undefined,
      });
    }

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

    return noStoreJson(payload, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/student/results] ERROR:", msg);
    return noStoreJson({ error: "SERVER_ERROR", detail: msg }, 500);
  }
}