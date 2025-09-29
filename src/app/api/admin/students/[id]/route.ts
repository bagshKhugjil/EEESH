// src/app/api/admin/students/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---- Auth helpers ----
type Role = "admin" | "teacher" | "student";
interface DecodedWithRole extends DecodedIdToken { role?: Role | string }

async function mustBeAdmin(req: NextRequest): Promise<DecodedWithRole> {
  const authz = req.headers.get("Authorization");
  if (!authz?.startsWith("Bearer ")) throw new Error("UNAUTHORIZED");
  const idToken = authz.slice("Bearer ".length);
  let decoded: DecodedWithRole;
  try {
    decoded = (await adminAuth.verifyIdToken(idToken)) as DecodedWithRole;
  } catch {
    throw new Error("INVALID_TOKEN");
  }
  if ((decoded.role as Role) !== "admin") throw new Error("FORBIDDEN");
  return decoded;
}

// ---- Firestore helpers ----
async function deleteInChunks(refs: FirebaseFirestore.DocumentReference[], chunkSize = 500) {
  for (let i = 0; i < refs.length; i += chunkSize) {
    const slice = refs.slice(i, i + chunkSize);
    const batch = adminDb.batch();
    slice.forEach((r) => batch.delete(r));
    await batch.commit();
  }
}

async function deleteStudentResultsSubcol(studentId: string) {
  // Хуучин үлдсэн байж болох students/{id}/results/* дэд баримтуудыг цэвэрлэнэ
  const subcolSnap = await adminDb
    .collection("students")
    .doc(studentId)
    .collection("results")
    .select() // payload татахгүй
    .get();

  if (!subcolSnap.empty) {
    const refs = subcolSnap.docs.map((d) => d.ref);
    await deleteInChunks(refs, 500);
  }
}

async function deleteFromResultsFlatByStudentId(studentId: string) {
  // results_flat дотор studentId == {id} бүх мөрийг 500-аар давтан устгана
  // (pagination хийхийн оронд while давталт — бүрэн хоосрох хүртэл)
  // select() ашиглаж зөвхөн id-гаа авна
  // Firestore query нь offset/startAfter хэрэглэхгүйгээр олон удаа давтаж авч болох тул OK
  while (true) {
    const snap = await adminDb
      .collection("results_flat")
      .where("studentId", "==", studentId)
      .limit(500)
      .select() // зөвхөн ref хэрэгтэй
      .get();

    if (snap.empty) break;

    const refs = snap.docs.map((d) => d.ref);
    await deleteInChunks(refs, 500);
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> } // Next.js 15
) {
  try {
    await mustBeAdmin(req);
    const { id } = await ctx.params;
    const studentId = (id || "").trim();
    if (!studentId) {
      return NextResponse.json({ ok: false, error: "MISSING_ID" }, { status: 400 });
    }

    // 1) students/{id} баримтыг урьдчилж уншаад (байгаа эсэх шалгалт)
    const studentRef = adminDb.collection("students").doc(studentId);
    const studentSnap = await studentRef.get();
    const existed = studentSnap.exists;

    // 2) Хуучин дэд-коллекц (legacy) устгал
    await deleteStudentResultsSubcol(studentId);

    // 3) results_flat цэвэрлэлт
    await deleteFromResultsFlatByStudentId(studentId);

    // 4) students/{id}-г өөрийг нь устгах
    if (existed) {
      await studentRef.delete();
    } else {
      // байхгүй байсан ч results_flat дээрх мөрүүдийг цэвэрлэчихсэн — үргэлжилнэ
    }

    // 5) Firebase Auth хэрэглэгч устгал (uid == studentId гэж үзээд оролдоно, алдаа залгина)
    //    Хэрэв та students doc дээр authUid талбартай байлгах бол энд тэрийг ашиглан устгана.
    try { await adminAuth.deleteUser(studentId); } catch { /* ignore */ }

    // 6) Done (meta/studentsList өөрөө CF trigger-ээр шинэчлэгдэнэ)
    return NextResponse.json(
      { ok: true, studentId, studentDocDeleted: existed },
      { status: 200 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code =
      msg === "UNAUTHORIZED" ? 401 :
      msg === "INVALID_TOKEN" ? 401 :
      msg === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}