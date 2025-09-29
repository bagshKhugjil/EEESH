// src/app/api/admin/students/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";
import { FieldPath } from "firebase-admin/firestore"; // ← ЗӨВ ИМПОРТ

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AllowedRole = "admin";
interface DecodedWithRole extends DecodedIdToken { role?: string }

async function mustBeAdmin(req: NextRequest) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) throw new Error("UNAUTHORIZED");
  const token = auth.slice("Bearer ".length);
  const decoded = (await adminAuth.verifyIdToken(token)) as DecodedWithRole;
  if (decoded.role !== "admin") throw new Error("FORBIDDEN");
}

type StudentListItem = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  class: string | null;
  email: string | null;
  externalId?: string | number | null;
};

export async function GET(req: NextRequest) {
  try {
    await mustBeAdmin(req);

    const { searchParams } = new URL(req.url);

    // ---- Query params ----
    const pageSizeParam = Number(searchParams.get("pageSize") ?? 50);
    const pageSize = Number.isFinite(pageSizeParam)
      ? Math.min(Math.max(pageSizeParam, 1), 200)
      : 50;

    // cursor формат: `${lastName}|||${docId}`
    const rawCursor = searchParams.get("cursor");
    const classFilter = (searchParams.get("class") || "").trim();
    const q = (searchParams.get("q") || "").trim().toLowerCase(); // эхлэлээр хайна

    // ---- Base query (бага талбар) ----
    let query = adminDb
      .collection("students")
      .select("firstName", "lastName", "class", "email", "externalId")
      .orderBy("lastName")
      .orderBy(FieldPath.documentId()); // ← ЭНД ЗӨВ

    if (classFilter) {
      // Ангигаар шүүх
      query = query.where("class", "==", classFilter);
      // (Ангиар where + lastName/orderBy-доо композит индекс шаардах магадлалтай.
      //  Хэрэв алдаа өгвөл console дээр индекс үүсгэх линк гарна.)
    }

    if (rawCursor) {
      const parts = rawCursor.split("|||");
      if (parts.length === 2 && parts[1]) {
        const [ln, id] = parts;
        query = query.startAfter(ln ?? "", id ?? "");
      }
      // буруу курсор ирвэл зүгээр л алгасна
    }

    query = query.limit(pageSize);

    // ---- Гүйцэтгэх ----
    const snap = await query.get();

    // ---- Хайлт (q) – сервер талаасаа буцаасан мөрүүд дотроо локал шүүлт ----
    const startsWith = (s: unknown, needle: string) =>
      typeof s === "string" && needle ? s.toLowerCase().startsWith(needle) : false;

    const rows: StudentListItem[] = snap.docs
      .map((d) => {
        const v = d.data() || {};
        return {
          id: d.id,
          firstName: (v.firstName ?? null) as string | null,
          lastName: (v.lastName ?? null) as string | null,
          class: (v.class ?? null) as string | null,
          email: (v.email ?? null) as string | null,
          externalId: v.externalId ?? null,
        };
      })
      .filter((r) => {
        if (!q) return true;
        return (
          startsWith(r.lastName, q) ||
          startsWith(r.firstName, q) ||
          startsWith(r.email, q)
        );
      });

    // ---- Next cursor ----
    let nextCursor: string | null = null;
    if (!snap.empty) {
      const lastDoc = snap.docs[snap.docs.length - 1];
      const ln = (lastDoc.get("lastName") ?? "") as string;
      nextCursor = `${ln}|||${lastDoc.id}`;
    }

    return NextResponse.json(
      {
        ok: true,
        students: rows,
        nextCursor,
        pageSize,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (e: any) {
    const msg = e?.message || "SERVER_ERROR";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 500;
    if (status === 500) console.error("[admin/students] error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}