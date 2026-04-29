"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import CustomSelect, { SelectOption } from "@/components/ui/CustomSelect";
import { useAuth } from "@/components/auth-provider";
import { useStudentsStore } from "@/store/students-store";
import { useResultsStore } from "@/store/results-store";
import { Loader2, RefreshCw, GraduationCap, TrendingUp, BarChart2, Activity, ArrowLeft } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

/* ─────────────── Types ─────────────── */
type HistoryItem = { date: string; total: number; part1?: number; part2?: number };
type SubjectResult = { average: number; history: HistoryItem[] };

/* ─────────────── Helpers ─────────────── */
const scoreColor = (v: number) =>
  v >= 90 ? "#22c55e" : v >= 70 ? "#3b82f6" : v >= 50 ? "#eab308" : "#ef4444";

/* ─────────────── Chart Components ─────────────── */

// Series-ийн тогтмол өнгө + нэр
const SERIES_CONFIG = [
  { key: "total",  label: "Нийт",  color: "#818cf8" },
  { key: "part1",  label: "1-р хэсэг", color: "#34d399" },
  { key: "part2",  label: "2-р хэсэг", color: "#fb923c" },
] as const;

function LineChartCard({ subject, history }: { subject: string; history: HistoryItem[] }) {
  const hasP1 = history.some((h) => h.part1 != null);
  const hasP2 = history.some((h) => h.part2 != null);

  // Анх бүх идэвхтэй series-ийг асаана
  const [active, setActive] = useState<Set<string>>(() => {
    const s = new Set<string>(["total"]);
    if (hasP1) s.add("part1");
    if (hasP2) s.add("part2");
    return s;
  });

  // Series дарах бүрт toggle
  const toggle = (key: string) => {
    setActive((prev) => {
      const next = new Set(prev);
      // Хамгийн багадаа нэг идэвхтэй байх ёстой
      if (next.has(key) && next.size === 1) return next;
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Зөвхөн идэвхтэй series-ийг ApexCharts-д дамжуулна
  const visibleSeries = SERIES_CONFIG.filter((c) => {
    if (c.key === "total") return active.has("total");
    if (c.key === "part1") return hasP1 && active.has("part1");
    if (c.key === "part2") return hasP2 && active.has("part2");
    return false;
  });

  const series = visibleSeries.map((c) => ({
    name: c.label,
    data: history.map((h) =>
      c.key === "total" ? h.total : c.key === "part1" ? (h.part1 ?? null) : (h.part2 ?? null)
    ),
  }));

  const opts: ApexCharts.ApexOptions = {
    chart: { type: "line", toolbar: { show: false }, background: "transparent", animations: { enabled: true } },
    stroke: { curve: "smooth", width: visibleSeries.map(() => 2.5) },
    colors: visibleSeries.map((c) => c.color),
    xaxis: {
      categories: history.map((h) => h.date || "-"),
      labels: { style: { colors: "#94a3b8", fontSize: "11px" } },
    },
    yaxis: { min: 0, max: 100, labels: { style: { colors: "#94a3b8" }, formatter: (v) => `${v}%` } },
    tooltip: { theme: "dark", y: { formatter: (v) => `${v}%` } },
    legend: { show: false }, // custom legend ашиглана
    grid: { borderColor: "rgba(148,163,184,0.1)" },
    theme: { mode: "dark" },
    markers: { size: 4, hover: { size: 6 } },
  };

  if (history.length === 0)
    return <div className="text-muted text-sm py-6 text-center">Шалгалтын мэдээлэл алга</div>;

  return (
    <div className="border border-stroke rounded-xl overflow-hidden">
      {/* Header + toggle buttons */}
      <div className="px-4 py-3 bg-card2 border-b border-stroke flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-indigo-400" />
          <span className="font-bold text-sm">{subject} — цагийн хэлхээ</span>
        </div>

        {/* Series toggle chips */}
        <div className="flex items-center gap-1.5">
          {SERIES_CONFIG.filter((c) =>
            c.key === "total" ? true : c.key === "part1" ? hasP1 : hasP2
          ).map((c) => {
            const on = active.has(c.key);
            return (
              <button
                key={c.key}
                onClick={() => toggle(c.key)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition-all ${
                  on
                    ? "border-transparent text-white"
                    : "bg-card border-stroke text-muted opacity-50"
                }`}
                style={on ? { backgroundColor: c.color, borderColor: c.color } : {}}
                title={on ? `${c.label} нуух` : `${c.label} харуулах`}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: on ? "#fff" : c.color }}
                />
                {c.label}
              </button>
            );
          })}
          <span className="text-xs text-muted ml-1">{history.length} шалгалт</span>
        </div>
      </div>

      <div className="p-3 bg-card">
        <ReactApexChart options={opts} series={series as any} type="line" height={240} />
      </div>
    </div>
  );
}

function RadarCard({ subjects, results }: { subjects: string[]; results: Record<string, SubjectResult> }) {
  const data = subjects.map((s) => results[s]?.average ?? 0);
  const opts: ApexCharts.ApexOptions = {
    chart: { type: "radar", toolbar: { show: false }, background: "transparent" },
    colors: ["#818cf8"],
    fill: { opacity: 0.2 },
    stroke: { width: 2 },
    xaxis: { categories: subjects, labels: { style: { colors: Array(subjects.length).fill("#94a3b8"), fontSize: "12px" } } },
    yaxis: { show: false, min: 0, max: 100 },
    tooltip: { theme: "dark", y: { formatter: (v) => `${v}%` } },
    theme: { mode: "dark" },
  };

  if (subjects.length === 0) return null;

  return (
    <div className="border border-stroke rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-card2 border-b border-stroke flex items-center gap-2">
        <Activity className="w-4 h-4 text-purple-400" />
        <span className="font-bold text-sm">Хичээлийн радар</span>
      </div>
      <div className="p-3 bg-card">
        <ReactApexChart options={opts} series={[{ name: "Дундаж", data }]} type="radar" height={260} />
      </div>
    </div>
  );
}

function BarCard({ subjects, results }: { subjects: string[]; results: Record<string, SubjectResult> }) {
  const avgs = subjects.map((s) => results[s]?.average ?? 0);
  const opts: ApexCharts.ApexOptions = {
    chart: { type: "bar", toolbar: { show: false }, background: "transparent" },
    plotOptions: { bar: { borderRadius: 6, distributed: true } },
    colors: avgs.map(scoreColor),
    xaxis: { categories: subjects, labels: { style: { colors: "#94a3b8", fontSize: "11px" }, rotate: -30 } },
    yaxis: { min: 0, max: 100, labels: { style: { colors: "#94a3b8" }, formatter: (v) => `${v}%` } },
    tooltip: { theme: "dark", y: { formatter: (v) => `${v}%` } },
    legend: { show: false },
    grid: { borderColor: "rgba(148,163,184,0.1)" },
    dataLabels: { enabled: true, formatter: (v) => `${v}%`, style: { fontSize: "11px" } },
    theme: { mode: "dark" },
  };

  if (subjects.length === 0) return null;

  return (
    <div className="border border-stroke rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-card2 border-b border-stroke flex items-center gap-2">
        <BarChart2 className="w-4 h-4 text-blue-400" />
        <span className="font-bold text-sm">Хичээл бүрийн дундаж оноо</span>
      </div>
      <div className="p-3 bg-card">
        <ReactApexChart options={opts} series={[{ name: "Дундаж", data: avgs }]} type="bar" height={220} />
      </div>
    </div>
  );
}

/* ─────────────── Main Dashboard ─────────────── */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 цаг

export default function TeacherResultsDashboard() {
  const { user } = useAuth();

  // ✅ Zustand stores — localStorage persist, 24h TTL
  const {
    students,
    setStudents,
    lastFetchedAt: studentsFetchedAt,
  } = useStudentsStore();

  const {
    data: resultsData,
    lastFetchedAt: resultsFetchedAt,
    setBulkResults,
  } = useResultsStore();

  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [classFilter, setClassFilter] = useState("");
  const [studentId, setStudentId] = useState("");
  const [activeSubject, setActiveSubject] = useState("");

  // ✅ Кэш шинэлэг эсэх
  const studentsIsStale = !studentsFetchedAt || Date.now() - studentsFetchedAt >= CACHE_TTL_MS;
  const resultsIsStale = !resultsFetchedAt || Date.now() - resultsFetchedAt >= CACHE_TTL_MS;

  /* ─── Fetch students — кэш хуучирсан үед л дуудна ─── */
  const fetchStudents = useCallback(
    async (force = false) => {
      if (!user) return;
      if (!force && !studentsIsStale && students.length > 0) return; // кэш шинэхэн

      setLoadingStudents(true);
      setErr(null);
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/teacher/students", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || "Сурагч татаж чадсангүй");
        setStudents(json.students ?? [], Date.now());
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Алдаа гарлаа");
      } finally {
        setLoadingStudents(false);
      }
    },
    [user, studentsIsStale, students.length, setStudents]
  );

  /* ─── Fetch results — кэш хуучирсан үед л дуудна ─── */
  const fetchResults = useCallback(
    async (force = false) => {
      if (!user) return;
      if (!force && !resultsIsStale && Object.keys(resultsData).length > 0) return; // кэш шинэхэн

      setLoadingResults(true);
      setErr(null);
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/teacher/students/results/bulk", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || "Дүн татаж чадсангүй");
        setBulkResults(json.data ?? {}, Date.now());
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Алдаа гарлаа");
      } finally {
        setLoadingResults(false);
      }
    },
    [user, resultsIsStale, resultsData, setBulkResults]
  );

  useEffect(() => { void fetchStudents(false); }, [fetchStudents]);
  useEffect(() => { void fetchResults(false); }, [fetchResults]);

  /* ─── Derived ─── */
  const classes = useMemo(() => {
    const s = new Set<string>();
    students.forEach((st) => st.class && s.add(st.class));
    return Array.from(s).sort();
  }, [students]);

  const filteredStudents = useMemo(() => {
    const arr = classFilter ? students.filter((s) => s.class === classFilter) : students;
    return arr.slice().sort((a, b) => {
      const A = `${a.lastName ?? ""} ${a.firstName ?? ""}`.toLowerCase();
      const B = `${b.lastName ?? ""} ${b.firstName ?? ""}`.toLowerCase();
      return A < B ? -1 : A > B ? 1 : 0;
    });
  }, [students, classFilter]);

  useEffect(() => setStudentId(""), [classFilter]);

  const selectedStudent = useMemo(() => students.find((s) => s.id === studentId) ?? null, [students, studentId]);
  const selectedResults = useMemo(() => (studentId ? resultsData[studentId] ?? null : null), [studentId, resultsData]);
  const subjects = selectedResults?.subjects ?? [];

  useEffect(() => {
    if (subjects.length > 0 && !subjects.includes(activeSubject)) setActiveSubject(subjects[0]);
  }, [subjects, activeSubject]);

  /* ─── Cache age display ─── */
  const cacheAge = useMemo(() => {
    const ts = resultsFetchedAt;
    if (!ts) return "";
    const m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return "Яг одоо";
    if (m < 60) return `${m} мин өмнө`;
    return `${Math.floor(m / 60)} цаг өмнө`;
  }, [resultsFetchedAt]);

  const isLoading = loadingStudents || loadingResults;
  const isCached = !!resultsFetchedAt && !resultsIsStale;

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {/* Буцах товч */}
          <Link
            href="/teacher"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-stroke bg-card2 text-muted text-sm font-bold hover:text-text hover:border-indigo-500/40 hover:bg-indigo-500/10 transition-all"
            title="Багшийн нүүр рүү буцах"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Буцах</span>
          </Link>

          <div className="bg-indigo-500/10 p-2 rounded-lg border border-indigo-500/20">
            <GraduationCap className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Сурагчийн шалгалтын дүн</h1>
            <p className="text-sm text-muted">Анги → Сурагч → Хичээл сонгоод графикаар харна уу</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* ✅ Кэш статус */}
          {isCached && (
            <span
              className="text-xs px-2 py-1 rounded-md border border-stroke bg-card2 text-muted"
              title="Кэшнээс харж байна — дахин татаагүй"
            >
              📦 Кэш: {cacheAge}
            </span>
          )}
          <button
            onClick={() => { void fetchStudents(true); void fetchResults(true); }}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stroke bg-card2 text-text text-sm font-bold hover:bg-card disabled:opacity-50"
            title="Серверээс хүчээр шинэчлэх"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            {isLoading ? "Татаж байна..." : "Шинэчлэх"}
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {err && (
        <div className="text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm">{err}</div>
      )}

      {/* ── Initial loading ── */}
      {isLoading && students.length === 0 && (
        <div className="flex items-center justify-center py-16 text-muted">
          <Loader2 className="animate-spin mr-2" />
          <span>Мэдээлэл татаж байна...</span>
        </div>
      )}

      {/* ── Filters ── */}
      {!isLoading && (
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Анги сонгох */}
          <CustomSelect
            aria-label="Анги сонгох"
            className="w-full sm:w-52"
            placeholder="— Бүх анги —"
            value={classFilter}
            onChange={setClassFilter}
            options={[
              ...classes.map((c): SelectOption => ({ value: c, label: c })),
            ]}
          />

          {/* Сурагч сонгох — searchable */}
          <CustomSelect
            aria-label="Сурагч сонгох"
            className="w-full sm:flex-1"
            placeholder="— Сурагч сонгох —"
            searchable
            value={studentId}
            onChange={setStudentId}
            options={filteredStudents.map((s): SelectOption => ({
              value: s.id,
              label: `${s.lastName ?? ""} ${s.firstName ?? ""}`.trim() || s.email || s.id,
              meta: s.class ? `• ${s.class}` : undefined,
            }))}
          />
        </div>
      )}

      {/* ── Student summary card ── */}
      {selectedStudent && (
        <div className="flex items-center gap-3 p-3 rounded-xl border border-stroke bg-card2 text-sm">
          <div className="w-9 h-9 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-base shrink-0">
            {((selectedStudent.lastName ?? selectedStudent.firstName ?? "?")[0]).toUpperCase()}
          </div>
          <div>
            <div className="font-bold">
              {`${selectedStudent.lastName ?? ""} ${selectedStudent.firstName ?? ""}`.trim() || selectedStudent.email}
            </div>
            <div className="text-muted text-xs">
              {selectedStudent.class ? `Анги: ${selectedStudent.class}` : ""}
              {selectedStudent.externalId ? ` • ID: ${selectedStudent.externalId}` : ""}
            </div>
          </div>
          {selectedResults && (
            <div className="ml-auto flex gap-2 flex-wrap justify-end">
              {selectedResults.subjects.map((s) => (
                <span key={s} className="px-2 py-0.5 rounded-full text-xs border border-indigo-500/30 bg-indigo-500/10 text-indigo-300">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Empty states ── */}
      {!studentId && !isLoading && (
        <div className="text-center py-16 text-muted border border-stroke rounded-xl bg-card">
          Дээрээс анги болон сурагч сонгоно уу.
        </div>
      )}

      {studentId && !isLoading && !selectedResults && (
        <div className="text-center py-16 text-muted border border-stroke rounded-xl bg-card">
          Энэ сурагчийн шалгалтын мэдээлэл олдсонгүй.
        </div>
      )}

      {/* ── Charts ── */}
      {selectedResults && subjects.length > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <BarCard subjects={subjects} results={selectedResults.results} />
            <RadarCard subjects={subjects} results={selectedResults.results} />
          </div>

          {/* Subject tabs */}
          <div className="border border-stroke rounded-xl overflow-hidden">
            <div className="flex flex-wrap gap-1 p-3 bg-card2 border-b border-stroke">
              {subjects.map((s) => {
                const avg = selectedResults.results[s]?.average ?? 0;
                return (
                  <button
                    key={s}
                    onClick={() => setActiveSubject(s)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border ${
                      activeSubject === s
                        ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300"
                        : "bg-card border-stroke text-muted hover:text-text"
                    }`}
                  >
                    {s}
                    <span className="ml-1.5" style={{ color: scoreColor(avg) }}>{avg}%</span>
                  </button>
                );
              })}
            </div>

            {activeSubject && selectedResults.results[activeSubject] && (
              <div className="p-4 bg-card space-y-4">
                <LineChartCard
                  subject={activeSubject}
                  history={selectedResults.results[activeSubject].history}
                />

                {/* History table */}
                <div className="overflow-auto rounded-lg border border-stroke">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left border-b border-stroke text-muted bg-card2">
                        <th className="px-3 py-2">Огноо</th>
                        <th className="px-3 py-2">Нийт (%)</th>
                        <th className="px-3 py-2">Part 1</th>
                        <th className="px-3 py-2">Part 2</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedResults.results[activeSubject].history.map((h, i) => (
                        <tr key={i} className="border-b border-stroke hover:bg-card2/50">
                          <td className="px-3 py-2 font-mono text-xs">{h.date || "—"}</td>
                          <td className="px-3 py-2 font-bold" style={{ color: scoreColor(h.total) }}>{h.total}%</td>
                          <td className="px-3 py-2 text-muted">{h.part1 != null ? `${h.part1}%` : "—"}</td>
                          <td className="px-3 py-2 text-muted">{h.part2 != null ? `${h.part2}%` : "—"}</td>
                        </tr>
                      ))}
                      {selectedResults.results[activeSubject].history.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-3 py-4 text-muted text-center">Мэдээлэл алга</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
