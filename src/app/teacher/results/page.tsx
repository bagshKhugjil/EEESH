"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";

// ApexCharts (SSR off)
const ReactApexChart: any = dynamic(() => import("react-apexcharts"), { ssr: false });

/** ---------- Types ---------- */
type HistoryPoint = { date: string; score: number }; // YYYY-MM-DD
type SubjectResult = { average: number; rank?: number; history: HistoryPoint[] };
type ResultsByStudent = Record<string, Record<string, SubjectResult>>;

type StudentLite = { id: string; name: string; class: string };

type StudentProfile = {
  id: string;
  externalId?: number | string | null;
  class: string;
  firstName?: string;
  lastName?: string;
  name: string;
  email?: string | null;
  parentEmail1?: string | null;
  parentEmail2?: string | null;
  phone?: string | null;
};

/** ---------- Small helper: responsive chart height ---------- */
function useChartHeight() {
  const [h, setH] = useState(400);
  useEffect(() => {
    const calc = () => {
      const w = window.innerWidth;
      if (w < 420) setH(240);
      else if (w < 640) setH(280);
      else if (w < 768) setH(320);
      else setH(400);
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);
  return h;
}

export default function ResultsPage() {
  const { user } = useAuth();
  const chartHeight = useChartHeight();

  /** ---------- Theme ---------- */
  const [mounted, setMounted] = useState(false);
  const [lightMode, setLightMode] = useState(false);
  useEffect(() => {
    setMounted(true);
    const t = localStorage.getItem("theme");
    if (t === "light") {
      setLightMode(true);
      document.documentElement.classList.add("light");
    }
  }, []);
  const toggleTheme = () => {
    const next = !lightMode;
    setLightMode(next);
    if (next) {
      document.documentElement.classList.add("light");
      localStorage.setItem("theme", "light");
    } else {
      document.documentElement.classList.remove("light");
      localStorage.setItem("theme", "dark");
    }
  };
  const themeMode = lightMode ? "light" : "dark";

  /** ---------- Tabs ---------- */
  type Tab = "student" | "class" | "subject";
  const [tab, setTab] = useState<Tab>("student");

  /** ---------- State ---------- */
  const [classes, setClasses] = useState<string[]>([]);
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [rosterErr, setRosterErr] = useState<string | null>(null);

  const [subjects, setSubjects] = useState<string[]>([]);
  const [results, setResults] = useState<ResultsByStudent>({});
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsErr, setResultsErr] = useState<string | null>(null);

  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  // Filters
  const [svClass, setSvClass] = useState("");
  const [svStudent, setSvStudent] = useState("");
  const [svSubject, setSvSubject] = useState("");

  const [cvClass, setCvClass] = useState("");
  const [cvSubject, setCvSubject] = useState("");
  const [cvDate, setCvDate] = useState("");

  const [svSubjectOnly, setSvSubjectOnly] = useState<string>("");

  /** ---------- Fetch roster once ---------- */
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!user) return;
      setRosterLoading(true);
      setRosterErr(null);
      const CACHE_KEY = "roster_v1";
      const hydrate = (c: string[], s: StudentLite[]) => {
        if (cancelled) return;
        setClasses(c);
        setStudents(s);
        setRosterLoading(false);
      };
      try {
        const token = await user.getIdToken();
        // cache → server
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as { classes: string[]; students: StudentLite[] };
          hydrate(parsed.classes, parsed.students);
        }
        const res = await fetch("/api/meta/students", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error("Roster татаж чадсангүй.");
        const data = (await res.json()) as { classes: string[]; students: StudentLite[] };
        if (!cancelled) {
          setClasses(data.classes || []);
          setStudents(data.students || []);
          setRosterLoading(false);
          try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
        }
      } catch (e) {
        setRosterErr(e instanceof Error ? e.message : "Тодорхойгүй алдаа.");
        setRosterLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [user]);

  /** ---------- Build query for results ---------- */
  const buildResultsQuery = () => {
    const sp = new URLSearchParams();
    if (tab === "student") {
      if (svClass) sp.set("class", svClass);
      if (svStudent) sp.set("studentId", svStudent);
      if (svSubject) sp.set("subject", svSubject);
    } else if (tab === "class") {
      if (cvClass) sp.set("class", cvClass);
      if (cvSubject) sp.set("subject", cvSubject);
      if (cvDate) sp.set("date", cvDate);
    } else if (tab === "subject") {
      if (svSubjectOnly) sp.set("subject", svSubjectOnly);
    }
    const qs = sp.toString();
    return qs ? `?${qs}` : "";
  };

  /** ---------- Fetch results whenever filters change ---------- */
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!user) return;
      if (tab === "student" && !svStudent) { setResults({}); setSubjects([]); return; }
      setResultsLoading(true);
      setResultsErr(null);
      try {
        const token = await user.getIdToken();
        const qs = buildResultsQuery();
        const res = await fetch(`/api/teacher/results/dashboard${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Дүн татахад алдаа гарлаа.");
        const data = (await res.json()) as { subjects: string[]; results: ResultsByStudent };
        if (!cancelled) {
          setSubjects(data.subjects || []);
          setResults(data.results || {});
          setResultsLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setResultsErr(e instanceof Error ? e.message : "Тодорхойгүй алдаа.");
          setResultsLoading(false);
        }
      }
    };
    run();
    return () => { cancelled = true; };
  }, [user, tab, svClass, svStudent, svSubject, cvClass, cvSubject, cvDate, svSubjectOnly]);

  /** ---------- Fetch student profile when student changes ---------- */
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setStudentProfile(null);
      setProfileErr(null);
      if (!user || !svStudent) return;
      try {
        setProfileLoading(true);
        const token = await user.getIdToken();
        const res = await fetch(`/api/teacher/students/${svStudent}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Сурагчийн мэдээлэл татахад алдаа гарлаа.");
        const data = (await res.json()) as StudentProfile;
        if (!cancelled) setStudentProfile(data);
      } catch (e) {
        if (!cancelled) setProfileErr(e instanceof Error ? e.message : "Тодорхойгүй алдаа.");
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [user, svStudent]);

  /** ---------- Derived UI data ---------- */
  const classOptions = useMemo(
    () => classes.map((c) => ({ value: c, label: c })),
    [classes]
  );

  const studentsOfClass = useMemo(
    () => students.filter((s) => (svClass ? s.class === svClass : true)),
    [students, svClass]
  );
  const studentOptions = useMemo(
    () => studentsOfClass.map((s) => ({ value: s.id, label: s.name })),
    [studentsOfClass]
  );

  const subjectsAvailableForStudent: string[] = useMemo(() => {
    if (!svStudent) return [];
    const map = results[svStudent] || {};
    return Object.entries(map)
      .filter(([, v]) => v && v.average > 0)
      .map(([k]) => k);
  }, [results, svStudent]);

  const subjectOptions = useMemo(
    () => subjectsAvailableForStudent.map((s) => ({ value: s, label: s })),
    [subjectsAvailableForStudent]
  );

  const studentOverall = useMemo(() => {
    if (!svStudent) return null;
    const st = students.find((s) => s.id === svStudent);
    if (!st) return null;
    const subjRes = results[svStudent] || {};
    const avgs = Object.values(subjRes).map((r) => r.average).filter((n) => Number.isFinite(n));
    const avg = avgs.length ? Number((avgs.reduce((a, b) => a + b, 0) / avgs.length).toFixed(1)) : 0;
    return { name: st.name, average: avg, rank: "--" };
  }, [results, students, svStudent]);

  const studentSubjectDetail = useMemo(() => {
    if (!svStudent || !svSubject) return null;
    const st = students.find((s) => s.id === svStudent);
    if (!st) return null;
    const my = results[svStudent]?.[svSubject];
    if (!my) return null;

    const classmates = students.filter((s) => s.class === st.class);
    const scores = classmates
      .map((cm) => results[cm.id]?.[svSubject]?.average)
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
    const classAvg = scores.length
      ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1))
      : undefined;

    return { myScore: my.average, classAvg, rank: my.rank ? `#${my.rank}` : "--", history: my.history || [] };
  }, [results, students, svStudent, svSubject]);

  const perfCategories = useMemo(
    () => (studentSubjectDetail?.history || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1)).map((h) => h.date),
    [studentSubjectDetail]
  );
  const perfData = useMemo(
    () => (studentSubjectDetail?.history || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1)).map((h) => h.score),
    [studentSubjectDetail]
  );

  // Class tab derived
  const cvSubjectOptions = useMemo(() => (subjects || []).map((s) => ({ value: s, label: s })), [subjects]);

  const cvDates: string[] = useMemo(() => {
    if (!cvClass || !cvSubject) return [];
    const classSt = students.filter((s) => s.class === cvClass);
    const dateSet = new Set<string>();
    classSt.forEach((s) => {
      const hist = results[s.id]?.[cvSubject]?.history || [];
      hist.forEach((h) => h.date && dateSet.add(h.date));
    });
    return Array.from(dateSet).sort((a, b) => (a < b ? 1 : -1));
  }, [students, results, cvClass, cvSubject]);

  const cvDateOptions = useMemo(() => cvDates.map((d) => ({ value: d, label: d })), [cvDates]);

  const cvSummary = useMemo(() => {
    if (!cvClass || !cvSubject || !cvDate) return null;
    const classSt = students.filter((s) => s.class === cvClass);
    const scores: { name: string; score: number }[] = [];
    classSt.forEach((s) => {
      const hist = results[s.id]?.[cvSubject]?.history || [];
      const sameDay = hist.filter((h) => h.date === cvDate);
      if (sameDay.length) {
        const avg = sameDay.reduce((a, b) => a + b.score, 0) / sameDay.length;
        scores.push({ name: s.name, score: Number(avg.toFixed(1)) });
      }
    });
    if (!scores.length) return null;
    const avg = Number((scores.reduce((a, b) => a + b.score, 0) / scores.length).toFixed(1));
    const top = Math.max(...scores.map((s) => s.score));
    const low = Math.min(...scores.map((s) => s.score));
    const sorted = [...scores].sort((a, b) => b.score - a.score);
    return { avg, top, low, count: scores.length, sorted };
  }, [results, students, cvClass, cvSubject, cvDate]);

  // Subject tab derived
  const subjectAllOptions = useMemo(() => (subjects || []).map((s) => ({ value: s, label: s })), [subjects]);

  const subjectLeaderboard = useMemo(() => {
    if (!svSubjectOnly) return null;
    const rows: { name: string; class: string; score: number }[] = [];
    students.forEach((s) => {
      const res = results[s.id]?.[svSubjectOnly];
      if (res?.average && res.average > 0) {
        rows.push({ name: s.name, class: s.class, score: res.average });
      }
    });
    if (!rows.length) return null;
    const sorted = rows.sort((a, b) => b.score - a.score);
    const avg = Number((sorted.reduce((x, y) => x + y.score, 0) / sorted.length).toFixed(1));
    const top = sorted[0];
    return { avg, topScore: top.score, topStudent: top.name, rows: sorted };
  }, [results, students, svSubjectOnly]);

  /** ---------- Small Select helper ---------- */
  function Select({
    id,
    placeholder,
    value,
    onChange,
    options,
    disabled,
  }: {
    id?: string;
    placeholder: string;
    value: string;
    onChange: (v: string) => void;
    options: Array<{ value: string; label: string }>;
    disabled?: boolean;
  }) {
    return (
      <select
        id={id}
        className="rounded-lg px-3 py-2 w-full sm:w-auto"
        style={{ background: "var(--card2)", border: "1px solid var(--stroke)", color: "var(--text)" }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">{`-- ${placeholder} --`}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }

  /** ---------- UI ---------- */
  return (
    <div className="min-h-screen" style={{ background: "var(--bg)", color: "var(--text)" }}>
      {/* Header + Theme toggle */}
      <div className="fixed top-4 right-4 z-[999]">
        <button
          onClick={toggleTheme}
          className="w-11 h-11 rounded-full border"
          style={{ background: "var(--card)", borderColor: "var(--stroke)", color: "var(--muted)" }}
          title="Өнгө солих"
          aria-label="Өнгө солих"
        >
          {!mounted ? null : lightMode ? "☀️" : "🌙"}
        </button>
      </div>

      {/* Top nav */}
      <div className="header pt-4 px-4 sm:px-0 text-center">
        <div className="inline-flex flex-wrap gap-2 p-2 rounded-xl"
          style={{ background: "var(--card)", border: "1px solid var(--stroke)" }}>
          <Link href="/teacher" className="px-3 sm:px-4 py-2 rounded-md font-bold" style={{ color: "var(--muted)" }}>Нүүр</Link>
          <Link href="/teacher/upload" className="px-3 sm:px-4 py-2 rounded-md font-bold" style={{ color: "var(--muted)" }}>Дүн оруулах</Link>
          <Link href="/teacher/results" className="px-3 sm:px-4 py-2 rounded-md font-bold" style={{ background: "var(--card2)", color: "var(--text)" }}>
            Дүн харах
          </Link>
          <Link href="/teacher/files" className="px-3 sm:px-4 py-2 rounded-md font-bold" style={{ color: "var(--muted)" }}>Файл удирдах</Link>
        </div>
      </div>

      <div className="container max-w-[1200px] mx-auto px-4 sm:px-6">
        <h1 className="text-center text-xl sm:text-2xl font-extrabold mb-6">ЭЕШ-ийн Дүнгийн Нэгтгэл</h1>

        {/* Tabs */}
        <div className="tabs flex gap-1 sm:gap-2 border-b border-[var(--stroke)] mb-4 sm:mb-6 flex-wrap px-1">
          {(["student","class","subject"] as const).map((key) => (
            <button
              key={key}
              className={`tab-link ${tab === key ? "active" : ""} rounded-md`}
              style={{
                padding: "10px 14px",
                color: tab === key ? "var(--primary-bg)" : "var(--muted)",
                borderBottom: `3px solid ${tab === key ? "var(--primary-bg)" : "transparent"}`,
              }}
              onClick={() => setTab(key)}
            >
              {key === "student" ? "Сурагчаар харах" : key === "class" ? "Ангиар харах" : "Хичээлээр харах"}
            </button>
          ))}
        </div>

        {/* Banners */}
        {rosterLoading && <div className="text-center text-[var(--muted)] py-3">Сурагчдын жагсаалт ачааллаж байна…</div>}
        {rosterErr && <div className="text-center text-red-400 py-3 px-2">{rosterErr}</div>}
        {resultsLoading && <div className="text-center text-[var(--muted)] py-2">Дүн шүүж байна…</div>}
        {resultsErr && <div className="text-center text-red-400 py-2 px-2">{resultsErr}</div>}

        {/* Content */}
        {!rosterLoading && !rosterErr && (
          <>
            {/* Student View */}
            {tab === "student" && (
              <div className="card rounded-2xl p-4 sm:p-6" style={{ background: "var(--card)", border: "1px solid var(--stroke)" }}>
                <h2 className="font-bold text-lg mb-3 sm:mb-4">Сурагчийн дүн хайх</h2>

                {/* Filters - responsive stack */}
                <div className="grid gap-3 sm:gap-4 mb-4"
                     style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                  <div className="flex flex-col gap-1">
                    <label className="text-[var(--muted)] text-sm font-semibold">1. Анги</label>
                    <Select placeholder="Ангиа сонго" value={svClass}
                            onChange={(v) => { setSvClass(v); setSvStudent(""); setSvSubject(""); }}
                            options={classOptions}/>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[var(--muted)] text-sm font-semibold">2. Сурагч</label>
                    <Select placeholder="Сурагчаа сонго" value={svStudent}
                            onChange={(v) => { setSvStudent(v); setSvSubject(""); }}
                            options={studentOptions} disabled={!svClass}/>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[var(--muted)] text-sm font-semibold">3. Хичээл</label>
                    <Select placeholder="Хичээлээ сонго" value={svSubject} onChange={setSvSubject}
                            options={(results[svStudent] ? Object.keys(results[svStudent]) : [])
                              .filter((k) => results[svStudent]?.[k]?.average > 0)
                              .map((s) => ({ value: s, label: s }))}
                            disabled={!svStudent}/>
                  </div>
                </div>

                {/* Сурагчийн мэдээлэл */}
                {svStudent && (
                  <div className="rounded-2xl p-4 mb-4" style={{ background: "var(--card)", border: "1px solid var(--stroke)" }}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-bold">Сурагчийн мэдээлэл</h3>
                      {profileLoading && <span className="text-sm text-[var(--muted)]">Ачааллаж байна…</span>}
                    </div>
                    {profileErr && <div className="text-red-400 text-sm mb-2">{profileErr}</div>}
                    {studentProfile && (
                      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))" }}>
                        <div><span className="text-[var(--muted)] text-sm">Овог нэр:</span><br/><b>{studentProfile.name}</b></div>
                        <div><span className="text-[var(--muted)] text-sm">Анги:</span><br/><b>{studentProfile.class}</b></div>
                        {studentProfile.externalId && (
                          <div><span className="text-[var(--muted)] text-sm">Гадаад ID:</span><br/><b>{String(studentProfile.externalId)}</b></div>
                        )}
                        {studentProfile.email && (
                          <div><span className="text-[var(--muted)] text-sm">Имэйл:</span><br/><b>{studentProfile.email}</b></div>
                        )}
                        {studentProfile.parentEmail1 && (
                          <div><span className="text-[var(--muted)] text-sm">Эцэг эх 1:</span><br/><b>{studentProfile.parentEmail1}</b></div>
                        )}
                        {studentProfile.parentEmail2 && (
                          <div><span className="text-[var(--muted)] text-sm">Эцэг эх 2:</span><br/><b>{studentProfile.parentEmail2}</b></div>
                        )}
                        {studentProfile.phone && (
                          <div><span className="text-[var(--muted)] text-sm">Утас:</span><br/><b>{studentProfile.phone}</b></div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Нийт дүнгийн нэгтгэл */}
                {svStudent && studentOverall && (
                  <div id="student-overall-summary">
                    <hr className="my-4 border-[var(--stroke)]" />
                    <h3 className="font-bold mb-3">{studentOverall.name}-ийн дүнгийн нэгтгэл</h3>
                    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))" }}>
                      <div className="rounded-xl p-4 text-center" style={{ background: "var(--bg)", border: "1px solid var(--stroke)" }}>
                        <div className="text-[var(--muted)] text-xs sm:text-sm font-semibold mb-1">Нийт дундаж оноо</div>
                        <div className="text-2xl sm:text-3xl font-extrabold text-[var(--primary-bg)]">{studentOverall.average || "--"}</div>
                      </div>
                      <div className="rounded-xl p-4 text-center" style={{ background: "var(--bg)", border: "1px solid var(--stroke)" }}>
                        <div className="text-[var(--muted)] text-xs sm:text-sm font-semibold mb-1">Нийт байр</div>
                        <div className="text-2xl sm:text-3xl font-extrabold text-[var(--primary-bg)]">{studentOverall.rank}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Нэг хичээлийн дэлгэрэнгүй */}
                {svStudent && svSubject && studentSubjectDetail && (
                  <>
                    <div className="mt-6">
                      <h3 className="font-bold mb-3">{svSubject} хичээлийн дүн</h3>
                      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))" }}>
                        <div className="rounded-xl p-4 text-center" style={{ background: "var(--bg)", border: "1px solid var(--stroke)" }}>
                          <div className="text-[var(--muted)] text-xs sm:text-sm font-semibold mb-1">Миний оноо</div>
                          <div className="text-2xl sm:text-3xl font-extrabold text-[var(--primary-bg)]">{studentSubjectDetail.myScore ?? "--"}</div>
                        </div>
                        <div className="rounded-xl p-4 text-center" style={{ background: "var(--bg)", border: "1px solid var(--stroke)" }}>
                          <div className="text-[var(--muted)] text-xs sm:text-sm font-semibold mb-1">Ангийн дундаж</div>
                          <div className="text-2xl sm:text-3xl font-extrabолd text-[var(--primary-bg)]">{studentSubjectDetail.classAvg ?? "--"}</div>
                        </div>
                        <div className="rounded-xl p-4 text-center" style={{ background: "var(--bg)", border: "1px solid var(--stroke)" }}>
                          <div className="text-[var(--muted)] text-xs sm:text-sm font-semibold mb-1">Ангид эзлэх байр</div>
                          <div className="text-2xl sm:text-3xl font-extrabold text-[var(--primary-bg)]">{studentSubjectDetail.rank}</div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6">
                      <h3 className="font-bold mb-3">{svSubject} хичээлийн дүнгийн ахиц</h3>
                      <div className="rounded-xl p-2 sm:p-3" style={{ background: "var(--card)", border: "1px solid var(--stroke)" }}>
                        <ReactApexChart
                          key={`perf-${themeMode}-${svStudent}-${svSubject}`}
                          options={{
                            chart: { type: "area", background: "transparent", height: chartHeight, toolbar: { show: false }, zoom: { enabled: false } },
                            theme: { mode: themeMode },
                            xaxis: { categories: perfCategories, labels: { rotate: -25 } },
                            yaxis: { min: 0, max: 100, tickAmount: 5 },
                            dataLabels: { enabled: true, formatter: (val: number) => Number(val).toFixed(1) },
                            stroke: { curve: "smooth", width: 3 },
                            grid: { borderColor: "var(--stroke)", strokeDashArray: 4 },
                            colors: ["var(--primary-bg)"],
                          }}
                          series={[{ name: "Оноо", data: perfData }]}
                          type="area"
                          height={chartHeight}
                        />
                      </div>
                    </div>
                  </>
                )}

                {!svStudent && <div className="text-center text-[var(--muted)] py-6 sm:py-8">Дээрээс ангиа, дараа нь сурагчаа сонгоно уу.</div>}
              </div>
            )}

            {/* Class View */}
            {tab === "class" && (
              <div className="card rounded-2xl p-4 sm:p-6" style={{ background: "var(--card)", border: "1px solid var(--stroke)" }}>
                <h2 className="font-bold text-lg mb-3 sm:mb-4">Ангийн дүнгийн нэгтгэл</h2>

                <div className="grid gap-3 sm:gap-4 mb-4"
                     style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                  <div className="flex flex-col gap-1">
                    <label className="text-[var(--muted)] text-sm font-semibold">1. Анги</label>
                    <Select placeholder="Ангиа сонго" value={cvClass}
                            onChange={(v) => { setCvClass(v); setCvSubject(""); setCvDate(""); }}
                            options={classOptions}/>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[var(--muted)] text-sm font-semibold">2. Хичээл</label>
                    <Select placeholder="Хичээлээ сонго" value={cvSubject}
                            onChange={(v) => { setCvSubject(v); setCvDate(""); }}
                            options={cvSubjectOptions} disabled={!cvClass}/>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[var(--muted)] text-sm font-semibold">3. Шалгалт (огноо)</label>
                    <Select placeholder="Огноо сонго" value={cvDate}
                            onChange={setCvDate}
                            options={cvDateOptions}
                            disabled={!cvClass || !cvSubject || cvDateOptions.length === 0}/>
                  </div>
                </div>

                {cvSummary ? (
                  <>
                    <hr className="my-4 border-[var(--stroke)]" />
                    <h3 className="font-bold mb-3">
                      “{cvClass}” ангийн “{cvSubject}” {cvDate}-ны шалгалтын дүн
                    </h3>

                    <div className="grid gap-3"
                         style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))" }}>
                      <div className="rounded-xl p-4 text-center" style={{ background: "var(--bg)", border: "1px solid var(--stroke)" }}>
                        <div className="text-[var(--muted)] text-xs sm:text-sm font-semibold mb-1">Ангийн дундаж</div>
                        <div className="text-2xl sm:text-3xl font-extrabold text-[var(--primary-bg)]">{cvSummary.avg}</div>
                      </div>
                      <div className="rounded-xl p-4 text-center" style={{ background: "var(--bg)", border: "1px solid var(--stroke)" }}>
                        <div className="text-[var(--muted)] text-xs sm:text-sm font-semibold mb-1">Хамгийн өндөр</div>
                        <div className="text-2xl sm:text-3xl font-extrabold text-[var(--primary-bg)]">{cvSummary.top}</div>
                      </div>
                      <div className="rounded-xl p-4 text-center" style={{ background: "var(--bg)", border: "1px solid var(--stroke)" }}>
                        <div className="text-[var(--muted)] text-xs sm:text-sm font-semibold mb-1">Хамгийн бага</div>
                        <div className="text-2xl sm:text-3xl font-extrabold text-[var(--primary-bg)]">{cvSummary.low}</div>
                      </div>
                      <div className="rounded-xl p-4 text-center" style={{ background: "var(--bg)", border: "1px solid var(--stroke)" }}>
                        <div className="text-[var(--muted)] text-xs sm:text-sm font-semibold mb-1">Хамрагдсан</div>
                        <div className="text-2xl sm:text-3xl font-extrabold text-[var(--primary-bg)]">{cvSummary.count} сурагч</div>
                      </div>
                    </div>

                    <div className="mt-6 rounded-xl p-2 sm:p-3"
                         style={{ background: "var(--card)", border: "1px solid var(--stroke)" }}>
                      <h3 className="font-bold mb-3">Сурагчдын онооны харьцуулалт</h3>
                      <ReactApexChart
                        key={`class-${themeMode}-${cvClass}-${cvSubject}-${cvDate}`}
                        options={{
                          chart: { type: "bar", background: "transparent", height: chartHeight, toolbar: { show: false } },
                          theme: { mode: themeMode },
                          xaxis: { categories: cvSummary.sorted.map((r) => r.name), labels: { rotate: -25 } },
                          yaxis: { min: 0, max: 100 },
                          plotOptions: { bar: { borderRadius: 4, distributed: true } },
                          dataLabels: { enabled: true, formatter: (val: number) => Number(val).toFixed(1) },
                          grid: { borderColor: "var(--stroke)", strokeDashArray: 2 },
                          colors: ["#38bdf8", "#818cf8", "#a78bfa", "#f472b6", "#fb923c", "#a3e635", "#4ade80"],
                        }}
                        series={[{ name: "Оноо", data: cvSummary.sorted.map((r) => r.score) }]}
                        type="bar"
                        height={chartHeight}
                      />
                    </div>

                    <div className="mt-6 overflow-x-auto">
                      <h3 className="font-bold mb-3">Дүнгийн жагсаалт</h3>
                      <table className="w-full min-w-[520px] border-collapse">
                        <thead>
                          <tr className="text-[var(--muted)] text-xs uppercase">
                            <th className="text-left p-2">Байр</th>
                            <th className="text-left p-2">Сурагч</th>
                            <th className="text-left p-2">Оноо</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cvSummary.sorted.map((r, i) => (
                            <tr key={r.name} className="border-b border-[var(--stroke)]">
                              <td className="p-2">#{i + 1}</td>
                              <td className="p-2">{r.name}</td>
                              <td className="p-2"><b>{r.score}</b></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="text-center text-[var(--muted)] py-6 sm:py-8">Анги, хичээл, огноо сонгоно уу.</div>
                )}
              </div>
            )}

            {/* Subject View */}
            {tab === "subject" && (
              <div className="card rounded-2xl p-4 sm:p-6" style={{ background: "var(--card)", border: "1px solid var(--stroke)" }}>
                <h2 className="font-bold text-lg mb-3 sm:mb-4">Хичээлийн дүнгийн нэгтгэл</h2>

                <div className="grid gap-3 sm:gap-4 mb-4"
                     style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                  <div className="flex flex-col gap-1">
                    <label className="text-[var(--muted)] text-sm font-semibold">Хичээл</label>
                    <Select placeholder="Хичээлээ сонго" value={svSubjectOnly}
                            onChange={setSvSubjectOnly}
                            options={subjectAllOptions}/>
                  </div>
                </div>

                {subjectLeaderboard ? (
                  <>
                    <hr className="my-4 border-[var(--stroke)]" />
                    <h3 className="font-bold mb-3">“{svSubjectOnly}” хичээлийн нэгтгэл</h3>

                    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))" }}>
                      <div className="rounded-xl p-4 text-center" style={{ background: "var(--bg)", border: "1px solid var(--stroke)" }}>
                        <div className="text-[var(--muted)] text-xs sm:text-sm font-semibold mb-1">Нийт дундаж</div>
                        <div className="text-2xl sm:text-3xl font-extrabold text-[var(--primary-bg)]">{subjectLeaderboard.avg}</div>
                      </div>
                      <div className="rounded-xl p-4 text-center" style={{ background: "var(--bg)", border: "1px solid var(--stroke)" }}>
                        <div className="text-[var(--muted)] text-xs sm:text-sm font-semibold mb-1">Хамгийн өндөр</div>
                        <div className="text-2xl sm:text-3xl font-extrabold text-[var(--primary-bg)]">{subjectLeaderboard.topScore}</div>
                      </div>
                      <div className="rounded-xl p-4 text-center" style={{ background: "var(--bg)", border: "1px solid var(--stroke)" }}>
                        <div className="text-[var(--muted)] text-xs sm:text-sm font-semibold mb-1">Шилдэг сурагч</div>
                        <div className="text-xl sm:text-2xl font-extrabold text-[var(--primary-bg)]">{subjectLeaderboard.topStudent}</div>
                      </div>
                    </div>

                    <div className="mt-6 overflow-x-auto">
                      <h3 className="font-bold mb-3">Сурагчдын жагсаалт</h3>
                      <table className="w-full min-w-[580px] border-collapse">
                        <thead>
                          <tr className="text-[var(--muted)] text-xs uppercase">
                            <th className="text-left p-2">Байр</th>
                            <th className="text-left p-2">Сурагч</th>
                            <th className="text-left p-2">Анги</th>
                            <th className="text-left p-2">Оноо</th>
                          </tr>
                        </thead>
                        <tbody>
                          {subjectLeaderboard.rows.map((r, i) => (
                            <tr key={`${r.name}-${i}`} className="border-b border-[var(--stroke)]">
                              <td className="p-2">#{i + 1}</td>
                              <td className="p-2">{r.name}</td>
                              <td className="p-2">{r.class}</td>
                              <td className="p-2"><b>{r.score}</b></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="text-center text-[var(--muted)] py-6 sm:py-8">Хичээлээ сонгоно уу.</div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}