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

function mapStudentDoc(d: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>) {
  const v = d.data() || {};
  const firstName = (v.firstName ?? v.firstname ?? "") as string;
  const lastName = (v.lastName ?? v.lastname ?? "") as string;
  const fallbackName = [lastName, firstName].filter(Boolean).join(" ") || (v.name ?? "NoName");

  return {
    id: d.id,
    class: (v.class ?? v.grade ?? "N/A") as string,
    externalId: (v.externalId ?? null) as string | null,
    firstName,
    lastName,
    name: (v.name ?? fallbackName) as string,
    email: (v.email ?? null) as string | null,
    parentEmail1: (v.parentEmail1 ?? null) as string | null,
    parentEmail2: (v.parentEmail2 ?? null) as string | null,
    phone: (v.phone ?? null) as string | null,
  };
}

export async function GET(req: NextRequest) {
  try {
    // ---- Auth ----
    const authz = req.headers.get("Authorization");
    if (!authz?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const token = authz.slice("Bearer ".length);
    const decoded = (await adminAuth.verifyIdToken(token)) as DecodedWithRole;

    const uid = decoded.uid;
    const email = ((decoded.email ?? "") as string).toLowerCase().trim();

    // ---- 1) users/{uid} → studentId линкээр ----
    const userDoc = await adminDb.collection("users").doc(uid).get();
    if (userDoc.exists) {
      const u = userDoc.data() || {};
      const sid: string = (u.studentId || u.studentID || u.student_id || "").toString().trim();
      if (sid) {
        const sdoc = await adminDb.collection("students").doc(sid).get();
        if (sdoc.exists) {
          return NextResponse.json(mapStudentDoc(sdoc), { status: 200 });
        }
      }
    }

    // ---- 2) Сурагч өөрөө: email == students.email ----
    if (email) {
      const bySelf = await adminDb.collection("students").where("email", "==", email).limit(1).get();
      if (!bySelf.empty) {
        return NextResponse.json(mapStudentDoc(bySelf.docs[0]), { status: 200 });
      }

      // ---- 3) Эцэг эх 1: email == students.parentEmail1 ----
      const byP1 = await adminDb.collection("students").where("parentEmail1", "==", email).limit(1).get();
      if (!byP1.empty) {
        return NextResponse.json(mapStudentDoc(byP1.docs[0]), { status: 200 });
      }

      // ---- 4) Эцэг эх 2: email == students.parentEmail2 ----
      const byP2 = await adminDb.collection("students").where("parentEmail2", "==", email).limit(1).get();
      if (!byP2.empty) {
        return NextResponse.json(mapStudentDoc(byP2.docs[0]), { status: 200 });
      }
    }

    // Олдсонгүй
    return NextResponse.json({ error: "STUDENT_NOT_FOUND" }, { status: 404 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/student/me] ERROR:", msg);
    return NextResponse.json({ error: "SERVER_ERROR", detail: msg }, { status: 500 });
  }
}