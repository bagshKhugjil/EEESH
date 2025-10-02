import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";
import { createHash } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Role = "admin" | "teacher" | "student";
interface DecodedWithRole extends DecodedIdToken { role?: Role | string }

// Firestore-оос ирэх өгөгдлийн бүтцийг тодорхойлов
type QuizDocumentData = {
    subject?: string;
    date?: string;
    quizName?: string;
    class?: string;
    stats?: object | null;
    totalStudents?: number | null;
};

// Клиент рүү буцаах өгөгдлийн бүтэц
type QuizResponseItem = QuizDocumentData & { id: string };

async function mustBeAdmin(req: NextRequest): Promise<void> {
  const authz = req.headers.get("Authorization");
  if (!authz?.startsWith("Bearer ")) throw new Error("UNAUTHORIZED");
  const idToken = authz.slice("Bearer ".length);
  const decoded = (await adminAuth.verifyIdToken(idToken)) as DecodedWithRole;
  if (decoded.role !== "admin") throw new Error("FORBIDDEN");
}

/**
 * Шалгалтын жагсаалтад зориулж найдвартай ETag үүсгэнэ.
 * Нийт тоо болон хамгийн сүүлчийн огноог ашиглана.
 * **ЧУХАЛ:** Энэ нь Firestore-д тохирох индекс шаардана.
 */
async function generateETagForQuizzes(baseQuery: FirebaseFirestore.Query): Promise<string> {
    const countSnap = await baseQuery.count().get();
    const count = countSnap.data().count;

    if (count === 0) {
        return '"empty-quizzes"';
    }

    const lastItemQuery = baseQuery.orderBy("date", "desc").limit(1);
    const lastItemSnap = await lastItemQuery.get();
    const lastDate = lastItemSnap.docs[0]?.data().date || "no-date";

    const etagString = `${count}-${lastDate}`;
    const hash = createHash("md5").update(etagString).digest("hex");
    return `"${hash}"`;
}


export async function GET(req: NextRequest) {
  try {
    await mustBeAdmin(req);

    const { searchParams } = new URL(req.url);
    const subjectFilter = (searchParams.get("subject") || "").trim();
    const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize") || 100), 1), 200);

    // ETag-д зориулсан үндсэн query (шүүлтүүртэй, эрэмбэлэлтгүй)
    let baseQuery = adminDb.collection("quizzes") as FirebaseFirestore.Query;
    if (subjectFilter) {
        baseQuery = baseQuery.where("subject", "==", subjectFilter);
    }
    
    // ETag үүсгээд шалгах
    const currentETag = await generateETagForQuizzes(baseQuery);
    const clientETag = req.headers.get("if-none-match");

    if (clientETag === currentETag) {
        return new NextResponse(null, { status: 304 });
    }

    // Өгөгдөл татах (эрэмбэлэлт, хязгаарлалттай)
    const dataQuery = baseQuery.orderBy("date", "desc").limit(pageSize);

    const snap = await dataQuery.get();
    const quizzes: QuizResponseItem[] = snap.docs.map((d) => ({
      id: d.id,
      // `any`-г халж, тодорхой төрлөөр хөрвүүлэв
      ...(d.data() as QuizDocumentData),
    }));

    const response = NextResponse.json({ ok: true, quizzes });
    response.headers.set("ETag", currentETag);
    return response;

  } catch (e: any) {
    const msg = e?.message || "SERVER_ERROR";
    const code =
      msg === "UNAUTHORIZED" ? 401 :
      msg === "FORBIDDEN" ? 403 : 500;
    if (code === 500) console.error("[api/admin/quizzes] error:", msg, e.stack);
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}