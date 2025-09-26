// src/app/api/teacher/results/dashboard/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AllowedRole = "teacher" | "admin";
interface DecodedWithRole extends DecodedIdToken { role?: AllowedRole | string }

type HistoryPoint = { date: string; score: number };
type SubjectResult = { average: number; rank?: number; history: HistoryPoint[] };
type ResultsByStudent = Record<string, Record<string, SubjectResult>>;
type DashboardData = {
  classes: string[];
  subjects: string[];
  students: { id: string; name: string; class: string }[];
  results: ResultsByStudent;
};

function toYMD(d: Date | string | FirebaseFirestore.Timestamp | undefined | null): string {
  if (!d) return "";
  let dateObj: Date;
  if (typeof d === "string") {
    const x = new Date(d); if (isNaN(x.getTime())) return ""; dateObj = x;
  } else if (typeof (d as any)?.toDate === "function") {
    dateObj = (d as FirebaseFirestore.Timestamp).toDate();
  } else if (d instanceof Date) {
    dateObj = d;
  } else return "";
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const dd = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function readScore(data: any): number | null {
  const candidates = [data?.score, data?.average, data?.percent, data?.percentage, data?.total];
  for (const v of candidates) {
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n === "number" && isFinite(n)) return n;
  }
  return null;
}

function isAllowed(role?: string | null): role is AllowedRole {
  return role === "teacher" || role === "admin";
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function GET(req: NextRequest) {
  try {
    // ---- Auth ----
    const authz = req.headers.get("Authorization");
    if (!authz?.startsWith("Bearer ")) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    const token = authz.slice("Bearer ".length);
    let decoded: DecodedWithRole;
    try { decoded = (await adminAuth.verifyIdToken(token)) as DecodedWithRole; }
    catch { return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 401 }); }
    if (!isAllowed(decoded.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

    // ---- Query params ----
    const { searchParams } = new URL(req.url);
    const classFilter = (searchParams.get("class") || "").trim();
    const studentId = (searchParams.get("studentId") || "").trim();
    const subjectFilter = (searchParams.get("subject") || "").trim();
    const dateFilter = (searchParams.get("date") || "").trim(); // YYYY-MM-DD
    const limitStudents = Math.min(Math.max(Number(searchParams.get("limitStudents") || 100), 1), 1000);
    const limitQuizzes = Math.min(Math.max(Number(searchParams.get("limitQuizzes") || 100), 1), 1000);

    // ---- Students ----
    let studentsSnap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>;
    if (studentId) {
      const doc = await adminDb.collection("students").doc(studentId).get();
      studentsSnap = {
        docs: doc.exists ? [doc as any] : [],
      } as any; // minimal shim to reuse mapping
    } else if (classFilter) {
      // Ангигаар where (талбар танай DB-д 'class' гэдгээр хадгалагддаг байх шаардлагатай)
      studentsSnap = await adminDb.collection("students").where("class", "==", classFilter).limit(limitStudents).get();
    } else {
      studentsSnap = await adminDb.collection("students").limit(limitStudents).get();
    }

    const students = studentsSnap.docs.map((d) => {
      const v = d.data() || {};
      return {
        id: d.id,
        name: (v.name ?? v.fullName ?? v.studentName ?? "NoName") as string,
        class: (v.class ?? v.grade ?? v.group ?? "N/A") as string,
      };
    });

    // Хэрэв ганц сурагч хайсан боловч олдоогүй бол хоосон payload
    if (studentId && students.length === 0) {
      return NextResponse.json<DashboardData>({ classes: [], subjects: [], students: [], results: {} }, { status: 200 });
    }

    // ---- Quizzes ----
    let quizzesQuery = adminDb.collection("quizzes") as FirebaseFirestore.Query;
    if (subjectFilter) quizzesQuery = quizzesQuery.where("subject", "==", subjectFilter);
    const quizzesSnap = await quizzesQuery.limit(limitQuizzes).get();

    // quizId -> { subject, date }
    const quizMap = new Map<string, { subject: string; date: string }>();
    const subjectSet = new Set<string>();
    const quizIds: string[] = [];
    quizzesSnap.docs.forEach((d) => {
      const v = d.data() || {};
      const subject = String(v.subject ?? "").trim();
      const date = toYMD(v.uploadedAt) || toYMD(v.date) || "";
      quizMap.set(d.id, { subject, date });
      if (subject) subjectSet.add(subject);
      quizIds.push(d.id);
    });

    // ---- Classes list ----
    const classes = Array.from(new Set(students.map((s) => s.class))).sort();

    // ---- Results (optimized path) ----
    const results: ResultsByStudent = {};

    // Хэрэв subjectFilter байгаа бол тухайн subject-ийн quizId-уудаар batch getAll хийж уншина
    const useBatchByQuizIds = subjectFilter && quizIds.length > 0;

    for (const st of students) {
      const perSubject: Record<string, { scores: number[]; history: HistoryPoint[] }> = {};

      if (useBatchByQuizIds) {
        // getAll нь 300 ref-ээс их бол багцалж авна (аюулгүй талаас 300-аар chunk хийе)
        const refChunks = chunk(
          quizIds.map((qid) => adminDb.collection("students").doc(st.id).collection("results").doc(qid)),
          300
        );

        for (const refs of refChunks) {
          const snaps = await adminDb.getAll(...refs);
          snaps.forEach((snap) => {
            if (!snap.exists) return;
            const qid = snap.id;
            const qm = quizMap.get(qid);
            if (!qm || !qm.subject) return;
            const score = readScore(snap.data());
            if (score == null) return;

            const date = qm.date || "";
            if (dateFilter && date !== dateFilter) return; // огноогоор шүүх

            if (!perSubject[qm.subject]) perSubject[qm.subject] = { scores: [], history: [] };
            perSubject[qm.subject].scores.push(score);
            perSubject[qm.subject].history.push({ date, score });
          });
        }
      } else {
        // subjectFilter байхгүй үед: тухайн сурагчийн бүх results-ийг (лимиттэй) авна
        const rSnap = await adminDb
          .collection("students")
          .doc(st.id)
          .collection("results")
          .limit(1000) // хамгаалалтын лимит
          .get();

        rSnap.docs.forEach((doc) => {
          const qid = doc.id;
          const qm = quizMap.get(qid);
          if (!qm || !qm.subject) return;
          const score = readScore(doc.data());
          if (score == null) return;

          const date = qm.date || "";
          if (dateFilter && date !== dateFilter) return;

          if (!perSubject[qm.subject]) perSubject[qm.subject] = { scores: [], history: [] };
          perSubject[qm.subject].scores.push(score);
          perSubject[qm.subject].history.push({ date, score });
        });
      }

      // subjectResult finalize
      const subjectRes: Record<string, SubjectResult> = {};
      Object.entries(perSubject).forEach(([subj, agg]) => {
        const avg = agg.scores.length
          ? Number((agg.scores.reduce((a, b) => a + b, 0) / agg.scores.length).toFixed(1))
          : 0;
        const history = agg.history
          .filter((h) => !!h.date)
          .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        subjectRes[subj] = { average: avg, history };
      });

      results[st.id] = subjectRes;
    }

    // subjects: зөвхөн буцаагдаж байгаа quizzes-оос
    const subjects = Array.from(subjectSet).sort();

    const payload: DashboardData = { classes, subjects, students, results };
    return NextResponse.json(payload, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[dashboard] SERVER_ERROR:", msg);
    return NextResponse.json({ error: "SERVER_ERROR", detail: msg }, { status: 500 });
  }
}