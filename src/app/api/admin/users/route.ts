// src/app/api/admin/users/route.ts (any төрлийг зассан, бүтэн хувилбар)

import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";

// DecodedIdToken-г өргөтгөж, role-г нэмж өгөх
interface DecodedTokenWithRole extends DecodedIdToken {
  role?: string;
}

export async function GET(req: NextRequest) {
  try {
    // 1. Хүсэлт явуулсан хэрэглэгч админ мөн эсэхийг шалгах
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Хандах эрхгүй" }, { status: 401 });
    }
    const token = authorization.split("Bearer ")[1];
    
    // Төрлийг тодорхой болгох
    const decodedToken = await adminAuth.verifyIdToken(token) as DecodedTokenWithRole;
    
    if (decodedToken.role !== 'admin') {
      return NextResponse.json({ error: "Админ эрх шаардлагатай." }, { status: 403 });
    }

    // 2. Бүх хэрэглэгчийг жагсаах
    const listUsersResult = await adminAuth.listUsers(1000);
    const users = listUsersResult.users.map((userRecord) => {
      return {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        photoURL: userRecord.photoURL,
        role: userRecord.customClaims?.role || null,
      };
    });

    return NextResponse.json(users, { status: 200 });

  } catch (error: unknown) { // --- ЗАСВАР: any -> unknown ---
    // Алдааны төрлийг шалгаж, зөв мессеж гаргах
    const errorMessage = error instanceof Error ? error.message : "Тодорхойгүй алдаа гарлаа.";
    console.error("Failed to list users:", errorMessage);
    return NextResponse.json({ error: "Дотоод алдаа гарлаа." }, { status: 500 });
  }
}