// src/app/api/admin/students/import-mapped/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";

interface DecodedTokenWithRole extends DecodedIdToken {
  role?: string;
}

type StudentMappedRow = {
  firstName: string;
  lastName: string;
  email: string;
  grade?: string;
  class?: string;
  parentEmail1?: string;
  parentEmail2?: string;
  externalId?: string;
};

async function requireAdmin(req: NextRequest): Promise<void> {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("UNAUTHENTICATED");
  const token = authorization.slice("Bearer ".length);
  const decoded = (await adminAuth.verifyIdToken(token)) as DecodedTokenWithRole;
  if (decoded.role !== "admin") throw new Error("FORBIDDEN");
}

function genTempPassword(len = 12) {
  // энгийн бат бөх түр нууц үг
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = (await req.json()) as { rows: StudentMappedRow[] };

    if (!body?.rows?.length) {
      return NextResponse.json({ error: "Мөр илгээгдсэнгүй." }, { status: 400 });
    }

    const results: { email: string; status: string }[] = [];

    for (const row of body.rows) {
      const email = (row.email || "").trim().toLowerCase();
      const firstName = (row.firstName || "").trim();
      const lastName = (row.lastName || "").trim();

      if (!email || !firstName || !lastName) {
        results.push({ email: row.email || "(хоосон)", status: "❌ Алдаа: шаардлагатай талбар дутуу" });
        continue;
      }

      try {
        // 1) Firebase Auth дээр хэрэглэгч байгаа эсэх
        let uid: string | null = null;
        let existingClaims: Record<string, unknown> | undefined;

        try {
          const existing = await adminAuth.getUserByEmail(email);
          uid = existing.uid;
          existingClaims = (existing.customClaims as Record<string, unknown>) || undefined;

          // displayName-г овог нэртэй нийцүүлж шинэчлэх (сонголттой)
          const nextDisplay = `${firstName} ${lastName}`.trim();
          if (existing.displayName !== nextDisplay) {
            await adminAuth.updateUser(uid, { displayName: nextDisplay });
          }
        } catch {
          // байхгүй бол шинээр үүсгэнэ
          const created = await adminAuth.createUser({
            email,
            password: genTempPassword(),
            displayName: `${firstName} ${lastName}`.trim(),
          });
          uid = created.uid;
        }

        // 2) Role: student (боломжит өөр claims-ийг хадгалж үлдээнэ)
        await adminAuth.setCustomUserClaims(uid!, { ...(existingClaims || {}), role: "student" });

        // 3) Firestore students/{uid}
        const docRef = adminDb.collection("students").doc(uid!);
        const snap = await docRef.get();
        await docRef.set(
          {
            id: uid,
            firstName,
            lastName,
            email,
            grade: row.grade || null,
            class: row.class || null,
            parentEmail1: row.parentEmail1 || null,
            parentEmail2: row.parentEmail2 || null,
            externalId: row.externalId || null,
            role: "student",
            createdAt: snap.exists ? snap.get("createdAt") ?? new Date() : new Date(),
            updatedAt: new Date(),
          },
          { merge: true }
        );

        results.push({ email, status: "✅ Амжилттай" });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({ email: row.email || "(хоосон)", status: `❌ ${msg}` });
      }
    }

    return NextResponse.json(
      { results, summary: { total: body.rows.length, ok: results.filter(r => r.status.startsWith("✅")).length } },
      { status: 200 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Хандах эрхгүй" }, { status: 401 });
    if (msg === "FORBIDDEN")
      return NextResponse.json({ error: "Админ эрх шаардлагатай" }, { status: 403 });
    console.error("import-mapped error:", msg);
    return NextResponse.json({ error: "Дотоод алдаа гарлаа." }, { status: 500 });
  }
}