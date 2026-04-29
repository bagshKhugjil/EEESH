// src/app/student/page.tsx
"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { getCache, setCache } from "@/lib/cache";

const ReactApexChart: any = dynamic(() => import("react-apexcharts"), { ssr: false });

const PROFILE_TTL_MS = 5 * 60 * 1000;
const RESULTS_TTL_MS = 5 * 60 * 1000;

// ---------------- Types ----------------
type RawHistory = Record<string, any>;
type SubjectResult = { average: number; history: RawHistory[] };
type ResultsByStudent = Record<string, Record<string, SubjectResult>>;
type StudentInfo = {
  id: string;
  externalId?: string | null;
  class: string;
  firstName?: string;
  lastName?: string;
  name: string;
  email?: string | null;
  parentEmail1?: string | null;
  parentEmail2?: string | null;
  phone?: string | null;
};

// ---------------- Utils ----------------
const toNum = (v: any): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v);
  return undefined;
};

const extractPartScore = (x: any): number | undefined => {
  if (x == null) return undefined;
  const direct = toNum(x);
  if (direct !== undefined) return direct;
  if (typeof x === "object") {
    const pc = toNum(x.percentCorrect);
    if (pc !== undefined) return pc;
    const nc = toNum(x.numCorrect);
    const nq = toNum(x.numQuestions);
    if (nc !== undefined && nq !== undefined && nq > 0) {
      return Number(((nc / nq) * 100).toFixed(1));
    }
  }
  return undefined;
};

const extractDate = (h: any): string => {
  const d = h?.date ?? h?.Date ?? h?.examDate ?? h?.uploadedAt ?? h?.updatedAt;
  if (typeof d === "string" && d.trim()) return d.slice(0, 10);
  if (d && typeof d === "object" && typeof d.toDate === "function") return d.toDate().toISOString().slice(0, 10);
  const qid = String(h?.quizId ?? "");
  const m1 = /(\d{4}-\d{2}-\d{2})/.exec(qid); if (m1) return m1[1];
  const m2 = /__?(\d{4})(\d{2})(\d{2})/.exec(qid); if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return "";
};

function normalizeHistory(h: Record<string, any>) {
  const date = extractDate(h);
  const p1Raw = h?.part1 ?? h?.p1 ?? h?.part_1 ?? h?.section1 ?? h?.first ?? h?.firstPart ?? h?.partOne ?? h?.part_01;
  const p2Raw = h?.part2 ?? h?.p2 ?? h?.part_2 ?? h?.section2 ?? h?.second ?? h?.secondPart ?? h?.partTwo ?? h?.part_02;
  const p1 = extractPartScore(p1Raw);
  const p2 = extractPartScore(p2Raw);
  const scoreRaw = h?.total ?? h?.score ?? h?.sum ?? h?.points ?? h?.overall ?? h?.final;
  const score = extractPartScore(scoreRaw);

  const total =
    score ??
    (p1 !== undefined && p2 !== undefined ? Number((p1 + p2).toFixed(1)) :
     p1 !== undefined ? Number(p1.toFixed(1)) :
     p2 !== undefined ? Number(p2.toFixed(1)) : 0);

  return {
    date,
    part1: p1 !== undefined ? Number(p1.toFixed(1)) : undefined,
    part2: p2 !== undefined ? Number(p2.toFixed(1)) : undefined,
    total,
  };
}

const fmt = (v: number | undefined) => (v === undefined ? "—" : Number(v).toFixed(1));

