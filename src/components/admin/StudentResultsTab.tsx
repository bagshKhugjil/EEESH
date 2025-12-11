"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "@/components/auth-provider";
import { useStudentsStore } from "@/store/students-store";
import { useResultsStore, StudentResults } from "@/store/results-store";
import { Loader2, RefreshCw } from "lucide-react";

export default function StudentResultsTab() {
  const { user } = useAuth();

  // ✅ Сурагчдын жагсаалт local кэшээс
  const students = useStudentsStore((s) => s.students);

  // ✅ Дүнгийн store
  const { data: resultsData, lastFetchedAt, setBulkResults } = useResultsStore();

  // Анги/сурагчийн шүүлт
  const [classFilter, setClassFilter] = useState<string>("");
  const [studentId, setStudentId] = useState<string>("");

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

  // Ангигаар шүүсэн сурагчид
  const filteredStudents = useMemo(() => {
    const arr = classFilter ? students.filter((s) => (s.class || "") === classFilter) : students;
    return [...arr].sort((a, b) => {
      const A = `${a.lastName || ""} ${a.firstName || ""} ${a.email || ""}`.toLowerCase();
      const B = `${b.lastName || ""} ${b.firstName || ""} ${b.email || ""}`.toLowerCase();
      return A < B ? -1 : A > B ? 1 : 0;
    });
  }, [students, classFilter]);

  // Сонгогдсон анги өөрчлөгдөхөд сурагч сонголтыг reset
  useEffect(() => {
    setStudentId("");
  }, [classFilter]);

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

        const json = (await res.json()) as { ok: boolean; data: Record<string, StudentResults>; error?: string };
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

  // Component mount үед bulk татах
  useEffect(() => {
    void loadBulkResults(false);
  }, [loadBulkResults]);

  // ✅ Сонгогдсон сурагчийн дүн local кэшээс
  const selectedStudentData = useMemo(() => {
    if (!studentId) return null;
    return resultsData[studentId] || null;
  }, [studentId, resultsData]);

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === studentId) || null,
    [students, studentId]
  );

  // Кэш хэзээ татсан харуулах
  const cacheAge = useMemo(() => {
    if (!lastFetchedAt) return "";
    const minutes = Math.floor((Date.now() - lastFetchedAt) / 1000 / 60);
    if (minutes < 1) return "Яг одоо";
    if (minutes < 60) return `${minutes} минутын өмнө`;
    const hours = Math.floor(minutes / 60);
    return `${hours} цагийн өмнө`;
  }, [lastFetchedAt]);

  return (
    <div className="card border border-stroke bg-card p-6 rounded-2xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">Сурагчийн дүн (results_flat)</h2>

        {/* Refresh товч болон кэш статус */}
        <div className="flex items-center gap-2">
          {lastFetchedAt && (
            <span className="text-xs text-muted">
              Кэш: {cacheAge}
            </span>
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
        <div className="flex items-center justify-center py-10 text-muted">
          <Loader2 className="animate-spin mr-2" />
          <span>Бүх сурагчдын дүн татаж байна...</span>
        </div>
      )}

      {/* Bulk error */}
      {bulkErr && (
        <div className="mb-4 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          {bulkErr}
        </div>
      )}

      {/* Filters */}
      {!bulkLoading && (
        <div className="flex flex-col md:flex-row gap-3 mb-4">
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="w-full md:w-60 rounded-md px-3 py-2 text-sm"
            style={{ background: "var(--card2)", border: "1px solid var(--stroke)", color: "var(--text)" }}
            aria-label="Анги шүүх"
          >
            <option value="">Бүх анги</option>
            {classes.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="w-full md:w-80 rounded-md px-3 py-2 text-sm"
            style={{ background: "var(--card2)", border: "1px solid var(--stroke)", color: "var(--text)" }}
            aria-label="Сурагч сонгох"
          >
            <option value="">— Сурагч сонгох —</option>
            {filteredStudents.map((s) => {
              const label = `${s.lastName || ""} ${s.firstName || ""}`.trim() || s.email || s.id;
              return (
                <option key={s.id} value={s.id}>
                  {label} {s.class ? `• ${s.class}` : ""} {s.email ? `• ${s.email}` : ""}
                </option>
              );
            })}
          </select>
        </div>
      )}

      {/* Summary of chosen student */}
      {selectedStudent && (
        <div className="mb-4 text-sm text-muted">
          Сонгогдсон: <span className="font-bold text-text">{`${selectedStudent.lastName || ""} ${selectedStudent.firstName || ""}`.trim() || selectedStudent.email}</span>
          {selectedStudent.class ? ` • Анги: ${selectedStudent.class}` : ""}
          {selectedStudent.externalId ? ` • ID: ${selectedStudent.externalId}` : ""}
        </div>
      )}

      {/* Content */}
      {!studentId ? (
        <div className="text-muted">Дээрээс анги, дараа нь сурагч сонгоно уу.</div>
      ) : !selectedStudentData ? (
        <div className="text-muted">Энэ сурагчийн дүн олдсонгүй.</div>
      ) : selectedStudentData.subjects.length === 0 ? (
        <div className="text-muted">Дүн олдсонгүй.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {selectedStudentData.subjects.map((subj) => {
            const bucket = selectedStudentData.results[subj];
            return (
              <div key={subj} className="border border-stroke rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-card2 border-b border-stroke flex items-center justify-between">
                  <div className="font-bold">{subj}</div>
                  <div className="text-sm text-muted">Дундаж: <span className="font-bold text-text">{bucket?.average ?? 0}</span></div>
                </div>
                <div className="p-3 overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left border-b border-stroke">
                        <th className="px-2 py-2">Огноо</th>
                        <th className="px-2 py-2">Нийт (%)</th>
                        <th className="px-2 py-2">Part 1</th>
                        <th className="px-2 py-2">Part 2</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bucket?.history?.map((h, i) => (
                        <tr key={i} className="border-b border-stroke">
                          <td className="px-2 py-2 whitespace-nowrap">{h.date || "-"}</td>
                          <td className="px-2 py-2">{h.total ?? "-"}</td>
                          <td className="px-2 py-2">{h.part1 ?? "-"}</td>
                          <td className="px-2 py-2">{h.part2 ?? "-"}</td>
                        </tr>
                      ))}
                      {!bucket?.history?.length && (
                        <tr>
                          <td className="px-2 py-3 text-muted" colSpan={4}>Түүх алга</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}