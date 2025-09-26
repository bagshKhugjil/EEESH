// src/app/api/teacher/files/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AllowedRole = "teacher" | "admin";
interface DecodedWithRole extends DecodedIdToken { role?: string; }
const isAllowedRole = (r?: string | null): r is AllowedRole => r === "teacher" || r === "admin";

/** Batch helper: refs-үүдийг 500-аар хэсэгчлэн устгах */
async function deleteDocRefsInChunks(
  refs: FirebaseFirestore.DocumentReference[],
  chunkSize = 500
) {
  for (let i = 0; i < refs.length; i += chunkSize) {
    const slice = refs.slice(i, i + chunkSize);
    const batch = adminDb.batch();
    slice.forEach(ref => batch.delete(ref));
    await batch.commit();
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> } // ⬅️ Next 15: params нь Promise болсон
) {
  try {
    const { id } = await context.params;            // ⬅️ Promise-оос задлана
    const quizId = decodeURIComponent(id ?? "");
    if (!quizId) {
      return NextResponse.json({ ok: false, error: "MISSING_ID" }, { status: 400 });
    }

    // 1) Auth
    const authz = req.headers.get("Authorization");
    if (!authz?.startsWith("Bearer ")) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }
    const idToken = authz.slice("Bearer ".length);

    let decoded: DecodedWithRole;
    try {
      decoded = (await adminAuth.verifyIdToken(idToken)) as DecodedWithRole;
    } catch (e) {
      console.error("[DELETE files/:id] verifyIdToken:", e);
      return NextResponse.json({ ok: false, error: "INVALID_TOKEN" }, { status: 401 });
    }
    if (!isAllowedRole(decoded.role)) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN_ROLE" }, { status: 403 });
    }

    // 2) Quiz doc ба owner шалгах
    const quizRef = adminDb.collection("quizzes").doc(quizId);
    const quizSnap = await quizRef.get();
    if (!quizSnap.exists) {
      return NextResponse.json({ ok: false, error: "QUIZ_NOT_FOUND" }, { status: 404 });
    }
    const quiz = quizSnap.data() as { uploadedByEmail?: string } | undefined;

    const callerEmail = (decoded.email ?? "").toLowerCase();
    const isOwner = (quiz?.uploadedByEmail ?? "").toLowerCase() === callerEmail;
    const isAdmin = decoded.role === "admin";
    if (!(isOwner || isAdmin)) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN_NOT_OWNER" }, { status: 403 });
    }

    // 3) Сурагчдын results/{quizId} document-уудыг бөөнөөр устгах
    let resultDocRefs: FirebaseFirestore.DocumentReference[] = [];
    try {
      // зөвхөн id хэрэгтэй тул select() ашиглаж payload-гүйгээр жагсаалтыг авна
      const studentsSnap = await adminDb.collection("students").select().get();
      resultDocRefs = studentsSnap.docs.map(d =>
        adminDb.collection("students").doc(d.id).collection("results").doc(quizId)
      );
    } catch (e) {
      console.error("[DELETE files/:id] fetch students failed:", e);
      return NextResponse.json(
        { ok: false, error: "LIST_STUDENTS_FAILED", detail: String(e) },
        { status: 500 }
      );
    }

    try {
      await deleteDocRefsInChunks(resultDocRefs, 500);
    } catch (e) {
      console.error("[DELETE files/:id] delete student results failed:", e);
      return NextResponse.json(
        { ok: false, error: "DELETE_RESULTS_FAILED", detail: String(e) },
        { status: 500 }
      );
    }

    // 4) Quiz doc-ийг өөрийг нь устгах
    try {
      await quizRef.delete();
    } catch (e) {
      console.error("[DELETE files/:id] delete quiz failed:", e);
      return NextResponse.json(
        { ok: false, error: "DELETE_QUIZ_FAILED", detail: String(e) },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ok: true, quizId, deletedResults: resultDocRefs.length },
      { status: 200 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[DELETE files/:id] SERVER_ERROR:", msg);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR", detail: msg }, { status: 500 });
  }
}