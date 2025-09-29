// src/app/api/teacher/files/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AllowedRole = "teacher" | "admin";
interface DecodedWithRole extends DecodedIdToken { role?: string | null }

type QuizRow = {
  id: string;             // quizId
  title: string;          // quizName эсвэл title
  subject: string;
  class: string;
  date: string;           // YYYY-MM-DD
  uploadedAt: string;     // ISO
  uploadedByEmail: string | null;
};

function noStoreJson(body: unknown, status = 200) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function GET(req: NextRequest) {
  try {
    // ---- Auth
    const authz = req.headers.get("Authorization");
    if (!authz?.startsWith("Bearer ")) return noStoreJson({ error: "UNAUTHORIZED" }, 401);
    const token = authz.slice("Bearer ".length);
    const decoded = (await adminAuth.verifyIdToken(token)) as DecodedWithRole;

    const role = decoded.role ?? "";
    const isTeacher = role === "teacher";
    const isAdmin = role === "admin";
    if (!(isTeacher || isAdmin)) return noStoreJson({ error: "FORBIDDEN" }, 403);

    // ---- Query params
    const { searchParams } = new URL(req.url);
    const subject = searchParams.get("subject")?.trim() || ""; // optional
    const q = (searchParams.get("q") || "").trim().toLowerCase(); // optional free-text filter (client-like)
    const limitParam = Number(searchParams.get("limit") || 200);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 200;

    // ---- Build Firestore query (зөвхөн where-үүд)
    let qry: FirebaseFirestore.Query = adminDb.collection("quizzes");

    // Teacher → зөвхөн өөрийн оруулсан
    if (isTeacher) {
      qry = qry.where("uploadedBy", "==", decoded.uid);
    }
    // Subject ирсэн бол бас шүүнэ
    if (subject) {
      qry = qry.where("subject", "==", subject);
    }

    // (orderBy арилгасан — индекс шаардахгүй, сервер талдаа эрэмбэлнэ)
    const snap = await qry.limit(limit).get();

    const rows: QuizRow[] = snap.docs.map((d) => {
      const v = d.data() as {
        quizName?: string;
        title?: string;
        subject?: string;
        class?: string;
        date?: string;
        uploadedAt?: FirebaseFirestore.Timestamp | Date | string;
        uploadedByEmail?: string | null;
      };

      // uploadedAt → ISO
      let uploadedAtISO = "";
      const ua = v?.uploadedAt;
      if (ua && typeof (ua as any).toDate === "function") {
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

    // Free-text хайлт (нэр, имэйл) — сервер талдаа шүүнэ
    const filtered = q
      ? rows.filter((r) => {
          const hay = `${r.title} ${r.uploadedByEmail ?? ""}`.toLowerCase();
          return hay.includes(q);
        })
      : rows;

    // uploadedAt буурахаар эрэмбэлнэ (шинэ нь эхэнд)
    filtered.sort((a, b) => {
      const ta = a.uploadedAt ? Date.parse(a.uploadedAt) : 0;
      const tb = b.uploadedAt ? Date.parse(b.uploadedAt) : 0;
      return tb - ta;
    });

    return noStoreJson({ ok: true, items: filtered }, 200);
  } catch (e) {
    const err = e as { message?: string; code?: string };
    console.error("GET /api/teacher/files error:", err);
    return noStoreJson(
      { ok: false, error: "SERVER_ERROR", detail: err?.message ?? "", code: err?.code ?? "" },
      500
    );
  }
}