// /src/app/api/admin/users/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/adminApp";
import { DecodedIdToken, UserRecord } from "firebase-admin/auth";
import { createHash } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DecodedTokenWithRole extends DecodedIdToken {
  role?: string;
}

type ApiUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: string | null;
};

/**
 * Хэрэглэгчдийн жагсаалтын нэг хуудсанд зориулж ETag үүсгэнэ.
 */
function generateETagForUserPage(users: ApiUser[]): string {
  if (users.length === 0) {
    return '"empty-page"';
  }
  const dataString = JSON.stringify(users);
  const hash = createHash("md5").update(dataString).digest("hex");
  return `"${hash}"`;
}

export async function GET(req: NextRequest) {
  try {
    // ---- 1) Auth: зөвхөн admin ----
    const authz = req.headers.get("Authorization");
    if (!authz?.startsWith("Bearer ")) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }
    const token = authz.slice("Bearer ".length);

    let decoded: DecodedTokenWithRole;
    try {
      decoded = (await adminAuth.verifyIdToken(token)) as DecodedTokenWithRole;
    } catch {
      return NextResponse.json({ ok: false, error: "INVALID_TOKEN" }, { status: 401 });
    }
    if (decoded.role !== "admin") {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    // ---- 2) Query params (pagination) ----
    const { searchParams } = new URL(req.url);
    const pageToken = searchParams.get("pageToken") || undefined;
    const pageSizeParam = Number(searchParams.get("pageSize") ?? 1000);
    const maxResults =
      Number.isFinite(pageSizeParam) ? Math.min(Math.max(pageSizeParam, 1), 1000) : 1000;

    // ---- 3) List users ----
    const list = await adminAuth.listUsers(maxResults, pageToken);

    const users: ApiUser[] = list.users.map((u: UserRecord) => ({
      uid: u.uid,
      email: u.email ?? null,
      displayName: u.displayName ?? null,
      photoURL: u.photoURL ?? null,
      role: (u.customClaims?.role as string | undefined) ?? null,
    }));

    // ---- 4) ETag Logic ----
    const currentETag = generateETagForUserPage(users);
    const clientETag = req.headers.get("if-none-match");

    if (clientETag === currentETag) {
      return new NextResponse(null, { status: 304 });
    }

    // ---- 5) Response ----
    const response = NextResponse.json({
      ok: true,
      users,
      nextPageToken: list.pageToken ?? null,
    });
    response.headers.set("ETag", currentETag);

    return response;

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "SERVER_ERROR";
    console.error("[admin/users] list error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}