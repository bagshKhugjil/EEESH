"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "@/components/auth-provider";
import { useStudentsStore } from "@/store/students-store";
import { useResultsStore } from "@/store/results-store";
import { Loader2, RefreshCw, GraduationCap } from "lucide-react";

// Хичээлүүд
const SUBJECTS = [
    "ХИМИ",
    "ФИЗИК",
    "ТҮҮХ",
    "ОРОС ХЭЛ",
    "НИЙГЭМ",
    "МОНГОЛ ХЭЛ",
    "МАТЕМАТИК",
    "ГАЗАРЗҮЙ",
    "БИОЛОГИ",
    "АНГЛИ ХЭЛ",
] as const;

export default function ClassSubjectResultsTab() {
    const { user } = useAuth();

    // ✅ Сурагчдын жагсаалт + дүнгийн store
    const students = useStudentsStore((s) => s.students);
    const { data: resultsData, lastFetchedAt, setBulkResults } = useResultsStore();

    // Анги/хичээл сонголт
    const [selectedClass, setSelectedClass] = useState<string>("");
    const [selectedSubject, setSelectedSubject] = useState<string>("");

    // Bulk API loading state
    const [bulkLoading, setBulkLoading] = useState(false);
    const [bulkErr, setBulkErr] = useState<string | null>(null);

    // ✅ Кэш freshness (24 цаг)
    const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
    const isCacheFresh = !!lastFetchedAt && Date.now() - lastFetchedAt < CACHE_TTL_MS;

    // Ангиудын жагсаалт
    const classes = useMemo(() => {
        const set = new Set<string>();
        students.forEach((s) => s.class && set.add(s.class));
        return Array.from(set).sort();
    }, [students]);

    // ✅ Бүх сурагчдын дүн багцаар татах
    const loadBulkResults = useCallback(
        async (force = false) => {
            if (!user) return;

            // Кэш шинэхэн бол дахин татахгүй
            if (!force && isCacheFresh) {
                return;
            }

            setBulkLoading(true);
            setBulkErr(null);
            try {
                const token = await user.getIdToken();
                const res = await fetch(`/api/admin/students/results/bulk`, {
                    headers: { Authorization: `Bearer ${token}` },
                });

                if (!res.ok) {
                    const json = await res.json().catch(() => ({}));
                    throw new Error(json.error || "Дүн татаж чадсангүй.");
                }

                const json = (await res.json()) as { ok: boolean; data: any; error?: string };
                if (!json.ok) throw new Error(json.error || "Дүн татаж чадсангүй.");

                setBulkResults(json.data || {}, Date.now());
            } catch (e) {
                setBulkErr(e instanceof Error ? e.message : "Тодорхойгүй алдаа.");
            } finally {
                setBulkLoading(false);
            }
        },
        [user, isCacheFresh, setBulkResults]
    );

    // Component mount үед bulk татах (хэрэв кэш байхгүй бол)
    useEffect(() => {
        void loadBulkResults(false);
    }, [loadBulkResults]);

    // ✅ Тухайн ангийн сурагчдын тухайн хичээлээр дүн
    const classSubjectData = useMemo(() => {
        if (!selectedClass || !selectedSubject) return [];

        // Тухайн ангийн сурагчид
        const classStudents = students.filter((s) => s.class === selectedClass);

        // Сурагч бүрийн дүн
        const rows = classStudents.map((student) => {
            const studentResults = resultsData[student.id];
            const subjectResult = studentResults?.results?.[selectedSubject];

            return {
                studentId: student.id,
                lastName: student.lastName || "",
                firstName: student.firstName || "",
                email: student.email,
                externalId: student.externalId,
                average: subjectResult?.average ?? null,
                history: subjectResult?.history || [],
            };
        });

        // Дундажаар эрэмбэлэх (их → бага)
        return rows.sort((a, b) => {
            if (a.average === null && b.average === null) return 0;
            if (a.average === null) return 1;
            if (b.average === null) return -1;
            return b.average - a.average;
        });
    }, [students, resultsData, selectedClass, selectedSubject]);

    // Кэш хэзээ татсан
    const cacheAge = useMemo(() => {
        if (!lastFetchedAt) return "";
        const minutes = Math.floor((Date.now() - lastFetchedAt) / 1000 / 60);
        if (minutes < 1) return "Яг одоо";
        if (minutes < 60) return `${minutes} минутын өмнө`;
        const hours = Math.floor(minutes / 60);
        return `${hours} цагийн өмнө`;
    }, [lastFetchedAt]);

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="bg-purple-500/10 p-2 rounded-lg border border-purple-500/20">
                        <GraduationCap className="w-6 h-6 text-purple-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold">Анги/Хичээлээр дүн харах</h2>
                        <p className="text-sm text-muted">Ангийн сурагчдын дүнг хичээлээр харах</p>
                    </div>
                </div>

                {/* Refresh контрол */}
                <div className="flex items-center gap-2">
                    {lastFetchedAt && (
                        <span className="text-xs text-muted">Кэш: {cacheAge}</span>
                    )}
                    <button
                        onClick={() => void loadBulkResults(true)}
                        disabled={bulkLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stroke bg-card2 text-text text-sm font-bold hover:bg-card hover:border-muted-stroke disabled:opacity-50"
                        title="Дахин татах"
                    >
                        <RefreshCw className={`w-4 h-4 ${bulkLoading ? "animate-spin" : ""}`} />
                        {bulkLoading ? "Татаж байна..." : "Шинэчлэх"}
                    </button>
                </div>
            </div>

            {/* Bulk loading state */}
            {bulkLoading && !lastFetchedAt && (
                <div className="flex items-center justify-center py-10 text-muted bg-card border border-stroke rounded-xl">
                    <Loader2 className="animate-spin mr-2" />
                    <span>Бүх сурагчдын дүн татаж байна...</span>
                </div>
            )}

            {/* Bulk error */}
            {bulkErr && (
                <div className="text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                    {bulkErr}
                </div>
            )}

            {/* Filters */}
            {!bulkLoading && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Анги сонгох */}
                    <select
                        value={selectedClass}
                        onChange={(e) => setSelectedClass(e.target.value)}
                        className="w-full rounded-md px-3 py-2 text-sm"
                        style={{ background: "var(--card2)", border: "1px solid var(--stroke)", color: "var(--text)" }}
                        aria-label="Анги сонгох"
                    >
                        <option value="">— Анги сонгох —</option>
                        {classes.map((c) => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>

                    {/* Хичээл сонгох */}
                    <select
                        value={selectedSubject}
                        onChange={(e) => setSelectedSubject(e.target.value)}
                        className="w-full rounded-md px-3 py-2 text-sm"
                        style={{ background: "var(--card2)", border: "1px solid var(--stroke)", color: "var(--text)" }}
                        aria-label="Хичээл сонгох"
                    >
                        <option value="">— Хичээл сонгох —</option>
                        {SUBJECTS.map((s) => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </div>
            )}

            {/* Content */}
            {!selectedClass || !selectedSubject ? (
                <div className="text-center py-10 text-muted bg-card border border-stroke rounded-xl">
                    Анги болон хичээл сонгоно уу.
                </div>
            ) : classSubjectData.length === 0 ? (
                <div className="text-center py-10 text-muted bg-card border border-stroke rounded-xl">
                    Энэ ангийн сурагчдын дүн олдсонгүй.
                </div>
            ) : (
                <div className="border border-stroke rounded-xl overflow-hidden">
                    {/* Header */}
                    <div className="px-4 py-3 bg-card2 border-b border-stroke">
                        <div className="font-bold">
                            {selectedClass} • {selectedSubject} — {classSubjectData.length} сурагч
                        </div>
                    </div>

                    {/* Table */}
                    <div className="overflow-auto">
                        <table className="min-w-full text-sm">
                            <thead className="bg-card2 border-b border-stroke">
                                <tr>
                                    <th className="px-3 py-2 text-left">№</th>
                                    <th className="px-3 py-2 text-left">Овог</th>
                                    <th className="px-3 py-2 text-left">Нэр</th>
                                    <th className="px-3 py-2 text-left">И-мэйл</th>
                                    <th className="px-3 py-2 text-left">Дундаж</th>
                                    <th className="px-3 py-2 text-left">Шалгалтын тоо</th>
                                </tr>
                            </thead>
                            <tbody>
                                {classSubjectData.map((row, idx) => (
                                    <tr key={row.studentId} className="border-b border-stroke hover:bg-card2/50">
                                        <td className="px-3 py-2">{idx + 1}</td>
                                        <td className="px-3 py-2">{row.lastName}</td>
                                        <td className="px-3 py-2">{row.firstName}</td>
                                        <td className="px-3 py-2 text-muted text-xs">{row.email}</td>
                                        <td className="px-3 py-2">
                                            {row.average !== null ? (
                                                <span className={`font-bold ${row.average >= 90 ? "text-green-400" :
                                                        row.average >= 70 ? "text-blue-400" :
                                                            row.average >= 50 ? "text-yellow-400" :
                                                                "text-red-400"
                                                    }`}>
                                                    {row.average}%
                                                </span>
                                            ) : (
                                                <span className="text-muted">—</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-muted">{row.history.length}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Stats footer */}
                    <div className="px-4 py-3 bg-card2 border-t border-stroke flex items-center justify-between text-sm">
                        <div className="text-muted">
                            Нийт: {classSubjectData.length} сурагч
                        </div>
                        <div className="text-muted">
                            Дундаж: {" "}
                            <span className="font-bold text-text">
                                {classSubjectData.filter(r => r.average !== null).length > 0
                                    ? (
                                        classSubjectData
                                            .filter(r => r.average !== null)
                                            .reduce((sum, r) => sum + (r.average || 0), 0) /
                                        classSubjectData.filter(r => r.average !== null).length
                                    ).toFixed(1)
                                    : "0"}%
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
