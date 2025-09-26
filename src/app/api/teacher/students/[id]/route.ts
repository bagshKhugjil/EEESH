// src/app/api/teacher/students/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AllowedRole = "teacher" | "admin";
interface DecodedWithRole extends DecodedIdToken { role?: AllowedRole | string }
function isAllowed(role?: string | null): role is AllowedRole {
  return role === "teacher" || role === "admin";
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> } // ← Next.js 15: params нь Promise
) {
  try {
    // ---- Auth ----
    const authz = req.headers.get("Authorization");
    if (!authz?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const token = authz.slice("Bearer ".length);
    let decoded: DecodedWithRole;
    try {
      decoded = (await adminAuth.verifyIdToken(token)) as DecodedWithRole;
    } catch {
      return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 401 });
    }
    if (!isAllowed(decoded.role)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    // ---- Params ----
    const { id } = await context.params; // ← Promise-оос задлах

    // ---- Fetch student doc ----
    const doc = await adminDb.collection("students").doc(id).get();
    if (!doc.exists) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const v = doc.data() || {};
    const firstName = String(v.firstName ?? v.firstname ?? "").trim();
    const lastName  = String(v.lastName ?? v.lastname ?? "").trim();
    const fullName  = [lastName, firstName].filter(Boolean).join(" ") || String(v.name ?? "NoName");

    const payload = {
      id: doc.id,
      externalId: v.externalId ?? v.externalid ?? null,
      class: v.class ?? v.grade ?? v.group ?? "N/A",
      firstName,
      lastName,
      name: fullName,
      email: v.email ?? null,
      parentEmail1: v.parentEmail1 ?? v.parent1Email ?? null,
      parentEmail2: v.parentEmail2 ?? v.parent2Email ?? null,
      phone: v.phone ?? null,
      createdAt: v.createdAt ?? null,
      updatedAt: v.updatedAt ?? null,
      // raw: v, // шалгах зорилгоор нээх бол түр идэвхжүүлж болно
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[teacher/students/:id] SERVER_ERROR:", msg);
    return NextResponse.json({ error: "SERVER_ERROR", detail: msg }, { status: 500 });
  }
}