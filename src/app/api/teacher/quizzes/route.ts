//api/teacher/quizzes
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AllowedRole = "teacher" | "admin";
interface DecodedWithRole extends DecodedIdToken { role?: string | null }

type QuizItem = {
  id: string;
  title: string;
  subject: string;
  class: string;
  date: string; // YYYY-MM-DD
  uploadedAt?: string; // ISO
  uploadedBy?: string;
  uploadedByEmail?: string | null;
  totalStudents?: number | null;
  stats?: { avg: number | null; max: number | null; min: number | null };
};

export async function GET(req: NextRequest) {
  try {
    // --- auth ---
    const authz = req.headers.get("Authorization");
    if (!authz?.startsWith("Bearer ")) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }
    const token = authz.slice("Bearer ".length);
    const decoded = (await adminAuth.verifyIdToken(token)) as DecodedWithRole;
    const role = decoded.role as AllowedRole | undefined;
    if (!(role === "teacher" || role === "admin")) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    // --- filters (индэкс шаардахгүйгээр энгийн шүүлт хийе) ---
    const { searchParams } = new URL(req.url);
    const subject = searchParams.get("subject")?.trim();
    const klass = searchParams.get("class")?.trim();
    const limitParam = Number(searchParams.get("limit") || 100);
    const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(500, limitParam)) : 100;

    // Багш бол өөрийн оруулсан шалгалтыг л харуулах (админ бол бүгд)
    let q = adminDb.collection("quizzes") as FirebaseFirestore.Query;

    if (role === "teacher") {
      q = q.where("uploadedBy", "==", decoded.uid);
    }
    if (subject) {
      q = q.where("subject", "==", subject);
    }
    if (klass) {
      q = q.where("class", "==", klass);
    }

    // orderBy-г авахгүй — сервэр дээрээ эрэмбэлж буцаана (индэкс шаардлагагүй)
    const snap = await q.limit(limit).get();

    const rows: QuizItem[] = snap.docs.map((d) => {
      const v = d.data() as any;
      const ua = v?.uploadedAt;
      let uploadedAtISO: string | undefined;
      if (ua && typeof ua.toDate === "function") uploadedAtISO = ua.toDate().toISOString();
      else if (ua instanceof Date) uploadedAtISO = ua.toISOString();
      else if (typeof ua === "string") uploadedAtISO = new Date(ua).toISOString();

      return {
        id: d.id,
        title: String(v.title ?? v.quizName ?? d.id),
        subject: String(v.subject ?? ""),
        class: String(v.class ?? ""),
        date: String(v.date ?? ""),
        uploadedAt: uploadedAtISO,
        uploadedBy: v.uploadedBy ?? undefined,
        uploadedByEmail: v.uploadedByEmail ?? null,
        totalStudents: v.totalStudents ?? null,
        stats: v.stats ?? { avg: null, max: null, min: null },
      };
    });

    // Сервер дээрээ шинэ нь эхэнд байхаар эрэмбэлнэ
    rows.sort((a, b) => {
      const ta = a.uploadedAt ? Date.parse(a.uploadedAt) : 0;
      const tb = b.uploadedAt ? Date.parse(b.uploadedAt) : 0;
      return tb - ta;
    });

    return NextResponse.json({ ok: true, items: rows }, { status: 200 });
  } catch (e) {
    console.error("[GET /api/teacher/quizzes] SERVER_ERROR:", e);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}