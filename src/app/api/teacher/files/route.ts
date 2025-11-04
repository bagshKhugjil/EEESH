// /api/teacher/files/route.ts
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
  quizName?: string;
  title?: string;
  subject?: string;
  class?: string;
  date?: string;
  uploadedAt?: FirebaseFirestore.Timestamp | Date | string;
  uploadedByEmail?: string | null;
};

type QuizRow = {
  id: string;
  title: string;
  subject: string;
  class: string;
  date: string;
  uploadedAt: string;
  uploadedByEmail: string | null;
};

export async function GET(req: NextRequest) {
  try {
    // ---- Auth ----
    const authz = req.headers.get("Authorization");
    if (!authz?.startsWith("Bearer ")) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }
    const token = authz.slice("Bearer ".length);
    const decoded = (await adminAuth.verifyIdToken(token)) as DecodedWithRole;

    const role = decoded.role ?? "";
    if (!(role === "teacher" || role === "admin")) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    // ---- Query params ----
    const { searchParams } = new URL(req.url);
    const subject = searchParams.get("subject")?.trim() || "";
    const qParam = (searchParams.get("q") || "").trim().toLowerCase();
    const limitParam = Number(searchParams.get("limit") || 200);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 200;

    // ---- Firestore query (NO ETag) ----
    let baseQuery: FirebaseFirestore.Query = adminDb.collection("quizzes");
    if (subject) {
      baseQuery = baseQuery.where("subject", "==", subject);
    }

    const snap = await baseQuery.limit(limit).get();

    const rows: QuizRow[] = snap.docs.map((d) => {
      const v = d.data() as QuizDocumentData;

      let uploadedAtISO = "";
      const ua = v?.uploadedAt;
      if (ua && typeof (ua as FirebaseFirestore.Timestamp).toDate === "function") {
        uploadedAtISO = (ua as FirebaseFirestore.Timestamp).toDate().toISOString();
      } else if (ua instanceof Date) {
        uploadedAtISO = ua.toISOString();
      } else if (typeof ua === "string") {
        uploadedAtISO = new Date(ua).toISOString();
      }

      return {
        id: d.id,
        title: v.title || v.quizName || d.id,
        subject: v.subject || subject || "",
        class: v.class || "",
        date: v.date || "",
        uploadedAt: uploadedAtISO,
        uploadedByEmail: v.uploadedByEmail ?? null,
      };
    });

    // client талын free-text search
    const filtered = qParam
      ? rows.filter((r) => {
          const searchableString = `${r.title} ${r.uploadedByEmail ?? ""}`.toLowerCase();
          return searchableString.includes(qParam);
        })
      : rows;

    // шинэ нь дээрээ гарах
    filtered.sort((a, b) => {
      const ta = a.uploadedAt ? Date.parse(a.uploadedAt) : 0;
      const tb = b.uploadedAt ? Date.parse(b.uploadedAt) : 0;
      return tb - ta;
    });

    const res = NextResponse.json({ ok: true, items: filtered });
    // кэш хийгдэхээс бүрэн сэргийлнэ
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (e) {
    const err = e as Error;
    console.error("GET /api/teacher/files error:", err.message, err.stack);
    return NextResponse.json(
      { ok: false, error: "SERVER_ERROR", detail: err.message },
      { status: 500 }
    );
  }
}