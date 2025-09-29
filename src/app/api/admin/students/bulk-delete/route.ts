// src/app/api/admin/students/bulk-delete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Role = "admin" | "teacher" | "student";
async function mustBeAdmin(req: NextRequest) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) throw new Error("UNAUTHORIZED");
  const token = auth.slice("Bearer ".length);
  const decoded = await adminAuth.verifyIdToken(token);
  if ((decoded as any).role !== "admin") throw new Error("FORBIDDEN");
}

function chunk<T>(arr: T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function deleteDocRefsInChunks(
  refs: FirebaseFirestore.DocumentReference[],
  chunkSize = 500
) {
  for (const slice of chunk(refs, chunkSize)) {
    const batch = adminDb.batch();
    slice.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

/** Legacy subcollection cleaner: students/{id}/results/* */
async function purgeLegacySubcollection(studentId: string) {
  const subSnap = await adminDb
    .collection("students")
    .doc(studentId)
    .collection("results")
    .select() // зөвхөн ref хэрэгтэй
    .get();
  if (!subSnap.empty) {
    await deleteDocRefsInChunks(subSnap.docs.map((d) => d.ref), 500);
  }
}

/** results_flat-аас studentId==id бүх мөрийг 500-аар устгана */
async function purgeResultsFlatByStudentId(studentId: string): Promise<number> {
  let total = 0;
  while (true) {
    const snap = await adminDb
      .collection("results_flat")
      .where("studentId", "==", studentId)
      .limit(500)
      .select() // зөвхөн ref
      .get();

    if (snap.empty) break;
    total += snap.size;
    await deleteDocRefsInChunks(snap.docs.map((d) => d.ref), 500);
  }
  return total;
}

export async function POST(req: NextRequest) {
  try {
    await mustBeAdmin(req);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
    }

    const ids = Array.isArray((body as any)?.ids) ? (body as any).ids as string[] : null;
    if (!ids || !ids.length) {
      return NextResponse.json({ error: "ids required" }, { status: 400 });
    }

    // Давхардлыг арилгах, хоосон string-үүдийг шүүх
    const uniqueIds = Array.from(new Set(ids.map((s) => (s || "").trim()).filter(Boolean)));
    if (!uniqueIds.length) {
      return NextResponse.json({ error: "no valid ids" }, { status: 400 });
    }

    // 1) Legacy subcollection + results_flat purge per student
    const perStudentStats: Record<
      string,
      { resultsFlatDeleted: number; legacySubDeleted: boolean }
    > = {};

    for (const sid of uniqueIds) {
      // legacy
      await purgeLegacySubcollection(sid);
      // results_flat
      const deletedCount = await purgeResultsFlatByStudentId(sid);
      perStudentStats[sid] = { resultsFlatDeleted: deletedCount, legacySubDeleted: true };
    }

    // 2) students/{id} баримтуудыг 500-аар багцлан устгана
    const studentRefs = uniqueIds.map((id) => adminDb.collection("students").doc(id));
    await deleteDocRefsInChunks(studentRefs, 500);

    // 3) Firebase Auth: параллель устгал (алдааг залгиж, үргэлжилнэ)
    const authResults = await Promise.allSettled(
      uniqueIds.map((id) => adminAuth.deleteUser(id))
    );
    const authDeleted = authResults.filter((r) => r.status === "fulfilled").length;

    return NextResponse.json(
      {
        ok: true,
        requested: uniqueIds.length,
        studentsDeleted: uniqueIds.length,
        authDeleted,
        perStudent: perStudentStats,
      },
      { status: 200 }
    );
  } catch (e: any) {
    const msg = e?.message || "SERVER_ERROR";
    const code =
      msg === "UNAUTHORIZED" ? 401 :
      msg === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status: code });
  }
}