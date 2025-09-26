// src/app/api/teacher/files/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";

interface DecodedWithRole extends DecodedIdToken {
  role?: string;
}

type FileItem = {
  id: string;
  quizId: string;
  quizName: string;
  subject: string;
  uploadedAt: string;        // ISO
  uploadedByEmail: string | null;
  sourceFiles?: { part1?: string; part2?: string };
};

export async function GET(req: NextRequest) {
  try {
    // --- auth ---
    const authz = req.headers.get("Authorization");
    if (!authz?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const token = authz.slice("Bearer ".length);
    const decoded = (await adminAuth.verifyIdToken(token)) as DecodedWithRole;
    if (!decoded.role || (decoded.role !== "teacher" && decoded.role !== "admin")) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    // --- query ---
    const { searchParams } = new URL(req.url);
    const subject = searchParams.get("subject")?.trim();
    const q = (searchParams.get("q") || "").trim().toLowerCase();
    const limitParam = Number(searchParams.get("limit") || 500);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 1000) : 500;

    if (!subject) {
      return NextResponse.json({ error: "subject required" }, { status: 400 });
    }

    // --- firestore query: ЗӨВХӨН where, orderBy АВАХ ---
    // (orderBy("uploadedAt","desc") арилгаснаар композит индекс шаардлагагүй болно)
    const snap = await adminDb
      .collection("quizzes")
      .where("subject", "==", subject)
      .limit(limit)
      .get();

    // --- map ---
    const rows: FileItem[] = snap.docs.map((d) => {
      const data = d.data() as {
        quizName?: string;
        subject?: string;
        uploadedAt?: FirebaseFirestore.Timestamp | Date | string;
        uploadedByEmail?: string | null;
        sourceFiles?: { part1?: string; part2?: string };
      };

      // uploadedAt-г ISO болгоно
      let uploadedAtISO = "";
      const ua = data?.uploadedAt;
      if (ua && typeof (ua as any).toDate === "function") {
        uploadedAtISO = (ua as FirebaseFirestore.Timestamp).toDate().toISOString();
      } else if (ua instanceof Date) {
        uploadedAtISO = ua.toISOString();
      } else if (typeof ua === "string") {
        uploadedAtISO = new Date(ua).toISOString();
      }

      return {
        id: d.id,
        quizId: d.id,
        quizName: data?.quizName || d.id,
        subject: data?.subject || subject,
        uploadedAt: uploadedAtISO,
        uploadedByEmail: data?.uploadedByEmail ?? null,
        sourceFiles: data?.sourceFiles ?? {},
      };
    });

    // --- сервер талдаа эрэмбэлнэ (шинэ нь эхэнд) ---
    rows.sort((a, b) => {
      const ta = a.uploadedAt ? Date.parse(a.uploadedAt) : 0;
      const tb = b.uploadedAt ? Date.parse(b.uploadedAt) : 0;
      return tb - ta;
    });

    // --- Хэрэв q(хайлт) ирсэн бол энд шүүнэ (нэр, мэйлээр) ---
    const filtered = q
      ? rows.filter((r) => {
          const hay = `${r.quizName} ${r.uploadedByEmail ?? ""}`.toLowerCase();
          return hay.includes(q);
        })
      : rows;

    return NextResponse.json({ ok: true, items: filtered }, { status: 200 });
  } catch (e) {
    const err = e as { message?: string; code?: string };
    console.error("GET /api/teacher/files error:", err);
    return NextResponse.json(
      { ok: false, error: "SERVER_ERROR", detail: err?.message ?? "", code: err?.code ?? "" },
      { status: 500 }
    );
  }
}