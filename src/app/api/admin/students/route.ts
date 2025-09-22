import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";

async function mustBeAdmin(req: NextRequest) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) throw new Error("UNAUTHORIZED");
  const token = auth.slice("Bearer ".length);
  const decoded = await adminAuth.verifyIdToken(token);
  if ((decoded as any).role !== "admin") throw new Error("FORBIDDEN");
}

export async function GET(req: NextRequest) {
  try {
    await mustBeAdmin(req);

    const snap = await adminDb.collection("students").orderBy("lastName").get();
    const students = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ students }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status: code });
  }
}