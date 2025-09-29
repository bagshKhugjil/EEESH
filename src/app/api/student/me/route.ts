// src/app/api/student/me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AllowedRole = "student" | "teacher" | "admin";
interface DecodedWithRole extends DecodedIdToken {
  role?: AllowedRole | string;
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

type StudentDocShape = {
  firstName?: string;
  firstname?: string;
  lastName?: string;
  lastname?: string;
  name?: string;
  class?: string;
  grade?: string;
  externalId?: string | number | null;
  email?: string | null;
  parentEmail1?: string | null;
  parentEmail2?: string | null;
  phone?: string | null;
};

function mapStudentDoc(
  d: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>
) {
  const v = (d.data() || {}) as StudentDocShape;
  const firstName = String(v.firstName ?? v.firstname ?? "").trim();
  const lastName = String(v.lastName ?? v.lastname ?? "").trim();
  const fallbackName =
    [lastName, firstName].filter(Boolean).join(" ") ||
    String(v.name ?? "NoName");

  return {
    id: d.id,
    class: String(v.class ?? v.grade ?? "N/A"),
    externalId:
      v.externalId === null || v.externalId === undefined
        ? null
        : (typeof v.externalId === "number"
            ? String(v.externalId)
            : String(v.externalId)),
    firstName,
    lastName,
    name: String(v.name ?? fallbackName),
    email: v.email ?? null,
    parentEmail1: v.parentEmail1 ?? null,
    parentEmail2: v.parentEmail2 ?? null,
    phone: v.phone ?? null,
  };
}

export async function GET(req: NextRequest) {
  try {
    // ---- Auth ----
    const authz = req.headers.get("Authorization");
    if (!authz?.startsWith("Bearer ")) {
      return json({ error: "UNAUTHORIZED" }, 401);
    }
    const token = authz.slice("Bearer ".length);

    let decoded: DecodedWithRole;
    try {
      decoded = (await adminAuth.verifyIdToken(token)) as DecodedWithRole;
    } catch {
      return json({ error: "INVALID_TOKEN" }, 401);
    }

    const uid = decoded.uid;
    const email = String((decoded.email ?? "")).toLowerCase().trim();

    // ---- 1) users/{uid} → studentId линкээр ----
    const userDoc = await adminDb.collection("users").doc(uid).get();
    if (userDoc.exists) {
      const u = userDoc.data() || {};
      const sid = String(
        u.studentId || u.studentID || u.student_id || ""
      ).trim();
      if (sid) {
        // ⚠️ DocumentReference дээр select() байхгүй — шууд get()
        const sdoc = await adminDb.collection("students").doc(sid).get();
        if (sdoc.exists) {
          return json(mapStudentDoc(sdoc), 200);
        }
      }
    }

    // ---- 2) Сурагч өөрөө: email == students.email ----
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
        "parentEmail2",
        "phone",
      ] as const;

      const bySelf = await adminDb
        .collection("students")
        .where("email", "==", email)
        .select(...baseSelect)
        .limit(1)
        .get();
      if (!bySelf.empty) {
        return json(mapStudentDoc(bySelf.docs[0]), 200);
      }

      // ---- 3) Эцэг эх 1: email == students.parentEmail1 ----
      const byP1 = await adminDb
        .collection("students")
        .where("parentEmail1", "==", email)
        .select(...baseSelect)
        .limit(1)
        .get();
      if (!byP1.empty) {
        return json(mapStudentDoc(byP1.docs[0]), 200);
      }

      // ---- 4) Эцэг эх 2: email == students.parentEmail2 ----
      const byP2 = await adminDb
        .collection("students")
        .where("parentEmail2", "==", email)
        .select(...baseSelect)
        .limit(1)
        .get();
      if (!byP2.empty) {
        return json(mapStudentDoc(byP2.docs[0]), 200);
      }
    }

    // Олдсонгүй
    return json({ error: "STUDENT_NOT_FOUND" }, 404);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/student/me] ERROR:", msg);
    return json({ error: "SERVER_ERROR", detail: msg }, 500);
  }
}