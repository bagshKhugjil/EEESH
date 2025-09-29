// src/app/api/admin/users/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/adminApp";
import { DecodedIdToken, UserRecord } from "firebase-admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DecodedTokenWithRole extends DecodedIdToken {
  role?: string;
}

type ApiUser = {
  uid: string;
  email: string | undefined;
  displayName: string | undefined;
  photoURL: string | undefined;
  role: string | null;
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(req: NextRequest) {
  try {
    // ---- 1) Auth: зөвхөн admin ----
    const authz = req.headers.get("Authorization");
    if (!authz?.startsWith("Bearer ")) {
      return json({ ok: false, error: "UNAUTHORIZED" }, 401);
    }
    const token = authz.slice("Bearer ".length);

    let decoded: DecodedTokenWithRole;
    try {
      decoded = (await adminAuth.verifyIdToken(token)) as DecodedTokenWithRole;
    } catch {
      return json({ ok: false, error: "INVALID_TOKEN" }, 401);
    }
    if (decoded.role !== "admin") {
      return json({ ok: false, error: "FORBIDDEN" }, 403);
    }

    // ---- 2) Query params (pagination) ----
    const { searchParams } = new URL(req.url);
    const pageToken = searchParams.get("pageToken") || undefined;

    const pageSizeParam = Number(searchParams.get("pageSize") ?? 1000);
    // Firebase Admin listUsers: maxResults <= 1000
    const maxResults =
      Number.isFinite(pageSizeParam) ? Math.min(Math.max(pageSizeParam, 1), 1000) : 1000;

    // ---- 3) List users ----
    const list = await adminAuth.listUsers(maxResults, pageToken);

    const users: ApiUser[] = list.users.map((u: UserRecord) => ({
      uid: u.uid,
      email: u.email,
      displayName: u.displayName,
      photoURL: u.photoURL,
      role: (u.customClaims?.role as string | undefined) ?? null,
    }));

    return json({
      ok: true,
      users,
      nextPageToken: list.pageToken ?? null,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "SERVER_ERROR";
    console.error("[admin/users] list error:", msg);
    return json({ ok: false, error: msg }, 500);
  }
}