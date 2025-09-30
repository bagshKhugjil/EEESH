// app/api/admin/quizzes/counts/route.ts

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// --- Туслах функц ба Type-ууд ---

type Role = "admin" | "teacher" | "student";
interface DecodedWithRole extends DecodedIdToken {
  role?: Role | string;
}

// Админ эрхтэй эсэхийг шалгах функц
async function mustBeAdmin(req: NextRequest): Promise<void> {
  const authz = req.headers.get("Authorization");
  if (!authz?.startsWith("Bearer ")) throw new Error("UNAUTHORIZED");
  const idToken = authz.slice("Bearer ".length);
  const decoded = (await adminAuth.verifyIdToken(idToken)) as DecodedWithRole;
  if (decoded.role !== "admin") throw new Error("FORBIDDEN");
}

// --- Үндсэн API функц ---

const SUBJECTS_10 = [
  "ХИМИ", "ФИЗИК", "ТҮҮХ", "ОРОС ХЭЛ", "НИЙГЭМ",
  "МОНГОЛ ХЭЛ", "МАТЕМАТИК", "ГАЗАРЗҮЙ", "БИОЛОГИ", "АНГЛИ ХЭЛ",
] as const;

export async function GET(req: NextRequest) {
  try {
    // 1. Эрхийн шалгалт
    await mustBeAdmin(req);

    // 2. Хичээл тус бүрийн тоог Firestore-оос авах
    const counts: Record<string, number> = {};
    
    const promises = SUBJECTS_10.map(async (subject) => {
      const snapshot = await adminDb
        .collection("quizzes") // Энд collectionGroup биш collection ашиглана
        .where("subject", "==", subject)
        .count()
        .get();
      counts[subject] = snapshot.data().count;
    });

    await Promise.all(promises);

    // 3. Амжилттай хариу буцаах
    return NextResponse.json(
      { ok: true, counts },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );

  } catch (e: any) {
    // 4. Алдааг удирдах
    const msg = e?.message || "SERVER_ERROR";
    const code =
      msg === "UNAUTHORIZED" ? 401 :
      msg === "FORBIDDEN"    ? 403 : 500;
    
    if (code === 500) {
      console.error("[api/admin/quizzes/counts] error:", msg);
    }
    
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}