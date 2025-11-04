// /api/teacher/quizzes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AllowedRole = "teacher" | "admin";
interface DecodedWithRole extends DecodedIdToken {
  role?: string | null;
}

type QuizDocumentData = {
  title?: string;
  quizName?: string;
  subject?: string;
  class?: string;
  date?: string;
  uploadedAt?: FirebaseFirestore.Timestamp | Date | string;
  uploadedBy?: string;
  uploadedByEmail?: string | null;
  totalStudents?: number | null;
  stats?: { avg: number | null; max: number | null; min: number | null };
};

type QuizItem = {
  id: string;
  title: string;
  subject: string;
  class: string;
  date: string;
  uploadedAt?: string;
  uploadedBy?: string;
  uploadedByEmail?: string | null;
  totalStudents?: number | null;
  stats?: { avg: number | null; max: number | null; min: number | null };
};

export async function GET(req: NextRequest) {
  try {
    // --- Auth ---
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

    // --- Filters ---
    const { searchParams } = new URL(req.url);
    const subject = searchParams.get("subject")?.trim();
    const klass = searchParams.get("class")?.trim();
    const limitParam = Number(searchParams.get("limit") || 100);
    const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(500, limitParam)) : 100;

    // --- Firestore query ---
    let baseQuery: FirebaseFirestore.Query = adminDb.collection("quizzes");
    if (subject) baseQuery = baseQuery.where("subject", "==", subject);
    if (klass) baseQuery = baseQuery.where("class", "==", klass);

    const snap = await baseQuery.limit(limit).get();

    const rows: QuizItem[] = snap.docs.map((d) => {
      const v = d.data() as QuizDocumentData;
      const ua = v?.uploadedAt;
      let uploadedAtISO: string | undefined;
      if (ua && typeof (ua as FirebaseFirestore.Timestamp).toDate === "function") {
        uploadedAtISO = (ua as FirebaseFirestore.Timestamp).toDate().toISOString();
      } else if (ua instanceof Date) {
        uploadedAtISO = ua.toISOString();
      } else if (typeof ua === "string") {
        uploadedAtISO = new Date(ua).toISOString();
      }

      return {
        id: d.id,
        title: String(v.title ?? v.quizName ?? d.id),
        subject: String(v.subject ?? ""),
        class: String(v.class ?? ""),
        date: String(v.date ?? ""),
        uploadedAt: uploadedAtISO,
        uploadedBy: v.uploadedBy,
        uploadedByEmail: v.uploadedByEmail ?? null,
        totalStudents: v.totalStudents ?? null,
        stats: v.stats ?? { avg: null, max: null, min: null },
      };
    });

    // --- Sort by newest ---
    rows.sort((a, b) => {
      const ta = a.uploadedAt ? Date.parse(a.uploadedAt) : 0;
      const tb = b.uploadedAt ? Date.parse(b.uploadedAt) : 0;
      return tb - ta;
    });

    // --- Return always fresh response ---
    const res = NextResponse.json({ ok: true, items: rows }, { status: 200 });
    res.headers.set("Cache-Control", "no-store");
    return res;

  } catch (e) {
    const err = e as Error;
    console.error("[GET /api/teacher/quizzes] SERVER_ERROR:", err.message, err.stack);
    return NextResponse.json(
      { ok: false, error: "SERVER_ERROR", detail: err.message },
      { status: 500 }
    );
  }
}