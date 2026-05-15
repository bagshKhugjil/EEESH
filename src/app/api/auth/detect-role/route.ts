import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  try {
    const authz = req.headers.get("Authorization");
    if (!authz?.startsWith("Bearer ")) return json({ error: "UNAUTHORIZED" }, 401);
    const token = authz.slice("Bearer ".length);

    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;
    const email = String(decoded.email ?? "").toLowerCase().trim();

    if (!email) return json({ error: "NO_EMAIL" }, 400);

    // admin/teacher-г автоматаар өөрчлөхгүй
    if (decoded.role === "admin" || decoded.role === "teacher") return json({ role: decoded.role });

    // parentEmail1/2-оор хайна
    const fields = ["parentEmail1", "parentEmail2"] as const;
    for (const field of fields) {
      const snap = await adminDb
        .collection("students")
        .where(field, "==", email)
        .limit(1)
        .get();
      if (!snap.empty) {
        await adminAuth.setCustomUserClaims(uid, { role: "parent" });
        return json({ role: "parent" });
      }
    }

    // Сурагчийн имэйлтэй тохирох эсэх
    const studentSnap = await adminDb
      .collection("students")
      .where("email", "==", email)
      .limit(1)
      .get();
    if (!studentSnap.empty) {
      await adminAuth.setCustomUserClaims(uid, { role: "student" });
      return json({ role: "student" });
    }

    return json({ role: null });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/auth/detect-role] ERROR:", msg);
    return json({ error: "SERVER_ERROR", detail: msg }, 500);
  }
}
