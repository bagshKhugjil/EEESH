// src/app/api/admin/students/results/bulk/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/adminApp";
import { DecodedIdToken } from "firebase-admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Role = "admin" | "teacher" | "student";
interface DecodedWithRole extends DecodedIdToken { role?: Role | string }

function noStoreJson(body: unknown, status = 200, etag?: string) {
    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    if (etag) headers["ETag"] = etag;
    return NextResponse.json(body, { status, headers });
}

const toNum = (v: unknown): number | undefined => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
    return undefined;
};

function extractPartPercent(x: unknown): number | undefined {
    const direct = toNum(x);
    if (direct !== undefined) return direct;

    if (x && typeof x === "object") {
        const obj = x as Record<string, unknown>;
        const pc = toNum(obj.percentCorrect);
        if (pc !== undefined) return pc;
        const nc = toNum(obj.numCorrect);
        const nq = toNum(obj.numQuestions);
        if (typeof nc === "number" && typeof nq === "number" && nq > 0) {
            return Number(((nc / nq) * 100).toFixed(1));
        }
    }
    return undefined;
}

function computeTotals(row: { score?: unknown; raw?: any }): { total: number | null; part1?: number; part2?: number } {
    const direct = toNum(row.score);
    const p1 = extractPartPercent(row?.raw?.part1);
    const p2 = extractPartPercent(row?.raw?.part2);

    if (typeof direct === "number") return { total: Number(direct), part1: p1, part2: p2 };

    const n1 = toNum(row?.raw?.part1?.numQuestions) ?? 0;
    const n2 = toNum(row?.raw?.part2?.numQuestions) ?? 0;
    if (typeof p1 === "number" && typeof p2 === "number" && (n1 + n2) > 0) {
        const total = Number(((p1 * n1 + p2 * n2) / (n1 + n2)).toFixed(1));
        return { total, part1: p1, part2: p2 };
    }

    if (typeof p1 === "number") return { total: p1, part1: p1, part2: p2 };
    if (typeof p2 === "number") return { total: p2, part1: p1, part2: p2 };
    return { total: null, part1: p1, part2: p2 };
}

type StudentResults = {
    subjects: string[];
    results: Record<string, {
        average: number;
        history: Array<{ date: string; total: number; part1?: number; part2?: number }>
    }>;
};

export async function GET(req: NextRequest) {
    try {
        // ---- Auth: зөвхөн admin ----
        const authz = req.headers.get("Authorization");
        if (!authz?.startsWith("Bearer ")) return noStoreJson({ error: "UNAUTHORIZED" }, 401);
        const token = authz.slice("Bearer ".length);

        let decoded: DecodedWithRole;
        try {
            decoded = (await adminAuth.verifyIdToken(token)) as DecodedWithRole;
        } catch {
            return noStoreJson({ error: "INVALID_TOKEN" }, 401);
        }
        if ((decoded.role as Role) !== "admin") return noStoreJson({ error: "FORBIDDEN" }, 403);

        // ---- ETag дэмжлэг ----
        const clientEtag = req.headers.get("If-None-Match");

        // results_flat-аас бүх мөрийг уншина (limit-ийг өндөр тавих)
        const snap = await adminDb
            .collection("results_flat")
            .select("studentId", "subject", "date", "score", "raw.part1", "raw.part2")
            .limit(10000) // бүх сурагчдын дүн
            .get();

        // Өгөгдлөөс ETag үүсгэх (өгөгдөл өөрчлөгдөх бүрд өөр байна)
        const dataHash = `bulk-${snap.size}-${Date.now()}`;

        // ETag давхцвал 304 буцаах
        if (clientEtag && clientEtag === dataHash) {
            return new NextResponse(null, {
                status: 304,
                headers: { "ETag": dataHash }
            });
        }

        // Сурагч бүрээр бүртгэх
        const byStudent: Record<string, {
            perSubject: Record<string, {
                totals: number[];
                history: Array<{ date: string; total: number; part1?: number; part2?: number }>
            }>;
            subjects: Set<string>;
        }> = {};

        for (const d of snap.docs) {
            const v = d.data() as {
                studentId?: string;
                subject?: string;
                date?: string;
                score?: number | string;
                raw?: { part1?: unknown; part2?: unknown };
            };

            const studentId = String(v.studentId ?? "").trim();
            const subject = String(v.subject ?? "").trim();

            if (!studentId || !subject) continue;

            const { total, part1, part2 } = computeTotals({ score: v.score, raw: v.raw });
            if (total == null) continue;

            const date = (typeof v.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.date)) ? v.date : "";

            // Сурагчийн бүтэц үүсгэх
            if (!byStudent[studentId]) {
                byStudent[studentId] = { perSubject: {}, subjects: new Set() };
            }

            byStudent[studentId].subjects.add(subject);

            if (!byStudent[studentId].perSubject[subject]) {
                byStudent[studentId].perSubject[subject] = { totals: [], history: [] };
            }

            byStudent[studentId].perSubject[subject].totals.push(total);
            byStudent[studentId].perSubject[subject].history.push({
                date,
                total: Number(total.toFixed(1)),
                part1: typeof part1 === "number" ? Number(part1.toFixed(1)) : undefined,
                part2: typeof part2 === "number" ? Number(part2.toFixed(1)) : undefined,
            });
        }

        // Эцсийн формат руу хувиргах
        const data: Record<string, StudentResults> = {};

        Object.entries(byStudent).forEach(([studentId, agg]) => {
            const results: Record<string, { average: number; history: Array<{ date: string; total: number; part1?: number; part2?: number }> }> = {};

            Object.entries(agg.perSubject).forEach(([subj, subjData]) => {
                const avg = subjData.totals.length
                    ? Number((subjData.totals.reduce((a, b) => a + b, 0) / subjData.totals.length).toFixed(1))
                    : 0;

                const history = subjData.history
                    .filter(h => !!h.date)
                    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

                results[subj] = { average: avg, history };
            });

            data[studentId] = {
                subjects: Array.from(agg.subjects).sort(),
                results
            };
        });

        return noStoreJson(
            { ok: true, data },
            200,
            dataHash
        );
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[admin/students/results/bulk] ERROR:", msg);
        return noStoreJson({ error: "SERVER_ERROR", detail: msg }, 500);
    }
}
