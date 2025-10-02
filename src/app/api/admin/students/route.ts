// /src/app/api/admin/students/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";
import { FieldPath } from "firebase-admin/firestore";
import { createHash } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AllowedRole = "admin";
interface DecodedWithRole extends DecodedIdToken { role?: string }

// Firestore-оос ирэх өгөгдлийн бүтцийг тодорхойлов
type StudentDocumentData = {
  firstName?: string | null;
  lastName?: string | null;
  class?: string | null;
  email?: string | null;
  externalId?: string | number | null;
  updatedAt?: FirebaseFirestore.Timestamp; // ETag-д ашиглагдана
};

type StudentListItem = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  class: string | null;
  email: string | null;
  externalId?: string | number | null;
};

async function mustBeAdmin(req: NextRequest) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) throw new Error("UNAUTHORIZED");
  const token = auth.slice("Bearer ".length);
  const decoded = (await adminAuth.verifyIdToken(token)) as DecodedWithRole;
  if (decoded.role !== "admin") throw new Error("FORBIDDEN");
}

/**
 * Сурагчдын жагсаалтад зориулж найдвартай ETag үүсгэнэ.
 * Нийт тоо болон хамгийн сүүлд шинэчлэгдсэн бичлэгийн цагийг ашиглана.
 * **ЧУХАЛ:** Энэ нь Firestore-д `updatedAt` талбарт тохирох индекс шаардаж болзошгүй.
 */
async function generateETagForStudents(baseQuery: FirebaseFirestore.Query): Promise<string> {
  const countSnap = await baseQuery.count().get();
  const count = countSnap.data().count;

  if (count === 0) {
    return '"empty-students"';
  }

  // updatedAt талбар байхгүй бол энэ хэсэг ажиллахгүй тул lastName-р орлуулж болно.
  // Гэхдээ хамгийн найдвартай нь updatedAt юм.
  const lastUpdatedQuery = baseQuery.orderBy("updatedAt", "desc").limit(1);
  const lastUpdatedSnap = await lastUpdatedQuery.get();
  const lastUpdatedAt = lastUpdatedSnap.docs[0]?.data().updatedAt?.toMillis() ?? "no-date";

  const etagString = `${count}-${lastUpdatedAt}`;
  const hash = createHash("md5").update(etagString).digest("hex");
  return `"${hash}"`;
}


export async function GET(req: NextRequest) {
  try {
    await mustBeAdmin(req);

    const { searchParams } = new URL(req.url);
    const classFilter = (searchParams.get("class") || "").trim();
    
    // ---- ETag-д зориулсан үндсэн query ----
    let baseQuery = adminDb.collection("students") as FirebaseFirestore.Query;
    if (classFilter) {
      baseQuery = baseQuery.where("class", "==", classFilter);
    }

    // ---- ETag Logic ----
    const currentETag = await generateETagForStudents(baseQuery);
    const clientETag = req.headers.get("if-none-match");

    if (clientETag === currentETag) {
      return new NextResponse(null, { status: 304 });
    }
    
    // ---- Pagination and Data Fetching ----
    const pageSizeParam = Number(searchParams.get("pageSize") ?? 100);
    const pageSize = Number.isFinite(pageSizeParam)
      ? Math.min(Math.max(pageSizeParam, 1), 200)
      : 50;
    const rawCursor = searchParams.get("cursor");
    const q = (searchParams.get("q") || "").trim().toLowerCase();

    // Хуудаслалт болон эрэмбэлэлтийг үндсэн query дээр нэмнэ
    let finalQuery = baseQuery
      .orderBy("lastName")
      .orderBy(FieldPath.documentId());

    if (rawCursor) {
      const parts = rawCursor.split("|||");
      if (parts.length === 2 && parts[1]) {
        finalQuery = finalQuery.startAfter(parts[0] ?? "", parts[1] ?? "");
      }
    }

    finalQuery = finalQuery.limit(pageSize);
    const snap = await finalQuery.get();

    // ---- Post-fetch search (q) ----
    const startsWith = (s: unknown, needle: string) =>
      typeof s === "string" && needle ? s.toLowerCase().startsWith(needle) : false;

    const rows: StudentListItem[] = snap.docs
      .map((d) => {
        const v = d.data() as StudentDocumentData;
        return {
          id: d.id,
          firstName: v.firstName ?? null,
          lastName: v.lastName ?? null,
          class: v.class ?? null,
          email: v.email ?? null,
          externalId: v.externalId ?? null,
        };
      })
      .filter((r) => {
        if (!q) return true;
        return startsWith(r.lastName, q) || startsWith(r.firstName, q) || startsWith(r.email, q);
      });

    // ---- Next cursor ----
    let nextCursor: string | null = null;
    if (!snap.empty && snap.docs.length === pageSize) { // pageSize-тэй тэнцүү бол цаанаа мөр байна гэж үзнэ
      const lastDoc = snap.docs[snap.docs.length - 1];
      const ln = (lastDoc.get("lastName") ?? "") as string;
      nextCursor = `${ln}|||${lastDoc.id}`;
    }

    const response = NextResponse.json({
      ok: true,
      students: rows,
      nextCursor,
      pageSize,
    });
    response.headers.set("ETag", currentETag);
    return response;
    
  } catch (e: any) {
    const msg = e?.message || "SERVER_ERROR";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 500;
    if (status === 500) console.error("[admin/students] error:", msg, e.stack);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}