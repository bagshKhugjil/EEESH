// src/app/student/page.tsx
"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";

const ReactApexChart: any = dynamic(() => import("react-apexcharts"), { ssr: false });
// дээр нь нэмнэ
import { getCache, setCache } from "@/lib/cache";

// хүссэн TTL (жишээ нь 5 минут)
const PROFILE_TTL_MS = 5 * 60 * 1000;
const RESULTS_TTL_MS = 5 * 60 * 1000; // results богинохон хадгалъя

// ---------------- Types ----------------
type RawHistory = Record<string, any>;

type SubjectResult = {
  average: number;
  history: RawHistory[];
};
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

// Firestore part1/part2 нь map байж болно
// Firestore-т part1/part2 нь объект { numCorrect, percentCorrect, ... } хэлбэртэй
const extractPartScore = (x: any): number | undefined => {
  if (x == null) return undefined;

  // Шууд тоо/стринг бол
  const direct = toNum(x);
  if (direct !== undefined) return direct;

  // Объект бол
  if (typeof x === "object") {
    // Энд голчлон percentCorrect-ийг ашиглая
    if (toNum(x.percentCorrect) !== undefined) return toNum(x.percentCorrect);
    if (toNum(x.numCorrect) !== undefined && toNum(x.numQuestions)) {
      // Хэрэв зөв тоо / нийтээр нь хувиар тооцоолох
      return Number(((x.numCorrect / x.numQuestions) * 100).toFixed(1));
    }
  }

  return undefined;
};

// date байхгүй бол uploadedAt/updatedAt эсвэл quizId-оос сугалж авах
const extractDate = (h: any): string => {
  const d = h?.date ?? h?.Date ?? h?.examDate ?? h?.uploadedAt ?? h?.updatedAt;
  if (typeof d === "string" && d.trim()) return d.slice(0, 10); // YYYY-MM-DD
  // Firestore Timestamp?
  if (d && typeof d === "object" && typeof d.toDate === "function") {
    return d.toDate().toISOString().slice(0, 10);
  }
  const qid = String(h?.quizId ?? "");
  const m1 = /(\d{4}-\d{2}-\d{2})/.exec(qid);
  if (m1) return m1[1];
  const m2 = /__?(\d{4})(\d{2})(\d{2})/.exec(qid);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return ""; // байхгүй байж болно
};

function normalizeHistory(h: Record<string, any>) {
  const date = extractDate(h);

  const p1Raw =
    h?.part1 ?? h?.p1 ?? h?.part_1 ?? h?.section1 ?? h?.first ?? h?.firstPart ?? h?.partOne ?? h?.part_01;
  const p2Raw =
    h?.part2 ?? h?.p2 ?? h?.part_2 ?? h?.section2 ?? h?.second ?? h?.secondPart ?? h?.partTwo ?? h?.part_02;

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
    date, // хоосон байж болно
    part1: p1 !== undefined ? Number(p1.toFixed(1)) : undefined,
    part2: p2 !== undefined ? Number(p2.toFixed(1)) : undefined,
    total,
  };
}

