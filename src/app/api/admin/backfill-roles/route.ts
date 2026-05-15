import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  try {
    // Admin эрх шалгах
    const authz = req.headers.get("Authorization");
    if (!authz?.startsWith("Bearer ")) return json({ error: "UNAUTHORIZED" }, 401);
    const decoded = await adminAuth.verifyIdToken(authz.slice("Bearer ".length));
    if (decoded.role !== "admin") return json({ error: "FORBIDDEN" }, 403);

    // Firestore-оос бүх parentEmail1/2 цуглуулах
    const studentsSnap = await adminDb.collection("students").get();
    const parentEmail1Set = new Set<string>();
    const parentEmail2Set = new Set<string>();
    const studentEmailSet = new Set<string>();

    for (const doc of studentsSnap.docs) {
      const d = doc.data();
      const e1 = String(d.parentEmail1 ?? "").toLowerCase().trim();
      const e2 = String(d.parentEmail2 ?? "").toLowerCase().trim();
      const se = String(d.email ?? "").toLowerCase().trim();
      if (e1) parentEmail1Set.add(e1);
      if (e2) parentEmail2Set.add(e2);
      if (se) studentEmailSet.add(se);
    }

    const results = { parent: 0, student: 0, skipped: 0, errors: 0 };

    // Firebase Auth хэрэглэгчдийг хуудсаар давтах
    let pageToken: string | undefined;
    do {
      const listResult = await adminAuth.listUsers(1000, pageToken);
      pageToken = listResult.pageToken;

      for (const user of listResult.users) {
        const email = String(user.email ?? "").toLowerCase().trim();
        if (!email) { results.skipped++; continue; }

        const existingRole = (user.customClaims as Record<string, unknown> | undefined)?.role as string | undefined;

        // admin/teacher-г хэзээ ч автоматаар өөрчлөхгүй
        if (existingRole === "admin" || existingRole === "teacher") { results.skipped++; continue; }

        try {
          if (parentEmail1Set.has(email) || parentEmail2Set.has(email)) {
            // parent > student — өмнө student байсан ч parent болгоно
            if (existingRole !== "parent") {
              await adminAuth.setCustomUserClaims(user.uid, { role: "parent" });
            }
            results.parent++;
          } else if (studentEmailSet.has(email)) {
            if (existingRole !== "student") {
              await adminAuth.setCustomUserClaims(user.uid, { role: "student" });
            }
            results.student++;
          } else {
            results.skipped++;
          }
        } catch {
          results.errors++;
        }
      }
    } while (pageToken);

    return json({ success: true, results });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/admin/backfill-roles] ERROR:", msg);
    return json({ error: "SERVER_ERROR", detail: msg }, 500);
  }
}