// Responsive chart height helper
function useChartHeight() {
  const [h, setH] = useState<number>(320);
  useEffect(() => {
    const calc = () => {
      const w = window.innerWidth;
      // утсанд намхан, таблет дунд, desktop өндөр
      if (w < 480) setH(240);
      else if (w < 768) setH(280);
      else if (w < 1280) setH(340);
      else setH(420);
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);
  return h;
}

// ---------------- Page ----------------
export default function StudentOnlyPage() {
  const { user } = useAuth();

  // access + IDs
  const [accessChecked, setAccessChecked] = useState(false);
  const [studentId, setStudentId] = useState<string>("");

  // payloads
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [results, setResults] = useState<ResultsByStudent>({});
  const [subjects, setSubjects] = useState<string[]>([]);
  const [subject, setSubject] = useState<string>("");

  // states
  const [loadingStudent, setLoadingStudent] = useState(true);
  const [loadingResults, setLoadingResults] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // theme
  const [themeMode, setThemeMode] = useState<"light" | "dark">("dark");
  useEffect(() => {
    const t = localStorage.getItem("theme");
    setThemeMode(t === "light" ? "light" : "dark");
  }, []);

  // chart height
  const chartHeight = useChartHeight();

  // 0) зөвшөөрөгдсөн сурагчийн id авах
 // 0) зөвшөөрөгдсөн сурагчийн id авах
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      setErr(null);
      try {
        const token = await user.getIdToken();
        const meRes = await fetch("/api/student/me", { headers: { Authorization: `Bearer ${token}` } });
        if (!meRes.ok) {
          const j = await meRes.json().catch(() => ({}));
          throw new Error(j?.error || "STUDENT_NOT_FOUND");
        }
        const me = await meRes.json();
        if (!cancelled) {
          setStudentId(me.id);
          setAccessChecked(true);
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "ACCESS_ERROR");
          setAccessChecked(true);
          setLoadingStudent(false); // <<< НЭМЭГДСЭН МӨР
          setLoadingResults(false); // <<< НЭМЭГДСЭН МӨР
        }
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // 1) profile (localStorage TTL – хугацаа дуусаагүй бол серверийг алгасна)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user || !accessChecked || !studentId) return;
      setLoadingStudent(true);
      setErr(null);

      const profileKey = `student:profile:${studentId}`;
      const cachedProfile = getCache<StudentInfo>(profileKey, 1);

      if (cachedProfile) {
        setStudent(cachedProfile);
        setLoadingStudent(false);
        return; // 🚫 сервер рүү явахгүй
      }

      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/student/profile`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.error || "STUDENT_NOT_FOUND");
        }
        const fresh = (await res.json()) as StudentInfo;
        if (!cancelled) {
          setStudent(fresh);
          setLoadingStudent(false);
          setCache(profileKey, fresh, PROFILE_TTL_MS, 1);
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Тодорхойгүй алдаа.");
          setLoadingStudent(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [user, accessChecked, studentId]);

  // 2) results (localStorage TTL – хугацаа дуусаагүй бол серверийг алгасна)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user || !accessChecked || !studentId) return;
      setLoadingResults(true);
      setErr(null);

      const resultsKey = `student:results:${studentId}`;
      type ResultsPayload = { subjects: string[]; results: ResultsByStudent };
      const cached = getCache<ResultsPayload>(resultsKey, 1);

      if (cached) {
        setResults(cached.results || {});
        const myMap = cached.results?.[studentId] || {};
        const fromMyMap = Object.entries(myMap).filter(([, v]) => v?.average && v.average > 0).map(([k]) => k);
        const uniq = Array.from(new Set([...(cached.subjects || []), ...fromMyMap])).sort();
        setSubjects(uniq);
        setSubject((prev) => prev || uniq[0] || "");
        setLoadingResults(false);
        return; // 🚫 сервер рүү явахгүй
      }

      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/student/results`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.error || "RESULTS_FETCH_ERROR");
        }
        const fresh = (await res.json()) as ResultsPayload;
        if (!cancelled) {
          setResults(fresh.results || {});
          const myMap = fresh.results?.[studentId] || {};
          const fromMyMap = Object.entries(myMap).filter(([, v]) => v?.average && v.average > 0).map(([k]) => k);
          const uniq = Array.from(new Set([...(fresh.subjects || []), ...fromMyMap])).sort();
          setSubjects(uniq);
          setSubject((prev) => prev || uniq[0] || "");
          setLoadingResults(false);
          setCache(resultsKey, fresh, RESULTS_TTL_MS, 1);
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Тодорхойгүй алдаа.");
          setLoadingResults(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [user, accessChecked, studentId]);

  // Сонгосон хичээлийн detail
  const subjectDetail = useMemo(() => {
    if (!studentId || !subject) return null;
    const my = results[studentId]?.[subject];
    if (!my) return null;

    const history = (my.history || [])
      .map((row) => normalizeHistory(row))
      .sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
      });

    return { average: my.average, history };
  }, [results, studentId, subject]);

  const perfCategories = useMemo(
    () => (subjectDetail?.history || []).map((row, i) => row.date || `#${i + 1}`),
    [subjectDetail]
  );
  const perfData = useMemo(
    () => (subjectDetail?.history || []).map((row) => (Number.isFinite(row.total) ? row.total : 0)),
    [subjectDetail]
  );

  // Ерөнхий дундаж
  const overallAvg = useMemo(() => {
    const subjRes = results[studentId] || {};
    const avgs = Object.values(subjRes).map((r) => r.average).filter((n) => Number.isFinite(n));
    return avgs.length ? Number((avgs.reduce((a, b) => a + b, 0) / avgs.length).toFixed(1)) : 0;
  }, [results, studentId]);

  // ----------- UI states -----------
  if (!accessChecked || user === undefined) {
    return <div className="min-h-dvh flex items-center justify-center text-[var(--muted)] px-4">Эрх шалгаж байна…</div>;
  }
  if (loadingStudent || loadingResults) {
    return <div className="min-h-dvh flex items-center justify-center text-[var(--muted)] px-4">Ачааллаж байна…</div>;
  }
  if (err || !student) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-4">
        <div className="p-5 sm:p-6 rounded-2xl max-w-lg w-full"
             style={{ background: "var(--card)", border: "1px solid var(--stroke)", color: "var(--text)" }}>
          <div className="font-bold mb-2">Алдаа</div>
          <div className="text-[var(--muted)]">Мэдээлэл олдсонгүй эсвэл алдаа гарлаа.</div>
          {err && <div className="mt-3 text-red-400 text-sm break-words">{String(err)}</div>}
        </div>
      </div>
    );
  }

  // ----------- Render -----------
  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--text)]">
      {/* Sticky top bar – subject picker always visible on mobile */}
      <div
        className="sticky top-0 z-30 px-4 py-3 border-b backdrop-blur supports-[backdrop-filter]:bg-[color:var(--card)/0.7] bg-[var(--card)] md:rounded-none"
        style={{ borderColor: "var(--stroke)" }}
      >
        <div className="max-w-[1100px] mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="text-base font-bold sm:text-lg">{student.name}</div>
            {student.externalId ? <div className="text-xs text-[var(--muted)]">Код: {student.externalId}</div> : null}
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <label className="text-[var(--muted)] text-xs sm:text-sm">Хичээл</label>
            <select
              className="flex-1 sm:flex-none rounded-lg px-3 py-2 text-sm sm:text-base"
              
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              {subjects.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-4 py-4 sm:py-6">
        {/* Header stats */}
        <div
          className="rounded-2xl p-4 sm:p-5 mb-4 sm:mb-6 grid grid-cols-2 gap-3 sm:flex sm:items-center sm:justify-between"
          style={{ background: "var(--card)", border: "1px solid var(--stroke)" }}
        >
          <div className="col-span-2 sm:col-span-1">
            <div className="text-sm sm:text-base text-[var(--muted)]">Анги: {student.class || "-"}</div>
            <div className="text-lg sm:text-xl font-extrabold mt-1">{student.name}</div>
          </div>
          <div className="grid grid-cols-2 gap-3 w-full sm:w-auto">
            <div className="rounded-xl p-3 text-center"
                 style={{ background: "var(--bg)", border: "1px solid var(--stroke)" }}>
              <div className="text-[10px] sm:text-xs font-semibold text-[var(--muted)]">Нийт дундаж</div>
              <div className="text-xl sm:text-2xl font-extrabold text-[var(--primary-bg)]">{overallAvg || "--"}</div>
            </div>
            {subjectDetail && (
              <div className="rounded-xl p-3 text-center"
                   style={{ background: "var(--bg)", border: "1px solid var(--stroke)" }}>
                <div className="text-[10px] sm:text-xs font-semibold text-[var(--muted)]">Энэ хичээлийн дундаж</div>
                <div className="text-xl sm:text-2xl font-extrabold text-[var(--primary-bg)]">
                  {subjectDetail.average ?? "--"}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Last exam breakdown */}
        {subject && subjectDetail && subjectDetail.history.length > 0 && (
          <div className="grid gap-3 sm:gap-4 mb-4 sm:mb-6"
               style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))" }}>
            {(() => {
              const last = subjectDetail.history[subjectDetail.history.length - 1];
              return (
                <>
                  <div className="rounded-xl p-3 sm:p-4 text-center"
                       style={{ background: "var(--card)", border: "1px solid var(--stroke)" }}>
                    <div className="text-[10px] sm:text-xs text-[var(--muted)] font-semibold">1-р хэсэг</div>
                    <div className="text-xl sm:text-2xl font-extrabold text-[var(--primary-bg)]">{fmt(last.part1)}</div>
                  </div>
                  <div className="rounded-xl p-3 sm:p-4 text-center"
                       style={{ background: "var(--card)", border: "1px solid var(--stroke)" }}>
                    <div className="text-[10px] sm:text-xs text-[var(--muted)] font-semibold">2-р хэсэг</div>
                    <div className="text-xl sm:text-2xl font-extrabold text-[var(--primary-bg)]">{fmt(last.part2)}</div>
                  </div>
                  <div className="rounded-xl p-3 sm:p-4 text-center"
                       style={{ background: "var(--card)", border: "1px solid var(--stroke)" }}>
                    <div className="text-[10px] sm:text-xs text-[var(--muted)] font-semibold">Нийт</div>
                    <div className="text-xl sm:text-2xl font-extrabold text-[var(--primary-bg)]">{fmt(last.total)}</div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* Performance chart */}
        {subject && subjectDetail && (
          <div className="rounded-2xl p-3 sm:p-4 mb-4 sm:mb-6"
               style={{ background: "var(--card)", border: "1px solid var(--stroke)" }}>
            <div className="text-sm sm:text-base font-bold mb-2 sm:mb-3">{subject} — онооны ахиц</div>
            <div className="overflow-x-auto -mx-2 sm:mx-0 px-2">
              <ReactApexChart
                key={`student-${themeMode}-${studentId}-${subject}`}
                options={{
                  chart: { type: "area", background: "transparent", toolbar: { show: false }, zoom: { enabled: false } },
                  theme: { mode: themeMode },
                  xaxis: { categories: perfCategories, labels: { rotate: -25, style: { fontSize: "11px" } } },
                  yaxis: { min: 0, max: 100, tickAmount: 5 },
                  dataLabels: { enabled: true, formatter: (val: number) => Number(val).toFixed(1) },
                  stroke: { curve: "smooth", width: 3 },
                  grid: { borderColor: "var(--stroke)", strokeDashArray: 4 },
                  colors: ["var(--primary-bg)"],
                  tooltip: { theme: themeMode },
                }}
                series={[{ name: "Нийт оноо", data: perfData }]}
                type="area"
                height={chartHeight}
              />
            </div>
          </div>
        )}

        {/* History – mobile cards / desktop table */}
        {subject && subjectDetail && (
          <div className="rounded-2xl p-3 sm:p-4"
               style={{ background: "var(--card)", border: "1px solid var(--stroke)" }}>
            <div className="text-sm sm:text-base font-bold mb-2 sm:mb-3">Түүхэн дүн</div>

            {/* Mobile list cards */}
            <div className="md:hidden space-y-2">
              {(subjectDetail.history || []).map((row, i) => (
                <div key={`${row.date || "nd"}-${i}`}
                     className="rounded-xl p-3 flex items-center justify-between"
                     style={{ background: "var(--bg)", border: "1px solid var(--stroke)" }}>
                  <div>
                    <div className="text-xs text-[var(--muted)]">{row.date || "—"}</div>
                    <div className="mt-1 text-sm">
                      1-р хэсэг: <b>{fmt(row.part1)}</b> · 2-р хэсэг: <b>{fmt(row.part2)}</b>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-[var(--muted)]">Нийт</div>
                    <div className="text-base font-extrabold text-[var(--primary-bg)]">{fmt(row.total)}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-auto">
              <table className="min-w-[560px] w-full border-collapse">
                <thead>
                  <tr className="text-[var(--muted)] text-xs uppercase border-b border-[var(--stroke)]">
                    <th className="text-left p-2">Огноо</th>
                    <th className="text-left p-2">1-р хэсэг</th>
                    <th className="text-left p-2">2-р хэсэг</th>
                    <th className="text-left p-2">Нийт</th>
                  </tr>
                </thead>
                <tbody>
                  {(subjectDetail.history || []).map((row, i) => (
                    <tr key={`${row.date || "nd"}-${i}`} className="border-b border-[var(--stroke)]">
                      <td className="p-2">{row.date || "—"}</td>
                      <td className="p-2">{fmt(row.part1)}</td>
                      <td className="p-2">{fmt(row.part2)}</td>
                      <td className="p-2"><b>{fmt(row.total)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Radar – hide on very small screens to keep it clean */}
        <div className="rounded-2xl p-3 sm:p-4 mt-4 sm:mt-6 hidden sm:block"
             style={{ background: "var(--card)", border: "1px solid var(--stroke)" }}>
          <div className="text-sm sm:text-base font-bold mb-2 sm:mb-3">Хичээлүүдийн дундаж (энэ сурагч)</div>
          <div className="overflow-x-auto">
            <ReactApexChart
              key={`radar-${themeMode}-${studentId}`}
              options={{
                chart: { type: "radar", background: "transparent", toolbar: { show: false } },
                theme: { mode: themeMode },
                labels: subjects.filter((s) => results[studentId]?.[s]?.average > 0),
                yaxis: { min: 0, max: 100, tickAmount: 5 },
                stroke: { width: 3, curve: "smooth" },
                fill: { opacity: 0.3 },
                colors: ["var(--primary-bg)"],
                plotOptions: { radar: { polygons: { strokeColors: "var(--stroke)", connectorColors: "var(--stroke)" } } },
                tooltip: { theme: themeMode },
              }}
              series={[
                {
                  name: "Дундаж оноо",
                  data: subjects
                    .filter((s) => results[studentId]?.[s]?.average > 0)
                    .map((s) => results[studentId]?.[s]?.average || 0),
                },
              ]}
              type="radar"
              height={Math.max(320, chartHeight)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}