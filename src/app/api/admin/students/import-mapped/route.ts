// src/app/api/admin/students/import-mapped/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  externalId?: string | number;
};

async function requireAdmin(req: NextRequest): Promise<void> {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("UNAUTHENTICATED");
  const token = authorization.slice("Bearer ".length);
  const decoded = (await adminAuth.verifyIdToken(token)) as DecodedTokenWithRole;
  if (decoded.role !== "admin") throw new Error("FORBIDDEN");
}

function genTempPassword(len = 12) {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function cleanStr(s: unknown): string {
  return typeof s === "string" ? s.trim() : "";
}

function nonEmptyOrNull(v: unknown): string | null {
  const s = cleanStr(v);
  return s ? s : null;
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
    }

    const rows = Array.isArray((body as any)?.rows) ? ((body as any).rows as StudentMappedRow[]) : null;
    if (!rows?.length) {
      return NextResponse.json({ error: "rows required" }, { status: 400 });
    }
    if (rows.length > 1000) {
      return NextResponse.json({ error: "too many rows (max 1000)" }, { status: 400 });
    }

    const results: Array<{
      email: string;
      uid?: string;
      status: "OK" | "SKIP" | "ERROR";
      detail?: string;
    }> = [];

    for (const row of rows) {
      const email = cleanStr(row.email).toLowerCase();
      const firstName = cleanStr(row.firstName);
      const lastName = cleanStr(row.lastName);

      if (!email || !firstName || !lastName) {
        results.push({ email: row.email || "(empty)", status: "ERROR", detail: "missing required fields" });
        continue;
      }

      try {
        // 1) Firebase Auth дээр шалгах
        let uid: string;
        let claims: Record<string, any> | undefined;

        try {
          const existing = await adminAuth.getUserByEmail(email);
          uid = existing.uid;
          claims = (existing.customClaims as Record<string, any>) || undefined;

          const nextDisplay = `${firstName} ${lastName}`.trim();
          if (existing.displayName !== nextDisplay) {
            await adminAuth.updateUser(uid, { displayName: nextDisplay });
          }
        } catch {
          // байхгүй бол үүсгэнэ
          const created = await adminAuth.createUser({
            email,
            password: genTempPassword(),
            displayName: `${firstName} ${lastName}`.trim(),
          });
          uid = created.uid;
          claims = undefined;
        }

        // 2) Role тохируулах: хэрэв одоо admin/teacher бол оролдохгүй, эс бөгөөс student болгоно
        const role = (claims?.role as string | undefined) || "student";
        const keepAsIs = role === "admin" || role === "teacher";
        if (!keepAsIs) {
          await adminAuth.setCustomUserClaims(uid, { ...(claims || {}), role: "student" });
        }

        // 3) Firestore students/{uid} (upsert, хоосон талбаруудыг null болгохгүйгээр тавина)
        const dataToSet: Record<string, any> = {
          id: uid,
          firstName,
          lastName,
          email,
          updatedAt: FieldValue.serverTimestamp(),
        };

        // зөвхөн ирсэн, хоосон биш утгуудыг тавина
        const grade = nonEmptyOrNull(row.grade);
        const klass = nonEmptyOrNull(row.class);
        const p1 = nonEmptyOrNull(row.parentEmail1);
        const p2 = nonEmptyOrNull(row.parentEmail2);

        if (grade) dataToSet.grade = grade;
        if (klass) dataToSet.class = klass;
        if (p1) dataToSet.parentEmail1 = p1;
        if (p2) dataToSet.parentEmail2 = p2;

        if (row.externalId !== undefined && row.externalId !== null && cleanStr(String(row.externalId))) {
          // externalId-г тоо хэлбэртэй байж болно — төрөл заавалчлахгүй, query талд in [] 10-10-аар ашиглана
          dataToSet.externalId = typeof row.externalId === "number" ? row.externalId : cleanStr(String(row.externalId));
        }

        // createdAt-ыг анх удаа байршуулах үед л хэрэгтэй — нэмэлт уншилт хийхгүйн тулд
        // зөвхөн set({ merge: true }) + ifMissing hack хийхгүй, createdAt-г үргэлж тавьж болох ч
        // serverTimestamp() дахин шинэчлэх тул createdAt-ыг тусад нь авахаас өөр аргагүй байдаг.
        // Энд энгийнээр: document байхгүй тохиолдолд createdAt-ыг тавихын тулд жижиг try-get ашиглая.
        const docRef = adminDb.collection("students").doc(uid);
        const snap = await docRef.get();
        if (!snap.exists) {
          dataToSet.createdAt = FieldValue.serverTimestamp();
        } else if (!snap.get("createdAt")) {
          dataToSet.createdAt = snap.get("createdAt") ?? FieldValue.serverTimestamp();
        }

        await docRef.set(dataToSet, { merge: true });

        results.push({ email, uid, status: "OK" });
      } catch (err) {
        results.push({
          email,
          status: "ERROR",
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const ok = results.filter((r) => r.status === "OK").length;
    const skip = results.filter((r) => r.status === "SKIP").length;
    const fail = results.filter((r) => r.status === "ERROR").length;

    return NextResponse.json(
      {
        ok: true,
        summary: { total: rows.length, ok, skip, fail },
        results,
        note:
          "students коллецод өөрчлөлт орсон тул Cloud Function (updateStudentsList) автоматаар meta/studentsList-ийг синк хийнэ.",
      },
      { status: 200 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "SERVER_ERROR";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "FORBIDDEN" ? 403 : 500;
    if (status === 500) console.error("[admin/import-mapped] error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}