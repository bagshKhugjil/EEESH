// src/app/api/teacher/students/results/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AllowedRole = "teacher" | "admin";
interface DecodedWithRole extends DecodedIdToken { role?: string | null }
const isAllowedRole = (r?: string | null): r is AllowedRole => r === "teacher" || r === "admin";

function noStoreJson(body: unknown, status = 200) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

type PartStats = {
  numQuestions: number | null;
  numCorrect: number | null;
  percentCorrect: number | null;
};

const toNum = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
};

function recomputePart(prev: unknown, nextNumCorrect: number): PartStats {
  const obj = (prev && typeof prev === "object") ? (prev as Record<string, unknown>) : {};
  const nq = toNum(obj.numQuestions) ?? 0;
  const nc = Math.max(0, Math.min(nq, Math.round(nextNumCorrect)));
  const pct = nq > 0 ? Number(((nc / nq) * 100).toFixed(2)) : null;
  return { numQuestions: nq, numCorrect: nc, percentCorrect: pct };
}

function totalFromParts(p1?: PartStats | null, p2?: PartStats | null): number | null {
  const n1 = p1?.numQuestions ?? 0;
  const n2 = p2?.numQuestions ?? 0;
  const c1 = p1?.numCorrect ?? 0;
  const c2 = p2?.numCorrect ?? 0;
  if (n1 + n2 > 0) {
    return Number((((c1 + c2) / (n1 + n2)) * 100).toFixed(2));
  }
  if (typeof p1?.percentCorrect === "number") return p1.percentCorrect;
  if (typeof p2?.percentCorrect === "number") return p2.percentCorrect;
  return null;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const resultId = decodeURIComponent(id ?? "");
    if (!resultId) return noStoreJson({ ok: false, error: "MISSING_ID" }, 400);

    // ---- Auth
    const authz = req.headers.get("Authorization");
    if (!authz?.startsWith("Bearer ")) return noStoreJson({ ok: false, error: "UNAUTHORIZED" }, 401);
    const token = authz.slice("Bearer ".length);

    let decoded: DecodedWithRole;
    try {
      decoded = (await adminAuth.verifyIdToken(token)) as DecodedWithRole;
    } catch {
      return noStoreJson({ ok: false, error: "INVALID_TOKEN" }, 401);
    }
    if (!isAllowedRole(decoded.role)) return noStoreJson({ ok: false, error: "FORBIDDEN_ROLE" }, 403);

    // ---- Body
    let body: unknown;
    try { body = await req.json(); } catch { return noStoreJson({ ok: false, error: "BAD_JSON" }, 400); }
    const { part1NumCorrect, part2NumCorrect } = (body ?? {}) as {
      part1NumCorrect?: number | null;
      part2NumCorrect?: number | null;
    };

    const has1 = part1NumCorrect !== undefined && part1NumCorrect !== null;
    const has2 = part2NumCorrect !== undefined && part2NumCorrect !== null;
    if (!has1 && !has2) {
      return noStoreJson({ ok: false, error: "NOTHING_TO_UPDATE" }, 400);
    }

    // ---- Doc fetch
    const ref = adminDb.collection("results_flat").doc(resultId);
    const snap = await ref.get();
    if (!snap.exists) return noStoreJson({ ok: false, error: "RESULT_NOT_FOUND" }, 404);
    const cur = snap.data() as {
      quizId?: string;
      raw?: { part1?: unknown; part2?: unknown };
    };

    // ---- Owner check via quizzes/{quizId}.uploadedBy (admin = bypass)
    const quizId = cur.quizId;
    if (!quizId) return noStoreJson({ ok: false, error: "MISSING_QUIZ_ID" }, 400);

    if (decoded.role !== "admin") {
      const quizSnap = await adminDb.collection("quizzes").doc(quizId).get();
      if (!quizSnap.exists) return noStoreJson({ ok: false, error: "QUIZ_NOT_FOUND" }, 404);
      const quiz = quizSnap.data() as { uploadedBy?: string; uploadedByEmail?: string };
      const ownerByUid = (quiz?.uploadedBy ?? "") === (decoded.uid ?? "");
      const ownerByEmail =
        (quiz?.uploadedByEmail ?? "").toLowerCase() === (decoded.email ?? "").toLowerCase();
      if (!(ownerByUid || ownerByEmail)) {
        return noStoreJson({ ok: false, error: "FORBIDDEN_NOT_OWNER" }, 403);
      }
    }

    // ---- Recompute
    const prevP1 = cur.raw?.part1;
    const prevP2 = cur.raw?.part2;

    const nextP1: PartStats | null = has1
      ? recomputePart(prevP1, Number(part1NumCorrect))
      : (prevP1 && typeof prevP1 === "object" ? (prevP1 as PartStats) : null);
    const nextP2: PartStats | null = has2
      ? recomputePart(prevP2, Number(part2NumCorrect))
      : (prevP2 && typeof prevP2 === "object" ? (prevP2 as PartStats) : null);

    // numQuestions = 0 байх үед input хүлээж авахгүй
    if (has1 && (nextP1?.numQuestions ?? 0) === 0) {
      return noStoreJson({ ok: false, error: "PART1_NOT_EDITABLE" }, 400);
    }
    if (has2 && (nextP2?.numQuestions ?? 0) === 0) {
      return noStoreJson({ ok: false, error: "PART2_NOT_EDITABLE" }, 400);
    }

    const newTotal = totalFromParts(nextP1, nextP2);

    // ---- Write
    await ref.set(
      {
        score: newTotal,
        raw: {
          ...(nextP1 ? { part1: nextP1 } : { part1: prevP1 ?? null }),
          ...(nextP2 ? { part2: nextP2 } : { part2: prevP2 ?? null }),
        },
        editedBy: decoded.uid,
        editedByEmail: decoded.email ?? null,
        editedAt: new Date(),
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return noStoreJson({
      ok: true,
      id: resultId,
      score: newTotal,
      part1: nextP1,
      part2: nextP2,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[PATCH /api/teacher/students/results/:id] SERVER_ERROR:", msg);
    return noStoreJson({ ok: false, error: "SERVER_ERROR", detail: msg }, 500);
  }
}
