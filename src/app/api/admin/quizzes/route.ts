import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Role = "admin" | "teacher" | "student";
interface DecodedWithRole extends DecodedIdToken { role?: Role | string }

async function mustBeAdmin(req: NextRequest): Promise<void> {
  const authz = req.headers.get("Authorization");
  if (!authz?.startsWith("Bearer ")) throw new Error("UNAUTHORIZED");
  const idToken = authz.slice("Bearer ".length);
  const decoded = (await adminAuth.verifyIdToken(idToken)) as DecodedWithRole;
  if (decoded.role !== "admin") throw new Error("FORBIDDEN");
}

export async function GET(req: NextRequest) {
  try {
    await mustBeAdmin(req);

    const { searchParams } = new URL(req.url);
    const subjectFilter = (searchParams.get("subject") || "").trim(); // optional
    const pageSize = Math.min(
      Math.max(Number(searchParams.get("pageSize") || 100), 1),
      200
    );

    let q = adminDb
      .collection("quizzes")
      .select("subject", "date", "quizName", "class", "stats", "totalStudents")
      .orderBy("date", "desc")
      .limit(pageSize);

    if (subjectFilter) q = q.where("subject", "==", subjectFilter);

    const snap = await q.get();
    const quizzes = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    }));

    return NextResponse.json(
      { ok: true, quizzes },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    const msg = e?.message || "SERVER_ERROR";
    const code =
      msg === "UNAUTHORIZED" ? 401 :
      msg === "FORBIDDEN" ? 403 : 500;
    if (code === 500) console.error("[api/admin/quizzes] error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}