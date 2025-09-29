//api/teacher/quizzes/[id]/results
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";
import { FieldPath } from "firebase-admin/firestore"; // ✅ зөв импорт

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AllowedRole = "teacher" | "admin";
interface DecodedWithRole extends DecodedIdToken { role?: string | null }

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
    const { id } = await context.params; // quizId

    // ---- Owner check (teacher өөрийнхөө quiz л уншина) ----
    const quizSnap = await adminDb.collection("quizzes").doc(id).get();
    if (!quizSnap.exists) {
      return NextResponse.json({ ok: false, error: "QUIZ_NOT_FOUND" }, { status: 404 });
    }
    const quiz = quizSnap.data() as any;
    if (role === "teacher" && quiz?.uploadedBy !== decoded.uid) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    // ---- Query params ----
    const { searchParams } = new URL(req.url);
    const pageSizeParam = Number(searchParams.get("limit") || 200);
    const limit = Number.isFinite(pageSizeParam) ? Math.max(1, Math.min(500, pageSizeParam)) : 200;
    const cursor = searchParams.get("cursor") || undefined; // last doc id

    // ---- results_flat query ----
    let q = adminDb
      .collection("results_flat")
      .where("quizId", "==", id)
      .orderBy(FieldPath.documentId()); // ✅ зөв дуудлага

    if (cursor) {
      q = q.startAfter(cursor);
    }

    const snap = await q.limit(limit).get();

    const items = snap.docs.map((d) => {
      const v = d.data() as any;
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

    return NextResponse.json({ ok: true, items, nextCursor }, { status: 200 });
  } catch (e) {
    console.error("[GET /api/teacher/quizzes/:id/results] SERVER_ERROR:", e);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}