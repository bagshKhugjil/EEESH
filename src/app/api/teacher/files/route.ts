// /api/teacher/files/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";
import { createHash } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AllowedRole = "teacher" | "admin";
interface DecodedWithRole extends DecodedIdToken {
  role?: string | null;
}

// Firestore-оос ирэх өгөгдлийн бүтцийг тодорхойлов
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

/**
 * Файлын жагсаалтад зориулж ETag үүсгэнэ (индекс шаардахгүй).
 */
async function generateETagForFilesList(baseQuery: FirebaseFirestore.Query): Promise<string> {
  const countSnap = await baseQuery.count().get();
  const count = countSnap.data().count;

  const etagString = `files-count-${count}`;
  const hash = createHash("md5").update(etagString).digest("hex");
  return `"${hash}"`;
}

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

    // ---- ETag Logic ----
    // 1. Шүүлтүүртэй үндсэн query-г үүсгэнэ
    let baseQuery: FirebaseFirestore.Query = adminDb.collection("quizzes");
    if (subject) {
      baseQuery = baseQuery.where("subject", "==", subject);
    }
    
    // 2. Одоогийн ETag-г үүсгэнэ
    const currentETag = await generateETagForFilesList(baseQuery);

    // 3. Клиентээс ирсэн ETag-г шалгана
    const clientETag = req.headers.get("if-none-match");
    if (clientETag === currentETag) {
      return new NextResponse(null, { status: 304 });
    }

    // ---- Data Fetching (if ETag mismatches) ----
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

    // Сервер талд хийгдэх нэмэлт шүүлтүүр (free-text search)
    const filtered = qParam
      ? rows.filter((r) => {
          const searchableString = `${r.title} ${r.uploadedByEmail ?? ""}`.toLowerCase();
          return searchableString.includes(qParam);
        })
      : rows;

    // Эрэмбэлэлт
    filtered.sort((a, b) => {
      const ta = a.uploadedAt ? Date.parse(a.uploadedAt) : 0;
      const tb = b.uploadedAt ? Date.parse(b.uploadedAt) : 0;
      return tb - ta;
    });
    
    // 4. Хариуг шинэ ETag-тэй хамт буцаана
    const response = NextResponse.json({ ok: true, items: filtered });
    response.headers.set("ETag", currentETag);
    return response;

  } catch (e) {
    const err = e as Error;
    console.error("GET /api/teacher/files error:", err.message, err.stack);
    return NextResponse.json(
      { ok: false, error: "SERVER_ERROR", detail: err.message },
      { status: 500 }
    );
  }
}