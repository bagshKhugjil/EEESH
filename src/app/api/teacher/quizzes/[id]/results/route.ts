// /api/teacher/quizzes/[id]/results/route.ts

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";
import { FieldPath } from "firebase-admin/firestore";
import { createHash } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AllowedRole = "teacher" | "admin";
interface DecodedWithRole extends DecodedIdToken {
  role?: string | null;
}

type ResultFlatDocumentData = {
  studentId: string;
  studentName: string;
  class: string;
  subject: string;
  date: string;
  score?: number | null;
  raw?: object | null;
};

async function generateETagForQuizResults(quizId: string): Promise<string> {
  const baseQuery = adminDb.collection("results_flat").where("quizId", "==", quizId);
  const countSnap = await baseQuery.count().get();
  const count = countSnap.data().count;

  const etagString = `results-count-${count}`;
  const hash = createHash("md5").update(etagString).digest("hex");
  return `"${hash}"`;
}

// ЗАСВАР 1: `context.params`-г Promise болгож зөв төрлийг зааж өгөв.
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // ---- Auth ----
    const authz = req.headers.get("Authorization");
    if (!authz?.startsWith("Bearer ")) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }
    const token = authz.slice("Bearer ".length);
    const decoded = (await adminAuth.verifyIdToken(token)) as DecodedWithRole;
    const role = decoded.role as AllowedRole | undefined;
    if (!(role === "teacher" || role === "admin")) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    // ---- Params ----
    // ЗАСВАР 2: Promise-г `await` ашиглан зөв тайлав.
    const { id: quizId } = await context.params;

    // ---- Quiz existence check ----
    const quizSnap = await adminDb.collection("quizzes").doc(quizId).get();
    if (!quizSnap.exists) {
      return NextResponse.json({ ok: false, error: "QUIZ_NOT_FOUND" }, { status: 404 });
    }
    
    // --- ETag-н логик ---
    const currentETag = await generateETagForQuizResults(quizId);
    const clientETag = req.headers.get("if-none-match");

    if (clientETag === currentETag) {
      return new NextResponse(null, { status: 304 });
    }

    // ---- Query params (Pagination) ----
    const { searchParams } = new URL(req.url);
    const pageSizeParam = Number(searchParams.get("limit") || 200);
    const limit = Number.isFinite(pageSizeParam) ? Math.max(1, Math.min(500, pageSizeParam)) : 200;
    const cursor = searchParams.get("cursor") || undefined;

    // ---- results_flat query ----
    let q = adminDb
      .collection("results_flat")
      .where("quizId", "==", quizId)
      .orderBy(FieldPath.documentId());

    if (cursor) {
      q = q.startAfter(cursor);
    }

    const snap = await q.limit(limit).get();
    const items = snap.docs.map((d) => {
      const v = d.data() as ResultFlatDocumentData;
      return {
        id: d.id,
        studentId: v.studentId,
        studentName: v.studentName,
        class: v.class,
        subject: v.subject,
        date: v.date,
        score: v.score ?? null,
        raw: v.raw ?? undefined,
      };
    });

    const nextCursor = snap.docs.length === limit ? snap.docs[snap.docs.length - 1].id : null;

    const response = NextResponse.json({ ok: true, items, nextCursor }, { status: 200 });
    response.headers.set("ETag", currentETag);
    return response;

  } catch (e) {
    const err = e as Error;
    console.error(`[GET /api/teacher/quizzes/:id/results] SERVER_ERROR:`, err.message, err.stack);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR", detail: err.message }, { status: 500 });
  }
}