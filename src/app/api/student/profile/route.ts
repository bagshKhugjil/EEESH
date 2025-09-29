// src/app/api/student/profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AllowedRole = "student" | "teacher" | "admin";
interface DecodedWithRole extends DecodedIdToken {
  role?: AllowedRole | string;
}

type StudentDocShape = {
  firstName?: string;
  firstname?: string; // өгөгдлийн вариацуудыг дэмжинэ
  lastName?: string;
  lastname?: string;
  name?: string;
  class?: string;
  grade?: string;
  externalId?: string | number | null;
  email?: string | null;
  parentEmail1?: string | null;
  parentEmail11?: string | null; // алдаатай талбар байж болзошгүй
  parentEmail2?: string | null;
  parentEmail12?: string | null; // алдаатай талбар байж болзошгүй
  phone?: string | null;
};

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function mapStudentDoc(
  d: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>
) {
  const v = (d.data() || {}) as StudentDocShape;

  const firstName = String(v.firstName ?? v.firstname ?? "").trim();
  const lastName = String(v.lastName ?? v.lastname ?? "").trim();
  const fallbackName =
    [lastName, firstName].filter(Boolean).join(" ") ||
    String(v.name ?? "NoName");

  // externalId-г string|null болгоно
  let externalId: string | null = null;
  if (v.externalId != null) {
    externalId =
      typeof v.externalId === "number"
        ? String(v.externalId)
        : String(v.externalId);
  }

  // parentEmail талбаруудын алдаатай variant-уудыг нэг мөр болгох
  const parentEmail1 =
    v.parentEmail1 ??
    v.parentEmail11 ??
    null;
  const parentEmail2 =
    v.parentEmail2 ??
    v.parentEmail12 ??
    null;

  return {
    id: d.id,
    class: String(v.class ?? v.grade ?? "N/A"),
    externalId,
    firstName,
    lastName,
    name: String(v.name ?? fallbackName),
    email: v.email ?? null,
    parentEmail1,
    parentEmail2,
    phone: v.phone ?? null,
  };
}

export async function GET(req: NextRequest) {
  try {
    // ---- Auth ----
    const authz = req.headers.get("Authorization");
    if (!authz?.startsWith("Bearer ")) {
      return noStoreJson({ error: "UNAUTHORIZED" }, 401);
    }
    const token = authz.slice("Bearer ".length);

    let decoded: DecodedWithRole;
    try {
      decoded = (await adminAuth.verifyIdToken(token)) as DecodedWithRole;
    } catch {
      return noStoreJson({ error: "INVALID_TOKEN" }, 401);
    }

    const uid = decoded.uid;
    const email = String(decoded.email ?? "").toLowerCase().trim();

    // ---- 1) users/{uid} -> studentId холбоосоор ----
    const userDoc = await adminDb.collection("users").doc(uid).get();
    if (userDoc.exists) {
      const u = userDoc.data() || {};
      const sid = String(
        u.studentId || u.studentID || u.student_id || ""
      ).trim();
      if (sid) {
        // doc(id) дээр select() боломжгүй — шууд read
        const sdoc = await adminDb.collection("students").doc(sid).get();
        if (sdoc.exists) {
          return noStoreJson(mapStudentDoc(sdoc), 200);
        }
      }
    }

    // ---- 2) Имэйлээр (өөрийн/эцэг эхийн) хайх ----
    if (email) {
      const baseSelect = [
        "firstName",
        "firstname",
        "lastName",
        "lastname",
        "name",
        "class",
        "grade",
        "externalId",
        "email",
        "parentEmail1",
        "parentEmail11",
        "parentEmail2",
        "parentEmail12",
        "phone",
      ] as const;

      // өөрийн имэйл
      const bySelf = await adminDb
        .collection("students")
        .where("email", "==", email)
        .select(...baseSelect)
        .limit(1)
        .get();
      if (!bySelf.empty) {
        return noStoreJson(mapStudentDoc(bySelf.docs[0]), 200);
      }

      // эцэг эх 1
      const byP1 = await adminDb
        .collection("students")
        .where("parentEmail1", "==", email)
        .select(...baseSelect)
        .limit(1)
        .get();
      if (!byP1.empty) {
        return noStoreJson(mapStudentDoc(byP1.docs[0]), 200);
      }

      // эцэг эх 2
      const byP2 = await adminDb
        .collection("students")
        .where("parentEmail2", "==", email)
        .select(...baseSelect)
        .limit(1)
        .get();
      if (!byP2.empty) {
        return noStoreJson(mapStudentDoc(byP2.docs[0]), 200);
      }
    }

    // Олдсонгүй
    return noStoreJson({ error: "STUDENT_NOT_FOUND" }, 404);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/student/profile] ERROR:", msg);
    return noStoreJson({ error: "SERVER_ERROR", detail: msg }, 500);
  }
}