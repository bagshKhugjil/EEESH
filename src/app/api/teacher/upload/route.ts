import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";

type AllowedRole = "teacher" | "admin";

interface DecodedWithRole extends DecodedIdToken {
  role?: string;
}

type PartStats = {
  numQuestions: number | null;
  numCorrect: number | null;
  percentCorrect: number | null;
};

type UploadRow = {
  externalId: string; // зөвхөн externalId-аар танина
  part1?: PartStats;
  part2?: PartStats;
};

type UploadPayload = {
  subject: string;            // хичээл
  quizName: string;           // файлын нэрээр өг (фронтоос)
  uploadedAt: string;         // ISO
  rows: UploadRow[];          // CSV/Excel нэгтгэсний дараах мөрүүд
  sourceFiles: { part1?: string; part2?: string }; // (сонголттой) файл нэр эсвэл линк
};

/** slugify helper */
function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\-_\s]/gi, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 120);
}

/** yyyymmddHHMM from ISO */
function tsKey(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}${mm}${dd}${hh}${mi}`;
}

/** Давтагдахгүй, тогтвортой quizId */
function makeQuizId(subject: string, quizName: string, uploadedAtISO: string): string {
  return `${slug(subject)}__${slug(quizName)}__${tsKey(uploadedAtISO)}`;
}

/** chunk helper (Firestore 'in' <= 10) */
function chunk<T>(arr: T[], size = 10): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Тоон хувь бодох (0..100), аль нэг нь null бол undefined */
function calcPercent(s?: PartStats): number | undefined {
  if (!s) return undefined;
  if (typeof s.percentCorrect === "number" && Number.isFinite(s.percentCorrect)) {
    return s.percentCorrect;
  }
  if (
    typeof s.numCorrect === "number" &&
    typeof s.numQuestions === "number" &&
    s.numQuestions > 0
  ) {
    return (s.numCorrect / s.numQuestions) * 100;
  }
  return undefined;
}

/** Нийт хувь (хоёр хэсгээс): боломжтой тооцооллыг уян хатан байдлаар хийе */
function calcTotalPercent(p1?: PartStats, p2?: PartStats): number | undefined {
  const p1p = calcPercent(p1);
  const p2p = calcPercent(p2);

  const hasFull1 =
    p1 &&
    typeof p1.numCorrect === "number" &&
    typeof p1.numQuestions === "number" &&
    p1.numQuestions > 0;

  const hasFull2 =
    p2 &&
    typeof p2.numCorrect === "number" &&
    typeof p2.numQuestions === "number" &&
    p2.numQuestions > 0;

  if (hasFull1 && hasFull2) {
    const totalCorrect = (p1!.numCorrect as number) + (p2!.numCorrect as number);
    const totalQuestions = (p1!.numQuestions as number) + (p2!.numQuestions as number);
    return (totalCorrect / totalQuestions) * 100;
  }

  if (typeof p1p === "number" && typeof p2p === "number") return (p1p + p2p) / 2;
  if (typeof p1p === "number") return p1p;
  if (typeof p2p === "number") return p2p;
  return undefined;
}

/** ЭНЭ ХОЁР helper нь TS алдааг засна */
const isFiniteNumber = (x: unknown): x is number =>
  typeof x === "number" && Number.isFinite(x);

const compactNumbers = (arr: Array<number | null | undefined>): number[] =>
  arr.filter(isFiniteNumber);

export async function POST(req: NextRequest) {
  try {
    // -------------------- 1) Auth --------------------
    const authz = req.headers.get("Authorization");
    if (!authz?.startsWith("Bearer ")) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }
    const idToken = authz.slice("Bearer ".length);
    const decoded = (await adminAuth.verifyIdToken(idToken)) as DecodedWithRole;
    const role = decoded.role as AllowedRole | undefined;
    if (!role || (role !== "teacher" && role !== "admin")) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    // -------------------- 2) Body validate --------------------
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 400 });
    }

    const payload = body as UploadPayload;
    if (
      !payload?.subject ||
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

    // -------------------- 3) externalId -> student uid map --------------------
    const uniqueExtIds = Array.from(
      new Set(payload.rows.map((r) => String(r.externalId).trim()).filter(Boolean))
    );
    const uniqueExtNums = uniqueExtIds
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n)) as number[];

    const tasks: Promise<FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>>[] = [];
    for (const c of chunk(uniqueExtIds, 10)) {
      tasks.push(adminDb.collection("students").where("externalId", "in", c).get());
    }
    for (const c of chunk(uniqueExtNums, 10)) {
      tasks.push(adminDb.collection("students").where("externalId", "in", c).get());
    }

    const snaps = await Promise.all(tasks);
    const extToUid = new Map<string, string>();
    for (const snap of snaps) {
      snap.forEach((doc) => {
        const ext = doc.get("externalId");
        if (ext !== undefined && ext !== null) {
          extToUid.set(String(ext), doc.id);
        }
      });
    }

    // -------------------- 4) quizzes/{quizId} upsert (metadata) --------------------
    const hasPart1 = payload.rows.some((r) => !!r.part1);
    const hasPart2 = payload.rows.some((r) => !!r.part2);
    const quizRef = adminDb.collection("quizzes").doc(quizId);

    await quizRef.set(
      {
        subject: payload.subject,
        quizName: payload.quizName,
        sourceFiles: payload.sourceFiles ?? {},
        uploadedAt: uploadedAtDate,
        uploadedBy: decoded.uid,
        uploadedByEmail: decoded.email ?? null,
        parts: { part1: hasPart1, part2: hasPart2 },
        updatedAt: new Date(),
      },
      { merge: true }
    );

    // -------------------- 5) Write student results (parallel) --------------------
    type WriteResult = {
      inserted: 1 | 0;
      updated: 1 | 0;
      extId?: string;
      p1?: number;
      p2?: number;
      total?: number;
    };

    const writes = payload.rows.map<Promise<WriteResult>>(async (row) => {
      const key = String(row.externalId).trim();
      const uid = extToUid.get(key) ?? extToUid.get(String(Number(key)));
      if (!uid) {
        return { inserted: 0, updated: 0 };
      }

      const p1 = calcPercent(row.part1);
      const p2 = calcPercent(row.part2);
      const total = calcTotalPercent(row.part1, row.part2);

      const resRef = adminDb.collection("students").doc(uid).collection("results").doc(quizId);
      const existed = await resRef.get();

      await resRef.set(
        {
          quizId,
          quizName: payload.quizName,
          subject: payload.subject,
          uploadedAt: uploadedAtDate,
          updatedAt: new Date(),
          ...(row.part1 ? { part1: row.part1 } : {}),
          ...(row.part2 ? { part2: row.part2 } : {}),
        },
        { merge: true }
      );

      return {
        inserted: existed.exists ? 0 : 1,
        updated: existed.exists ? 1 : 0,
        extId: key,
        p1,
        p2,
        total,
      };
    });

    const results = await Promise.all(writes);

    // -------------------- 6) Aggregate averages & studentIds --------------------
    const matched = results.filter((r) => r.extId);

    const studentIds = Array.from(new Set(matched.map((r) => r.extId!)));

    // Энд (number | undefined) массиваа найдвартай цэвэрлэнэ (TS OK)
    const p1List = compactNumbers(matched.map((r) => r.p1 ?? undefined));
    const p2List = compactNumbers(matched.map((r) => r.p2 ?? undefined));
    const totalList = compactNumbers(matched.map((r) => r.total ?? undefined));

    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

    const part1Avg = avg(p1List);
    const part2Avg = avg(p2List);
    const totalAvg = avg(totalList);

    await quizRef.set(
      {
        studentIds,      // externalId-ууд (давхардалгүй)
        part1Avg,
        part2Avg,
        totalAvg,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    // -------------------- 7) Done --------------------
    const inserted = results.reduce((acc, r) => acc + r.inserted, 0);
    const updated = results.reduce((acc, r) => acc + r.updated, 0);

    return NextResponse.json(
      {
        ok: true,
        quizId,
        inserted,
        updated,
        counts: {
          studentsMatched: studentIds.length,
          rows: payload.rows.length,
        },
        aggregates: { part1Avg, part2Avg, totalAvg },
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("teacher/upload error:", msg);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}