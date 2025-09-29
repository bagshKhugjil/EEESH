// src/app/api/meta/students/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AllowedRole = "teacher" | "admin";
interface DecodedWithRole extends DecodedIdToken { role?: AllowedRole | string }

const isAllowed = (role?: string | null): role is AllowedRole =>
  role === "teacher" || role === "admin";

type StudentRosterItem = {
  id: string;
  externalId?: number | string | null;
  firstName?: string;
  lastName?: string;
  class?: string;
};

type StudentLite = { id: string; name: string; class: string };

type RosterPayload = {
  classes: string[];
  students: StudentLite[];
  raw?: StudentRosterItem[];
};

function safeStr(x: unknown): string {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}
function cleanName(lastName: string, firstName: string): string {
  const ln = safeStr(lastName).trim();
  const fn = safeStr(firstName).trim();
  const full = [ln, fn].filter(Boolean).join(" ");
  return full || "NoName";
}
function normalizeClass(v: unknown): string {
  const c = safeStr(v).trim();
  return c || "N/A";
}

export async function GET(req: NextRequest) {
  try {
    // ---------- Auth ----------
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

    // ---------- Query params ----------
    const { searchParams } = new URL(req.url);
    const classFilter = searchParams.get("class")?.trim() || ""; // ангигаар шүүх (сонголттой)
    const includeRaw = searchParams.get("raw") === "1";           // дебаг

    // ---------- Fetch meta/studentsList (нэг уншилт) ----------
    const docRef = adminDb.collection("meta").doc("studentsList");
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      // Хоосон боловч 200 буцаана — UI алдаа биш, хоосон жагсаалт гэж ойлгоно
      // Кэш хянах толгойнууд
      const res = NextResponse.json<RosterPayload>({ classes: [], students: [] }, { status: 200 });
      res.headers.set("Cache-Control", "private, max-age=300, stale-while-revalidate=120");
      return res;
    }

    const data = docSnap.data() || {};
    const arr = Array.isArray(data.students) ? (data.students as StudentRosterItem[]) : [];

    // ---------- Transform ----------
    // name: "Овог Нэр" (ln + fn), class: "N/A" default
    let students: StudentLite[] = arr.map((s) => {
      const name = cleanName(s.lastName ?? "", s.firstName ?? "");
      const klass = normalizeClass(s.class);
      return { id: s.id, name, class: klass };
    });

    // Хэрэв ангигаар шүүх хүсэлт байвал энд шүүнэ (сервер тал)
    if (classFilter) {
      students = students.filter((s) => s.class === classFilter);
    }

    const classes = Array.from(new Set(students.map((s) => s.class))).sort();

    // ---------- Conditional GET (ETag/Last-Modified) ----------
    // Firestore-д docSnap.updateTime байдаг (admin sdk). Үүнийг ETag/Last-Modified-д ашиглая.
    const updateTime = docSnap.updateTime ?? docSnap.readTime; // fallback
    // millis (тоон) → unique ETag (өөрчлөгдөхөд солигдоно)
    const etagBase = `${updateTime.toMillis()}:${arr.length}`;
    const etag = `W/"roster-${etagBase}"`; // weak etag

    const ifNoneMatch = req.headers.get("If-None-Match");
    if (ifNoneMatch && ifNoneMatch === etag) {
      const res = new NextResponse(null, { status: 304 });
      res.headers.set("ETag", etag);
      res.headers.set("Cache-Control", "private, max-age=300, stale-while-revalidate=120");
      res.headers.set("Last-Modified", new Date(updateTime.toMillis()).toUTCString());
      return res;
    }

    // ---------- Response ----------
    const body: RosterPayload = {
      classes,
      students,
      ...(includeRaw ? { raw: arr } : {}),
    };

    const res = NextResponse.json<RosterPayload>(body, { status: 200 });
    // Кэш толгойнууд
    res.headers.set("Cache-Control", "private, max-age=300, stale-while-revalidate=120");
    res.headers.set("ETag", etag);
    res.headers.set("Last-Modified", new Date(updateTime.toMillis()).toUTCString());
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[meta/students] SERVER_ERROR:", msg);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}