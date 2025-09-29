// src/app/api/admin/users/[uid]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DecodedTokenWithRole extends DecodedIdToken {
  role?: string;
}

type AllowedRole = "teacher" | "student" | "parent" | "admin";
type Ctx = { params: Promise<{ uid: string }> };

function json(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    // ---- 1) Auth: зөвхөн admin ----
    const authz = req.headers.get("Authorization");
    if (!authz?.startsWith("Bearer ")) {
      return json({ ok: false, error: "UNAUTHORIZED" }, 401);
    }
    const idToken = authz.slice("Bearer ".length);

    let decoded: DecodedTokenWithRole;
    try {
      decoded = (await adminAuth.verifyIdToken(idToken)) as DecodedTokenWithRole;
    } catch {
      return json({ ok: false, error: "INVALID_TOKEN" }, 401);
    }
    if (decoded.role !== "admin") {
      return json({ ok: false, error: "FORBIDDEN" }, 403);
    }

    // ---- 2) Params ----
    const { uid: targetUid } = await params;
    if (!targetUid) {
      return json({ ok: false, error: "MISSING_UID" }, 400);
    }

    // ---- 3) Body ----
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: "BAD_JSON" }, 400);
    }

    const role = (body as { role?: string })?.role as AllowedRole | undefined;
    const allowed: AllowedRole[] = ["teacher", "student", "parent", "admin"];
    if (!role || !allowed.includes(role)) {
      return json({ ok: false, error: "BAD_ROLE" }, 400);
    }

    // ---- 4) Custom claims солих ----
    try {
      await adminAuth.setCustomUserClaims(targetUid, { role });
      // (Сонголттой) Шинэ claim-ийг клиентийн талд хурдан хэрэгжүүлэхийн тулд refresh token-уудыг
      // хүчингүй болгож болно. Ингэвэл хэрэглэгч дахин нэвтрэх/ID token-ээ сэргээх хэрэгтэй болно.
      // await adminAuth.revokeRefreshTokens(targetUid);
    } catch (e) {
      console.error("setCustomUserClaims failed:", e);
      return json({ ok: false, error: "SET_CLAIM_FAILED" }, 500);
    }

    // ---- 5) Firestore users/{uid} update (merge) ----
    try {
      await adminDb.collection("users").doc(targetUid).set(
        {
          role,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      console.error("users set(merge) failed:", e);
      return json({ ok: false, error: "FIRESTORE_WRITE_FAILED" }, 500);
    }

    return json({
      ok: true,
      message: `Role updated to '${role}' for uid=${targetUid}`,
    });
  } catch (e) {
    console.error("Unexpected error:", e);
    return json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
}