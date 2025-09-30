// src/app/api/teacher/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AllowedRole = "teacher" | "admin";
interface DecodedWithRole extends DecodedIdToken { role?: string | null }

type PartStats = {
  numQuestions: number | null;
  numCorrect: number | null;
  percentCorrect: number | null;
};

type UploadRow = {
  externalId: string; // заавал
  part1?: PartStats;
  part2?: PartStats;
};

type UploadPayload = {
  subject: string;            // хичээл
  class: string;              // анги
  date: string;               // YYYY-MM-DD
  quizName: string;           // шалгалтын нэр (файлын нэр)
  uploadedAt: string;         // ISO
  rows: UploadRow[];          // мөрүүд (externalId, part1/part2)
  sourceFiles?: { part1?: string; part2?: string };
};

/** ---------- helpers ---------- */
const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\-_\s]/gi, "").trim().replace(/\s+/g, "-").slice(0, 120);

const tsKey = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
};

const makeQuizId = (subject: string, quizName: string, uploadedAtISO: string) =>
  `${slug(subject)}__${slug(quizName)}__${tsKey(uploadedAtISO)}`;

const isFiniteNumber = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

function calcPercent(s?: PartStats): number | undefined {
  if (!s) return undefined;
  if (isFiniteNumber(s.percentCorrect)) return s.percentCorrect!;
  if (isFiniteNumber(s.numCorrect) && isFiniteNumber(s.numQuestions) && s.numQuestions! > 0) {
    return (s.numCorrect! / s.numQuestions!) * 100;
  }
  return undefined;
}

function calcTotalPercent(p1?: PartStats, p2?: PartStats): number | undefined {
  const hasFull1 = p1 && isFiniteNumber(p1.numCorrect) && isFiniteNumber(p1.numQuestions) && p1.numQuestions! > 0;
  const hasFull2 = p2 && isFiniteNumber(p2.numCorrect) && isFiniteNumber(p2.numQuestions) && p2.numQuestions! > 0;

  if (hasFull1 && hasFull2) {
    const totalCorrect = (p1!.numCorrect as number) + (p2!.numCorrect as number);
    const totalQuestions = (p1!.numQuestions as number) + (p2!.numQuestions as number);
    return (totalCorrect / totalQuestions) * 100;
  }
  
  const p1p = calcPercent(p1);
  const p2p = calcPercent(p2);
  
  if (isFiniteNumber(p1p) && isFiniteNumber(p2p)) return (p1p! + p2p!) / 2;
  if (isFiniteNumber(p1p)) return p1p!;
  if (isFiniteNumber(p2p)) return p2p!;
  return undefined;
}

type StudentDoc = {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  class?: string;
  externalId?: string | number | null;
};