const fmt = (v: number | undefined) => (v === undefined ? "—" : Number(v).toFixed(1));
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

  // 0) зөвшөөрөгдсөн сурагчийн id авах
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
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
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // 1) profile

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!user || !accessChecked || !studentId) return;
      setLoadingStudent(true);
      setErr(null);
  
      const profileKey = `student:profile:${studentId}`;
      const cachedProfile = getCache<StudentInfo>(profileKey, 1);
  
      if (cachedProfile) {
        // Кэш хугацаа дуусаагүй → шууд ашиглана
        setStudent(cachedProfile);
        setLoadingStudent(false);
        return; // ✅ сервер рүү дахин fetch хийхгүй
      }
  
      // Хугацаа дууссан эсвэл кэш байхгүй → серверээс татна
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/student/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
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
    };
    run();
    return () => { cancelled = true; };
  }, [user, accessChecked, studentId]);

  // 2) results
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!user || !accessChecked || !studentId) return;
      setLoadingResults(true);
      setErr(null);
  
      const resultsKey = `student:results:${studentId}`;
      type ResultsPayload = { subjects: string[]; results: ResultsByStudent };
      const cached = getCache<ResultsPayload>(resultsKey, 1);
  
      if (cached) {
        // Кэш хугацаа дуусаагүй → шууд ашиглана
        setResults(cached.results || {});
        const myMap = cached.results?.[studentId] || {};
        const fromMyMap = Object.entries(myMap)
          .filter(([, v]) => v?.average && v.average > 0)
          .map(([k]) => k);
        const uniq = Array.from(new Set([...(cached.subjects || []), ...fromMyMap])).sort();
        setSubjects(uniq);
        setSubject((prev) => prev || uniq[0] || "");
        setLoadingResults(false);
        return; // ✅ сервер рүү дахин fetch хийхгүй
      }
  
      // Хугацаа дууссан эсвэл кэш байхгүй → серверээс татна
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/student/results`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.error || "RESULTS_FETCH_ERROR");
        }
        const fresh = (await res.json()) as ResultsPayload;
        if (!cancelled) {
          setResults(fresh.results || {});
          const myMap = fresh.results?.[studentId] || {};
          const fromMyMap = Object.entries(myMap)
            .filter(([, v]) => v?.average && v.average > 0)
            .map(([k]) => k);
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
    };
    run();
    return () => { cancelled = true; };
  }, [user, accessChecked, studentId]);

  // Сонгосон хичээлийн detail
const subjectDetail = useMemo(() => {
  if (!studentId || !subject) return null;
  const my = results[studentId]?.[subject];
  if (!my) return null;

  const history = (my.history || [])
    .map((row) => normalizeHistory(row))
    // dateгүй байж болох тул зөвхөн sort хийхдээ хоосныг төгсгөлд тавина
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
    return <div className="min-h-screen flex items-center justify-center text-[var(--muted)]">Эрх шалгаж байна…</div>;
  }
  if (loadingStudent || loadingResults) {
    return <div className="min-h-screen flex items-center justify-center text-[var(--muted)]">Ачааллаж байна…</div>;
  }
  if (err || !student) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="p-6 rounded-xl max-w-lg w-full" style={{ background: "var(--card)", border: "1px solid var(--stroke)", color: "var(--text)" }}>
          <div className="font-bold mb-2">Алдаа</div>
          <div className="text-[var(--muted)]">Мэдээлэл олдсонгүй эсвэл алдаа гарлаа.</div>
          {err && <div className="mt-3 text-red-400 text-sm break-words">{String(err)}</div>}
        </div>
      </div>
    );
  }

  // ----------- Render -----------
  return (
    <div className="min-h-screen" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <div className="max-w-[1100px] mx-auto px-4 py-6">
        {/* Header */}
        <div className="rounded-2xl p-5 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4" style={{ background: "var(--card)", border: "1px solid var(--stroke)" }}>
          <div>
            <div className="text-xl font-extrabold">{student.name}</div>
            <div className="text-sm text-[var(--muted)]">Анги: {student.class || "-"}</div>
            {student.externalId ? <div className="text-sm text-[var(--muted)]">Код: {student.externalId}</div> : null}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-2 gap-3 min-w-[260px]">
            <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg)", border: "1px solid var(--stroke)" }}>
              <div className="text-xs font-semibold text-[var(--muted)]">Нийт дундаж</div>
              <div className="text-2xl font-extrabold text-[var(--primary-bg)]">{overallAvg || "--"}</div>
            </div>
          </div>
        </div>

        {/* Хичээл сонголт + дэлгэрэнгүй */}
        <div className="rounded-2xl p-5 mb-6" style={{ background: "var(--card)", border: "1px solid var(--stroke)" }}>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-[var(--muted)] font-semibold">Хичээл:</label>
            <select
              className="rounded-lg px-3 py-2"
              style={{ background: "var(--card2)", border: "1px solid var(--stroke)", color: "var(--text)" }}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {subject && subjectDetail ? (
            <>
              {/* Нэгдсэн дүнгийн картууд */}
              <div className="grid gap-3 mt-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))" }}>
                <div className="rounded-xl p-4 text-center" style={{ background: "var(--bg)", border: "1px solid var(--stroke)" }}>
                  <div className="text-[var(--muted)] text-sm font-semibold mb-1">Энэ хичээлийн дундаж</div>
                  <div className="text-3xl font-extrabold text-[var(--primary-bg)]">{subjectDetail.average ?? "--"}</div>
                </div>
              </div>

              {/* Сүүлийн шалгалтын Part1/Part2/Total */}
              {subjectDetail.history.length > 0 && (
                <div className="mb-4 grid gap-3 mt-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))" }}>
                  {(() => {
                    const last = subjectDetail.history[subjectDetail.history.length - 1];
                    return (
                      <>
                        <div className="rounded-xl p-4 text-center" style={{ background: "var(--bg)", border: "1px solid var(--stroke)" }}>
                          <div className="text-[var(--muted)] text-sm font-semibold mb-1">1-р хэсэг (сүүлийн шалгалт)</div>
                          <div className="text-2xl font-extrabold text-[var(--primary-bg)]">{fmt(last.part1)}</div>
                        </div>
                        <div className="rounded-xl p-4 text-center" style={{ background: "var(--bg)", border: "1px solid var(--stroke)" }}>
                          <div className="text-[var(--muted)] text-sm font-semibold mb-1">2-р хэсэг (сүүлийн шалгалт)</div>
                          <div className="text-2xl font-extrabold text-[var(--primary-bg)]">{fmt(last.part2)}</div>
                        </div>
                        <div className="rounded-xl p-4 text-center" style={{ background: "var(--bg)", border: "1px solid var(--stroke)" }}>
                          <div className="text-[var(--muted)] text-sm font-semibold mb-1">Нийт (сүүлийн шалгалт)</div>
                          <div className="text-2xl font-extrabold text-[var(--primary-bg)]">{fmt(last.total)}</div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* График: Нийт онооны ахиц */}
              <div className="mt-2">
                <ReactApexChart
                  key={`student-${themeMode}-${studentId}-${subject}`}
                  options={{
                    chart: { type: "area", background: "transparent", height: 400, toolbar: { show: false }, zoom: { enabled: false } },
                    theme: { mode: themeMode },
                    xaxis: { categories: perfCategories, labels: { rotate: -25 } },
                    yaxis: { min: 0, max: 100, tickAmount: 5 },
                    dataLabels: { enabled: true, formatter: (val: number) => Number(val).toFixed(1) },
                    stroke: { curve: "smooth", width: 3 },
                    grid: { borderColor: "var(--stroke)", strokeDashArray: 4 },
                    colors: ["var(--primary-bg)"],
                  }}
                  series={[{ name: "Нийт оноо", data: perfData }]}
                  type="area"
                  height={400}
                />
              </div>

              {/* Түүхэн мөрийн хүснэгт (давхардсан date key хамгаалсан) */}
              <div className="mt-6 overflow-auto">
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
  {(subjectDetail?.history || []).map((row, i) => (
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
            </>
          ) : (
            <div className="text-[var(--muted)] mt-4">Энэ сурагчийн {subject || "…"} хичээлд дүн алга.</div>
          )}
        </div>

        {/* Радар: бүх хичээл дундаж */}
        <div className="rounded-2xl p-5" style={{ background: "var(--card)", border: "1px solid var(--stroke)" }}>
          <h3 className="font-bold mb-3">Хичээлүүдийн дундаж (энэ сурагч)</h3>
          <ReactApexChart
            key={`radar-${themeMode}-${studentId}`}
            options={{
              chart: { type: "radar", background: "transparent", height: 500, toolbar: { show: false } },
              theme: { mode: themeMode },
              labels: subjects.filter((s) => results[studentId]?.[s]?.average > 0),
              yaxis: { min: 0, max: 100, tickAmount: 5 },
              stroke: { width: 3, curve: "smooth" },
              fill: { opacity: 0.3 },
              colors: ["var(--primary-bg)"],
              plotOptions: { radar: { polygons: { strokeColors: "var(--stroke)", connectorColors: "var(--stroke)" } } },
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
            height={500}
          />
        </div>
      </div>
    </div>
  );
}