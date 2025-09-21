import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";

interface DecodedTokenWithRole extends DecodedIdToken {
  role?: string;
}

type Ctx = { params: Promise<{ uid: string }> };
type AllowedRole = "teacher" | "student" | "parent" | "admin";

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { uid: targetUid } = await params;

    // 1. Authorization header шалгах
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      console.error("❌ Missing Authorization header");
      return NextResponse.json({ error: "Хандах эрхгүй" }, { status: 401 });
    }

    const token = authorization.slice("Bearer ".length);
    let decoded: DecodedTokenWithRole;
    try {
      decoded = (await adminAuth.verifyIdToken(token)) as DecodedTokenWithRole;
    } catch (e) {
      console.error("❌ verifyIdToken failed:", e);
      return NextResponse.json({ error: "Токен хүчингүй" }, { status: 401 });
    }

    if (decoded.role !== "admin") {
      console.error("❌ Forbidden. Caller role:", decoded.role);
      return NextResponse.json({ error: "Админ эрх шаардлагатай." }, { status: 403 });
    }

    // 2. Body-с role авах
    let body: unknown;
    try {
      body = await req.json();
    } catch (e) {
      console.error("❌ Invalid JSON body:", e);
      return NextResponse.json({ error: "JSON буруу байна" }, { status: 400 });
    }

    const role = (body as { role?: string })?.role as AllowedRole | undefined;
    const allowed: AllowedRole[] = ["teacher", "student", "parent", "admin"];
    if (!targetUid || !role || !allowed.includes(role)) {
      console.error("❌ Bad request. targetUid:", targetUid, "role:", role);
      return NextResponse.json({ error: "Буруу хүсэлт (uid/role)" }, { status: 400 });
    }

    // 3. Custom claims шинэчлэх
    try {
      await adminAuth.setCustomUserClaims(targetUid, { role });
    } catch (e) {
      console.error("❌ setCustomUserClaims failed:", e);
      return NextResponse.json({ error: "Custom claims тохируулахад алдаа" }, { status: 500 });
    }

    // 4. Firestore document update биш set (merge)
    try {
      await adminDb.collection("users").doc(targetUid).set(
        {
          role,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (e) {
      console.error("❌ Firestore set(merge) failed:", e);
      return NextResponse.json({ error: "Firestore бичихэд алдаа" }, { status: 500 });
    }

    return NextResponse.json(
      { message: `Хэрэглэгчийн роль '${role}' болгож амжилттай өөрчиллөө.` },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("❌ Unexpected error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}