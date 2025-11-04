// src/app/api/teacher/students/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AllowedRole = "teacher" | "admin";
interface DecodedWithRole extends DecodedIdToken {
  role?: string | null;
}

export async function GET(req: NextRequest) {
  try {
    // 1) auth
    const authz = req.headers.get("Authorization");
    if (!authz?.startsWith("Bearer ")) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }
    const idToken = authz.slice("Bearer ".length);
    const decoded = (await adminAuth.verifyIdToken(idToken)) as DecodedWithRole;
    const role = decoded.role as AllowedRole | undefined;
    if (!(role === "teacher" || role === "admin")) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    // 2) students цуглуулах
    const snap = await adminDb.collection("students").get();

    const students = snap.docs.map((doc) => {
      const v = doc.data();
      const firstName = String(v.firstName ?? v.firstname ?? "").trim();
      const lastName = String(v.lastName ?? v.lastname ?? "").trim();
      const fullName =
        [lastName, firstName].filter(Boolean).join(" ") || String(v.name ?? "NoName");
      return {
        id: doc.id,
        externalId: v.externalId ? String(v.externalId) : "",
        firstName,
        lastName,
        name: fullName,
        class: String(v.class ?? v.grade ?? "").trim(),
      };
    });

    // 3) ангиудыг ялгаж авах
    const classSet = new Set<string>();
    students.forEach((s) => {
      if (s.class) classSet.add(s.class);
    });
    const classes = Array.from(classSet).sort();

    return NextResponse.json(
      {
        ok: true,
        classes,
        students,
      },
      { status: 200 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[teacher/students] ERROR:", msg);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR", detail: msg }, { status: 500 });
  }
}