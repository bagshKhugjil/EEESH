import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AllowedRole = "student" | "teacher" | "admin";
interface DecodedWithRole extends DecodedIdToken { role?: AllowedRole | string }

function mapStudentDoc(d: FirebaseFirestore.DocumentSnapshot) {
  const v: any = d.data() || {};
  const firstName = (v.firstName ?? v.firstname ?? "") as string;
  const lastName  = (v.lastName ?? v.lastname ?? "") as string;
  const fallback  = [lastName, firstName].filter(Boolean).join(" ") || (v.name ?? "NoName");
  return {
    id: d.id,
    class: (v.class ?? v.grade ?? "N/A") as string,
    externalId: (v.externalId ?? null) as string | null,
    firstName,
    lastName,
    name: (v.name ?? fallback) as string,
    email: (v.email ?? null) as string | null,
    parentEmail1: (v.parentEmail1 ?? v.parentEmail11 ?? null) as string | null,
    parentEmail2: (v.parentEmail2 ?? v.parentEmail12 ?? null) as string | null,
    phone: (v.phone ?? null) as string | null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const authz = req.headers.get("Authorization");
    if (!authz?.startsWith("Bearer ")) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    const token = authz.slice("Bearer ".length);
    const decoded = (await adminAuth.verifyIdToken(token)) as DecodedWithRole;

    const email = ((decoded.email ?? "") as string).toLowerCase().trim();

    // users/{uid} -> studentId холбоос
    const udoc = await adminDb.collection("users").doc(decoded.uid).get();
    if (udoc.exists) {
      const u = udoc.data() || {};
      const sid = String(u.studentId || u.studentID || u.student_id || "").trim();
      if (sid) {
        const sdoc = await adminDb.collection("students").doc(sid).get();
        if (sdoc.exists) return NextResponse.json(mapStudentDoc(sdoc));
      }
    }

    // өөрийн имэйл / эцэг эхийн имэйлээр хайх
    if (email) {
      for (const field of ["email", "parentEmail1", "parentEmail2"]) {
        const snap = await adminDb.collection("students").where(field, "==", email).limit(1).get();
        if (!snap.empty) return NextResponse.json(mapStudentDoc(snap.docs[0]));
      }
    }

    return NextResponse.json({ error: "STUDENT_NOT_FOUND" }, { status: 404 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/student/profile] ERROR:", msg);
    return NextResponse.json({ error: "SERVER_ERROR", detail: msg }, { status: 500 });
  }
}