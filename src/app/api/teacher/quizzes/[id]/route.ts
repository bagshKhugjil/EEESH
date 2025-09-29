import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AllowedRole = "teacher" | "admin";
interface DecodedWithRole extends DecodedIdToken { role?: string | null }

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // auth
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

    const { id } = await context.params;
    const ref = adminDb.collection("quizzes").doc(id);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });

    const v = doc.data() as any;

    // Багш бол өөрийн оруулсан эсэхийг зөвшөөрнө
    if (role === "teacher" && v?.uploadedBy !== decoded.uid) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    const ua = v?.uploadedAt;
    let uploadedAtISO: string | undefined;
    if (ua && typeof ua.toDate === "function") uploadedAtISO = ua.toDate().toISOString();
    else if (ua instanceof Date) uploadedAtISO = ua.toISOString();
    else if (typeof ua === "string") uploadedAtISO = new Date(ua).toISOString();

    return NextResponse.json(
      {
        ok: true,
        quiz: {
          id: doc.id,
          title: String(v.title ?? v.quizName ?? doc.id),
          subject: String(v.subject ?? ""),
          class: String(v.class ?? ""),
          date: String(v.date ?? ""),
          uploadedAt: uploadedAtISO,
          uploadedBy: v.uploadedBy ?? null,
          uploadedByEmail: v.uploadedByEmail ?? null,
          totalStudents: v.totalStudents ?? null,
          stats: v.stats ?? { avg: null, max: null, min: null },
          sourceFiles: v.sourceFiles ?? {},
        },
      },
      { status: 200 }
    );
  } catch (e) {
    console.error("[GET /api/teacher/quizzes/:id] SERVER_ERROR:", e);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}