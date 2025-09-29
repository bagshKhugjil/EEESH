// src/app/api/teacher/files/[id]/route.ts
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

// 500-аар хэсэглэж batch устгана
async function deleteInChunks(refs: FirebaseFirestore.DocumentReference[], chunk = 500) {
  for (let i = 0; i < refs.length; i += chunk) {
    const batch = adminDb.batch();
    refs.slice(i, i + chunk).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> } // Next.js 15
) {
  try {
    const { id } = await context.params;
    const quizId = decodeURIComponent(id ?? "");
    if (!quizId) return noStoreJson({ ok: false, error: "MISSING_ID" }, 400);

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

    // ---- Quiz owner шалгах (quizzes/{quizId})
    const quizRef = adminDb.collection("quizzes").doc(quizId);
    const quizSnap = await quizRef.get();
    if (!quizSnap.exists) return noStoreJson({ ok: false, error: "QUIZ_NOT_FOUND" }, 404);

    const quiz = quizSnap.data() as {
      uploadedBy?: string | null;      // uid
      uploadedByEmail?: string | null; // хуучин өгөгдөлтэй нийцүүлэх зорилгоор
    } | undefined;

    const isAdmin = decoded.role === "admin";
    const ownerByUid   = (quiz?.uploadedBy ?? "") === (decoded.uid ?? "");
    const ownerByEmail = (quiz?.uploadedByEmail ?? "").toLowerCase() === (decoded.email ?? "").toLowerCase();

    if (!(isAdmin || ownerByUid || ownerByEmail)) {
      return noStoreJson({ ok: false, error: "FORBIDDEN_NOT_OWNER" }, 403);
    }

    // ---- results_flat дээрх бүх бичлэгийг quizId-аар олж устгана
    // (students/results БҮҮ ашигла — шинэ схемд хэрэггүй)
    const resultsSnap = await adminDb
      .collection("results_flat")
      .where("quizId", "==", quizId)
      .get();

    const resultRefs = resultsSnap.docs.map((d) => d.ref);
    if (resultRefs.length) {
      await deleteInChunks(resultRefs, 500);
    }

    // ---- quizzes/{quizId} doc-ийг устгана
    await quizRef.delete();

    return noStoreJson({ ok: true, quizId, deletedResults: resultRefs.length }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[DELETE /api/teacher/files/:id] SERVER_ERROR:", msg);
    return noStoreJson({ ok: false, error: "SERVER_ERROR", detail: msg }, 500);
  }
}