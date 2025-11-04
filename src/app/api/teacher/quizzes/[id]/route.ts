// /api/teacher/quizzes/[id]/route.ts

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

type QuizDocumentData = {
  title?: string;
  quizName?: string;
  subject?: string;
  class?: string;
  date?: string;
  uploadedAt?: FirebaseFirestore.Timestamp | Date | string;
  uploadedBy?: string | null;
  uploadedByEmail?: string | null;
  totalStudents?: number | null;
  stats?: { avg: number | null; max: number | null; min: number | null };
  sourceFiles?: { part1?: string; part2?: string };
};

function generateETagForDocument(data: FirebaseFirestore.DocumentData | undefined): string {
  if (!data) {
    return '"not-found"';
  }
  const dataString = JSON.stringify(data);
  const hash = createHash("md5").update(dataString).digest("hex");
  return `"${hash}"`;
}

// ЗАСВАР 1: `context.params`-г Promise болгож зөв төрлийг зааж өгөв.
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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

    // --- Өгөгдөл татах ---
    // ЗАСВАР 2: Promise-г `await` ашиглан зөв тайлав.
    const { id } = await context.params;
    const quizId = decodeURIComponent(id); // ← ЭНД нэмж байна
    const ref = adminDb.collection("quizzes").doc(quizId);

    const doc = await ref.get();
    if (!doc.exists) {
      return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    }

    // --- ETag-н логик ---
    const docData = doc.data();
    const currentETag = generateETagForDocument(docData);
    const clientETag = req.headers.get("if-none-match");
    if (clientETag === currentETag) {
      return new NextResponse(null, { status: 304 });
    }

    // --- Өгөгдөл боловсруулах логик ---
    const v = docData as QuizDocumentData;
    const ua = v?.uploadedAt;
    let uploadedAtISO: string | undefined;
    if (ua && typeof (ua as FirebaseFirestore.Timestamp).toDate === "function") {
      uploadedAtISO = (ua as FirebaseFirestore.Timestamp).toDate().toISOString();
    } else if (ua instanceof Date) {
      uploadedAtISO = ua.toISOString();
    } else if (typeof ua === "string") {
      uploadedAtISO = new Date(ua).toISOString();
    }

    const quizData = {
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
    };

    const response = NextResponse.json({ ok: true, quiz: quizData }, { status: 200 });
    response.headers.set("ETag", currentETag);

    return response;
    
  } catch (e) {
    const err = e as Error;
    console.error(`[GET /api/teacher/quizzes/:id] SERVER_ERROR:`, err.message, err.stack);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR", detail: err.message }, { status: 500 });
  }
}