export async function POST(req: NextRequest) {
  try {
    // 1) Auth
    const authz = req.headers.get("Authorization");
    if (!authz?.startsWith("Bearer ")) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }
    const idToken = authz.slice("Bearer ".length);
    const decoded = (await adminAuth.verifyIdToken(idToken)) as DecodedWithRole;
    const role = decoded.role as AllowedRole | undefined;
    if (!(role === "teacher" || role === "admin")) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    // 2) Body
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 400 }); }
    const payload = body as UploadPayload;

    if (
      !payload?.subject ||
      !payload?.class ||
      !payload?.date ||
      !payload?.quizName ||
      !payload?.uploadedAt ||
      !Array.isArray(payload.rows)
    ) {
      return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
    }

    const uploadedAtDate = new Date(payload.uploadedAt);
    if (Number.isNaN(+uploadedAtDate)) {
      return NextResponse.json({ ok: false, error: "BAD_DATE" }, { status: 400 });
    }

    const quizId = makeQuizId(payload.subject, payload.quizName, payload.uploadedAt);

    // 3) Students map (externalId -> {id,name,class})
    const extIds = Array.from(new Set(payload.rows.map(r => String(r.externalId).trim()).filter(Boolean)));
    const extNums = extIds.map(Number).filter((n) => Number.isFinite(n));

    const chunks = <T,>(arr: T[], size = 10): T[][] => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    };

    const tasks: Promise<FirebaseFirestore.QuerySnapshot>[] = [];
    if (extIds.length > 0) {
        for (const c of chunks(extIds, 10)) {
            tasks.push(adminDb.collection("students").where("externalId", "in", c).get());
        }
    }
    if (extNums.length > 0) {
        for (const c of chunks(extNums, 10)) {
            tasks.push(adminDb.collection("students").where("externalId", "in", c).get());
        }
    }

    const snaps = await Promise.all(tasks);
    const extToStudent = new Map<string, StudentDoc>();
    for (const snap of snaps) {
      snap.docs.forEach((doc) => {
        const v = doc.data();
        const firstName = String(v.firstName ?? v.firstname ?? "").trim();
        const lastName  = String(v.lastName  ?? v.lastname  ?? "").trim();
        const fullName  = [lastName, firstName].filter(Boolean).join(" ") || String(v.name ?? "NoName");
        const ext = v.externalId;
        if (ext !== undefined && ext !== null) {
          extToStudent.set(String(ext), {
            id: doc.id,
            firstName,
            lastName,
            name: fullName,
            class: v.class ?? v.grade ?? "N/A",
            externalId: v.externalId,
          });
        }
      });
    }

    // 4) quizzes/{quizId} upsert (metadata)
    const quizRef = adminDb.collection("quizzes").doc(quizId);
    await quizRef.set(
      {
        title: payload.quizName,
        quizName: payload.quizName,
        subject: payload.subject,
        class: payload.class,
        date: payload.date,
        uploadedAt: uploadedAtDate,
        uploadedBy: decoded.uid,
        uploadedByEmail: decoded.email ?? null,
        sourceFiles: payload.sourceFiles ?? {},
        updatedAt: new Date(),
      },
      { merge: true }
    );

    // 5) results_flat-д бичих
    type FlatRow = {
      docId: string;
      data: any; // Simplified for brevity
    };

    const toWrites: FlatRow[] = [];
    const scoresForStats: number[] = [];

    for (const row of payload.rows) {
      const key = String(row.externalId).trim();
      const student = extToStudent.get(key) || extToStudent.get(String(Number(key)));
      if (!student) continue;

      const total = calcTotalPercent(row.part1, row.part2);
      const score = isFiniteNumber(total) ? Number(total.toFixed(2)) : null;

      if (isFiniteNumber(score)) scoresForStats.push(score);

      const docId = `${quizId}__${student.id}`;
      toWrites.push({
        docId,
        data: {
          quizId,
          studentId: student.id,
          studentName: student.name ?? "NoName",
          class: student.class ?? payload.class,
          subject: payload.subject,
          date: payload.date,
          score,
          raw: (row.part1 || row.part2) ? { part1: row.part1 ?? null, part2: row.part2 ?? null } : undefined,
          uploadedAt: uploadedAtDate,
          updatedAt: new Date(),
        },
      });
    }

    // batch write (chunks of 500)
    for (let i = 0; i < toWrites.length; i += 500) {
      const slice = toWrites.slice(i, i + 500);
      const batch = adminDb.batch();
      slice.forEach((w) => {
        const ref = adminDb.collection("results_flat").doc(w.docId);
        batch.set(ref, w.data, { merge: true });
      });
      await batch.commit();
    }

    // 6) quizzes/{quizId} дээр статистик шинэчлэх
    const totalStudents = toWrites.length;
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const stats = {
      avg: avg(scoresForStats),
      max: scoresForStats.length ? Math.max(...scoresForStats) : null,
      min: scoresForStats.length ? Math.min(...scoresForStats) : null,
    };

    if (stats.avg !== null) {
        stats.avg = Number(stats.avg.toFixed(2));
    }

    await quizRef.set(
      {
        totalStudents,
        stats,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return NextResponse.json(
      {
        ok: true,
        quizId,
        counts: {
          matchedStudents: totalStudents,
          inputRows: payload.rows.length,
        },
        stats,
      },
      { status: 200 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[teacher/upload] SERVER_ERROR:", msg);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR", detail: msg }, { status: 500 });
  }
}