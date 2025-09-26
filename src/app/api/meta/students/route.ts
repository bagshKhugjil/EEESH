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

type StudentRosterItem = {
  id: string;
  externalId?: number | null;
  firstName: string;
  lastName: string;
  class: string;
};

type RosterPayload = {
  classes: string[];
  students: Array<{ id: string; name: string; class: string }>;
  raw?: StudentRosterItem[]; // хүсвэл дебаг/цааш ашиглахад
};

export async function GET(req: NextRequest) {
  try {
    // Auth
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

    // meta/studentsList -> students массив
    const doc = await adminDb.collection("meta").doc("studentsList").get();
    if (!doc.exists) {
      return NextResponse.json<RosterPayload>({ classes: [], students: [] }, { status: 200 });
    }

    const data = doc.data() || {};
    const arr: StudentRosterItem[] = Array.isArray(data.students) ? data.students : [];

    const students = arr.map((s) => ({
      id: s.id,
      name: `${(s.lastName ?? "").toString().trim()} ${(s.firstName ?? "").toString().trim()}`.trim() || "NoName",
      class: (s.class ?? "N/A").toString(),
    }));

    const classes = Array.from(new Set(students.map((s) => s.class))).sort();

    return NextResponse.json<RosterPayload>({ classes, students, raw: arr }, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[meta/students] SERVER_ERROR:", msg);
    return NextResponse.json({ error: "SERVER_ERROR", detail: msg }, { status: 500 });
  }
}