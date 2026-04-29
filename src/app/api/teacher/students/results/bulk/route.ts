// src/app/api/teacher/students/results/bulk/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DecodedWithRole extends DecodedIdToken {
  role?: string;
}

function noStore(body: unknown, status = 200) {
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
    if (typeof nc === "number" && typeof nq === "number" && nq > 0) {
      return Number(((nc / nq) * 100).toFixed(1));
    }
  }
  return undefined;
}

function computeTotals(row: {
  score?: unknown;
  raw?: Record<string, unknown>;
}): { total: number | null; part1?: number; part2?: number } {
  const direct = toNum(row.score);
  const p1 = extractPartPercent(row?.raw?.part1);
  const p2 = extractPartPercent(row?.raw?.part2);

  if (typeof direct === "number") return { total: Number(direct), part1: p1, part2: p2 };

  const n1 = toNum((row?.raw?.part1 as any)?.numQuestions) ?? 0;
  const n2 = toNum((row?.raw?.part2 as any)?.numQuestions) ?? 0;
  if (typeof p1 === "number" && typeof p2 === "number" && n1 + n2 > 0) {
    const total = Number(((p1 * n1 + p2 * n2) / (n1 + n2)).toFixed(1));
    return { total, part1: p1, part2: p2 };
  }

  if (typeof p1 === "number") return { total: p1, part1: p1, part2: p2 };
  if (typeof p2 === "number") return { total: p2, part1: p1, part2: p2 };
  return { total: null, part1: p1, part2: p2 };
}

export type StudentResultEntry = {
  subjects: string[];
  results: Record<
    string,
    {
      average: number;
      history: Array<{
        date: string;
        total: number;
        part1?: number;
        part2?: number;
      }>;
    }
  >;
};

export async function GET(req: NextRequest) {
  try {
    // ---- Auth: teacher эсвэл admin ----
    const authz = req.headers.get("Authorization");
    if (!authz?.startsWith("Bearer "))
      return noStore({ error: "UNAUTHORIZED" }, 401);

    const token = authz.slice("Bearer ".length);
    let decoded: DecodedWithRole;
    try {
      decoded = (await adminAuth.verifyIdToken(token)) as DecodedWithRole;
    } catch {
      return noStore({ error: "INVALID_TOKEN" }, 401);
    }

    if (!["teacher", "admin"].includes(decoded.role ?? ""))
      return noStore({ error: "FORBIDDEN" }, 403);

    // results_flat коллекцоос бүх мөр татах
    const snap = await adminDb
      .collection("results_flat")
      .select("studentId", "subject", "date", "score", "raw")
      .limit(10000)
      .get();

    // Сурагч бүрийн дүнг хичээлээр ангилах
    const byStudent: Record<
      string,
      {
        perSubject: Record<
          string,
          {
            totals: number[];
            history: Array<{
              date: string;
              total: number;
              part1?: number;
              part2?: number;
            }>;
          }
        >;
        subjects: Set<string>;
      }
    > = {};

    for (const d of snap.docs) {
      const v = d.data() as {
        studentId?: string;
        subject?: string;
        date?: string;
        score?: number | string;
        raw?: Record<string, unknown>;
      };

      const studentId = String(v.studentId ?? "").trim();
      const subject = String(v.subject ?? "").trim();
      if (!studentId || !subject) continue;

      const { total, part1, part2 } = computeTotals({ score: v.score, raw: v.raw });
      if (total == null) continue;

      const date =
        typeof v.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.date) ? v.date : "";

      if (!byStudent[studentId]) {
        byStudent[studentId] = { perSubject: {}, subjects: new Set() };
      }
      byStudent[studentId].subjects.add(subject);

      if (!byStudent[studentId].perSubject[subject]) {
        byStudent[studentId].perSubject[subject] = { totals: [], history: [] };
      }

      byStudent[studentId].perSubject[subject].totals.push(total);
      byStudent[studentId].perSubject[subject].history.push({
        date,
        total: Number(total.toFixed(1)),
        ...(typeof part1 === "number" ? { part1: Number(part1.toFixed(1)) } : {}),
        ...(typeof part2 === "number" ? { part2: Number(part2.toFixed(1)) } : {}),
      });
    }

    // Эцсийн формат
    const data: Record<string, StudentResultEntry> = {};

    Object.entries(byStudent).forEach(([studentId, agg]) => {
      const results: StudentResultEntry["results"] = {};

      Object.entries(agg.perSubject).forEach(([subj, subjData]) => {
        const avg = subjData.totals.length
          ? Number(
              (
                subjData.totals.reduce((a, b) => a + b, 0) / subjData.totals.length
              ).toFixed(1)
            )
          : 0;

        const history = subjData.history
          .filter((h) => !!h.date)
          .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

        results[subj] = { average: avg, history };
      });

      data[studentId] = {
        subjects: Array.from(agg.subjects).sort(),
        results,
      };
    });

    return noStore({ ok: true, data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[teacher/students/results/bulk] ERROR:", msg);
    return noStore({ error: "SERVER_ERROR", detail: msg }, 500);
  }
}
