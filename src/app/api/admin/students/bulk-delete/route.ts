import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";

async function mustBeAdmin(req: NextRequest) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) throw new Error("UNAUTHORIZED");
  const token = auth.slice("Bearer ".length);
  const decoded = await adminAuth.verifyIdToken(token);
  if ((decoded as any).role !== "admin") throw new Error("FORBIDDEN");
}

export async function POST(req: NextRequest) {
  try {
    await mustBeAdmin(req);
    const { ids } = (await req.json()) as { ids: string[] };
    if (!Array.isArray(ids) || !ids.length) {
      return NextResponse.json({ error: "ids required" }, { status: 400 });
    }

    // Firestore batch
    const batch = adminDb.batch();
    ids.forEach(id => batch.delete(adminDb.collection("students").doc(id)));
    await batch.commit();

    // Auth-оос параллель устгана
    await Promise.all(ids.map(id => adminAuth.deleteUser(id).catch(() => {})));

    return NextResponse.json({ deleted: ids.length }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status: code });
  }
}