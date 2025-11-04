// src/app/teacher/manual/page.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { getCache, setCache } from "@/lib/cache";

const SUBJECTS = [
  "ХИМИ","ФИЗИК","ТҮҮХ","ОРОС ХЭЛ","НИЙГЭМ","МОНГОЛ ХЭЛ","МАТЕМАТИК","ГАЗАРЗҮЙ","БИОЛОГИ","АНГЛИ ХЭЛ",
] as const;

type StudentLite = {
  id: string;
  externalId: string;
  firstName: string;
  lastName: string;
  name: string;
  class: string;
};

type StudentsResponse = {
  ok: true;
  classes: string[];
  students: StudentLite[];
};

const STUDENTS_CACHE_KEY = "teacher_students_v1";

export default function TeacherManualPage() {
  const { user } = useAuth();

  // theme
  const [mounted, setMounted] = useState(false);
  const [lightMode, setLightMode] = useState(false);
  useEffect(() => {
    setMounted(true);
    const prefersLight = localStorage.getItem("theme") === "light";
    const html = document.documentElement;
    if (prefersLight) {
      html.classList.add("light");
      setLightMode(true);
    } else {
      html.classList.remove("light");
      setLightMode(false);
    }
  }, []);
  const toggleTheme = () => {
    const next = !lightMode;
    setLightMode(next);
    const html = document.documentElement;
    if (next) {
      html.classList.add("light");
      localStorage.setItem("theme", "light");
    } else {
      html.classList.remove("light");
      localStorage.setItem("theme", "dark");
    }
  };

  const [subject, setSubject] = useState<string>("");
  const [className, setClassName] = useState<string>("");
  const [dateYMD, setDateYMD] = useState(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });

  // ШИНЭ: шалгалт 1 эсвэл 2 хэсэгтэй
  const [examParts, setExamParts] = useState<1 | 2>(1);
  const [defaultQuestions1, setDefaultQuestions1] = useState<number | "">("");
  const [defaultQuestions2, setDefaultQuestions2] = useState<number | "">("");
  const [quizTitle, setQuizTitle] = useState("");

  const [allClasses, setAllClasses] = useState<string[]>([]);
  const [allStudents, setAllStudents] = useState<StudentLite[]>([]);
  const [loadingStudents, setLoadingStudents] = useState<boolean>(true);
  const [studentsError, setStudentsError] = useState<string | null>(null);

  // сурагч бүрийн 1-р, 2-р хэсгийн дүн
  type EditableScore = {
    // 1-р хэсэг
    numQuestions1: number | "";
    numCorrect1: number | "";
    // 2-р хэсэг
    numQuestions2: number | "";
    numCorrect2: number | "";
  };
  const [scoreByExt, setScoreByExt] = useState<Record<string, EditableScore>>({});

  // ачаалахад сурагчдыг татах
  useEffect(() => {
    const fetchStudents = async () => {
      if (!user) return;
      setLoadingStudents(true);
      setStudentsError(null);

      const cached = getCache<StudentsResponse>(STUDENTS_CACHE_KEY, 1);
      if (cached?.ok) {
        setAllClasses(cached.classes || []);
        setAllStudents(cached.students || []);
        setLoadingStudents(false);
      }

      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/teacher/students", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || "Сурагчдын мэдээлэл татаж чадсангүй.");
        setAllClasses(data.classes || []);
        setAllStudents(data.students || []);
        setCache(STUDENTS_CACHE_KEY, data, 10 * 60 * 1000, 1);
      } catch (e: any) {
        if (!cached) setStudentsError(e?.message ?? "Сурагчдыг татахад алдаа гарлаа.");
      } finally {
        setLoadingStudents(false);
      }
    };
    fetchStudents();
  }, [user]);

  // анги дээрх сурагчдыг нэр → овгоор сортлоно
  const studentsOfClass = useMemo(() => {
    if (!className) return [];
    return allStudents
      .filter((s) => s.class === className)
      .sort((a, b) => {
        const fnA = (a.firstName ?? "").toLowerCase();
        const fnB = (b.firstName ?? "").toLowerCase();
        const nameDiff = fnA.localeCompare(fnB, "mn");
        if (nameDiff !== 0) return nameDiff;
        const lnA = (a.lastName ?? "").toLowerCase();
        const lnB = (b.lastName ?? "").toLowerCase();
        return lnA.localeCompare(lnB, "mn");
      });
  }, [className, allStudents]);

  // анги солигдоход тухайн сурагчдын хоосон дүн бэлдэнэ
  useEffect(() => {
    if (!className) return;
    setScoreByExt((prev) => {
      const next = { ...prev };
      studentsOfClass.forEach((s) => {
        if (!next[s.externalId]) {
          next[s.externalId] = {
            numQuestions1: "",
            numCorrect1: "",
            numQuestions2: "",
            numCorrect2: "",
          };
        }
      });
      return next;
    });
  }, [className, studentsOfClass]);

  const updateScore = (
    extId: string,
    field: keyof EditableScore,
    value: string
  ) => {
    setScoreByExt((prev) => ({
      ...prev,
      [extId]: {
        ...prev[extId],
        [field]: value === "" ? "" : Number(value),
      },
    }));
  };

  // modal
  const [status, setStatus] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");
  const [modalType, setModalType] = useState<"success" | "error" | "warning" | "info">("info");
  const openModal = (title: string, message: string, type: typeof modalType = "info") => {
    setModalTitle(title);
    setModalMessage(message);
    setModalType(type);
    setModalOpen(true);
  };
  const closeModal = () => setModalOpen(false);

  const submit = async () => {
    if (!subject) return openModal("Анхааруулга", "Хичээлээ сонгоно уу!", "warning");
    if (!className) return openModal("Анхааруулга", "Ангиа сонгоно уу!", "warning");
    if (!dateYMD) return openModal("Анхааруулга", "Огноогоо оруулна уу!", "warning");
    if (!user) return openModal("Анхааруулга", "Нэвтэрсэн байх шаардлагатай.", "warning");
    // ШАЛГАЛТЫН НЭРИЙГ ЗААВАЛ БОЛГОСОН
    if (!quizTitle.trim()) {
      return openModal("Анхааруулга", "Шалгалтын нэрээ оруулна уу!", "warning");
    }
  
    // хэрвээ 1 хэсэгтэй бол, глобал асуулт хоосон ба нэг ч сурагч дээр асуулт бөглөөгүй бол анхааруул
    if (examParts === 1) {
      const hasGlobalQ = defaultQuestions1 !== "";
      const hasAnyPerStudentQ = studentsOfClass.some((s) => {
        const sc = scoreByExt[s.externalId];
        return sc && sc.numQuestions1 !== "";
      });
      if (!hasGlobalQ && !hasAnyPerStudentQ) {
        return openModal("Анхааруулга", "1-р хэсгийн нийт оноог (асуулт) дор хаяж нэг газар бөглөнө үү.", "warning");
      }
    } else {
      // 2 хэсэгтэй үед хоёулангийнх нь оноо бүхэлдээ хоосон байвал анхааруулъя
      const hasGlobalQ1 = defaultQuestions1 !== "";
      const hasGlobalQ2 = defaultQuestions2 !== "";
      const hasAnyPerStudentQ1 = studentsOfClass.some((s) => {
        const sc = scoreByExt[s.externalId];
        return sc && sc.numQuestions1 !== "";
      });
      const hasAnyPerStudentQ2 = studentsOfClass.some((s) => {
        const sc = scoreByExt[s.externalId];
        return sc && sc.numQuestions2 !== "";
      });
      if (!hasGlobalQ1 && !hasAnyPerStudentQ1 && !hasGlobalQ2 && !hasAnyPerStudentQ2) {
        return openModal("Анхааруулга", "1 болон 2-р хэсгийн нийт онооноос ядаж нэгийг нь бөглөнө үү.", "warning");
      }
    }
  
    // --- цаашаа таны одоогийн rows үүсгээд явуулдаг хэсэг яг хэвээр ---
    const rows = studentsOfClass
      .map((s) => {
        const score = scoreByExt[s.externalId];
        if (!score) return null;
  
        if (examParts === 1) {
          const hasCorrect = score.numCorrect1 !== "";
          if (!hasCorrect) return null;
  
          const numQuestions =
            defaultQuestions1 !== ""
              ? Number(defaultQuestions1)
              : score.numQuestions1 === ""
              ? null
              : Number(score.numQuestions1);
  
          const numCorrect = Number(score.numCorrect1);
          const percent =
            numQuestions !== null && numQuestions > 0
              ? Number(((numCorrect / numQuestions) * 100).toFixed(2))
              : null;
  
          return {
            externalId: s.externalId,
            className,
            firstName: s.firstName,
            lastName: s.lastName,
            part1: {
              numQuestions,
              numCorrect,
              percentCorrect: percent,
            },
          };
        } else {
          const hasCorrect1 = score.numCorrect1 !== "";
          const hasCorrect2 = score.numCorrect2 !== "";
          if (!hasCorrect1 && !hasCorrect2) return null;
  
          let part1: any = undefined;
          if (hasCorrect1) {
            const numQ1 =
              defaultQuestions1 !== ""
                ? Number(defaultQuestions1)
                : score.numQuestions1 === ""
                ? null
                : Number(score.numQuestions1);
            const numC1 = Number(score.numCorrect1);
            const percent1 =
              numQ1 !== null && numQ1 > 0
                ? Number(((numC1 / numQ1) * 100).toFixed(2))
                : null;
            part1 = {
              numQuestions: numQ1,
              numCorrect: numC1,
              percentCorrect: percent1,
            };
          }
  
          let part2: any = undefined;
          if (hasCorrect2) {
            const numQ2 =
              defaultQuestions2 !== ""
                ? Number(defaultQuestions2)
                : score.numQuestions2 === ""
                ? null
                : Number(score.numQuestions2);
            const numC2 = Number(score.numCorrect2);
            const percent2 =
              numQ2 !== null && numQ2 > 0
                ? Number(((numC2 / numQ2) * 100).toFixed(2))
                : null;
            part2 = {
              numQuestions: numQ2,
              numCorrect: numC2,
              percentCorrect: percent2,
            };
          }
  
          return {
            externalId: s.externalId,
            className,
            firstName: s.firstName,
            lastName: s.lastName,
            ...(part1 ? { part1 } : {}),
            ...(part2 ? { part2 } : {}),
          };
        }
      })
      .filter(Boolean) as any[];
  
    if (rows.length === 0) {
      return openModal("Анхааруулга", "Ядаж нэг сурагчид дүн оруулна уу.", "warning");
    }
  
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
      now.getHours()
    )}:${pad(now.getMinutes())}`;
  
    const payload = {
      subject,
      class: className,
      date: dateYMD,
      quizName: quizTitle.trim(), // одоо заавал байгаа
      uploadedAt: new Date().toISOString(),
      rows,
      sourceFiles: { part1: "manual-input" },
    };
  
    try {
      setStatus("Илгээж байна…");
      const token = await user.getIdToken();
      const res = await fetch("/api/teacher/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Серверийн алдаа.");
      }
      openModal("Амжилттай", "Гараас оруулсан дүн бүртгэгдлээ.", "success");
      setStatus("");
      setScoreByExt({});
      if (subject) {
        localStorage.removeItem(`files_cache_${subject}_v1`);
      }
    } catch (e: any) {
      setStatus("");
      openModal("Алдаа", e.message ?? "Тодорхойгүй алдаа гарлаа.", "error");
    }
  };

  const isLight = mounted && document.documentElement.classList.contains("light");
  const modalTitleColor =
    modalType === "success"
      ? isLight ? "#10b981" : "#9af5e3"
      : modalType === "error"
      ? isLight ? "#ef4444" : "#ff8b8b"
      : modalType === "warning"
      ? isLight ? "#f59e0b" : "#ffc97a"
      : "var(--text)";

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)", color: "var(--text)" }}>
      {/* theme toggle */}
      <div className="fixed top-4 right-4 z-[999]">
        <button
          onClick={toggleTheme}
          className="w-11 h-11 rounded-full border"
          style={{ background: "var(--card)", borderColor: "var(--stroke)", color: "var(--muted)" }}
        >
          {!mounted ? null : lightMode ? "☀️" : "🌙"}
        </button>
      </div>

      {/* nav */}
      <div className="header text-center pt-4 px-4 sm:px-0">
        <div
          className="inline-flex flex-wrap gap-2 p-2 rounded-xl"
          style={{ background: "var(--card)", border: "1px solid var(--stroke)" }}
        >
          <Link href="/teacher" className="px-3 sm:px-4 py-2 rounded-md font-bold" style={{ color: "var(--muted)" }}>
            Нүүр
          </Link>
          <Link href="/teacher/upload" className="px-3 sm:px-4 py-2 rounded-md font-bold" style={{ color: "var(--muted)" }}>
            Дүн оруулах (файлаар)
          </Link>
          <Link href="/teacher/manual" className="px-3 sm:px-4 py-2 rounded-md font-bold" style={{ background: "var(--card2)", color: "var(--text)" }}>
            Дүн оруулах (гараар)
          </Link>
        </div>
      </div>

      <div className="max-w-[1000px] mx-auto px-4 my-6 sm:my-8">
        <div className="rounded-2xl p-4 sm:p-6" style={{ background: "var(--card)", border: "1px solid var(--stroke)" }}>
          <h2 className="text-lg font-bold mb-4">Гараас дүн оруулах</h2>

          {/* subject */}
          <label className="block mb-3 font-bold">Хичээлээ сонго</label>
          <div className="grid gap-2 sm:gap-3 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
            {SUBJECTS.map((s) => {
              const selected = subject === s;
              return (
                <button
                  key={s}
                  onClick={() => setSubject(s)}
                  className="rounded-xl py-2 px-3 text-center font-semibold"
                  style={{
                    border: `1px solid ${selected ? "#9fbfff" : "var(--stroke)"}`,
                    background: selected ? "rgba(139,184,255,.15)" : "transparent",
                  }}
                >
                  {s}
                </button>
              );
            })}
          </div>

          {/* extra fields: class + date */}
          <div className="grid gap-3 sm:grid-cols-2 mb-4">
            <div>
              <label className="block mb-1 text-sm font-semibold">Анги *</label>
              {loadingStudents ? (
                <div className="text-sm" style={{ color: "var(--muted)" }}>Ангиудыг ачаалж байна…</div>
              ) : studentsError ? (
                <div className="text-sm" style={{ color: "#ff8b8b" }}>{studentsError}</div>
              ) : (
                <select
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  className="w-full rounded-md px-3 py-2 text-sm"
                  style={{ background: "var(--card2)", border: "1px solid var(--stroke)", color: "var(--text)" }}
                >
                  <option value="">— Ангиа сонго —</option>
                  {allClasses.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className="block mb-1 text-sm font-semibold">Огноо *</label>
              <input
                type="date"
                value={dateYMD}
                onChange={(e) => setDateYMD(e.target.value)}
                className="w-full rounded-md px-3 py-2 text-sm"
                style={{ background: "var(--card2)", border: "1px solid var(--stroke)", color: "var(--text)" }}
              />
            </div>
          </div>

          {/* ШИНЭ: анги сонгогдсон үед: 1/2 хэсэг + оноонууд + шалгалтын нэр */}
          {className ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold whitespace-nowrap">Шалгалтын бүтэц:</span>
                <label className="flex items-center gap-1 text-sm cursor-pointer">
                  <input type="radio" name="parts" value="1" checked={examParts === 1} onChange={() => setExamParts(1)} />
                  1 хэсэгтэй
                </label>
                <label className="flex items-center gap-1 text-sm cursor-pointer">
                  <input type="radio" name="parts" value="2" checked={examParts === 2} onChange={() => setExamParts(2)} />
                  2 хэсэгтэй
                </label>
              </div>

              {examParts === 1 ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold whitespace-nowrap">Оноо:</span>
                  <input
                    type="number"
                    min={0}
                    value={defaultQuestions1 === "" ? "" : defaultQuestions1}
                    onChange={(e) => setDefaultQuestions1(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-20 rounded-md px-2 py-1 text-sm"
                    style={{ background: "var(--card2)", border: "1px solid var(--stroke)" }}
                    placeholder="20"
                  />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-sm whitespace-nowrap">1-р хэсэг:</span>
                    <input
                      type="number"
                      min={0}
                      value={defaultQuestions1 === "" ? "" : defaultQuestions1}
                      onChange={(e) => setDefaultQuestions1(e.target.value === "" ? "" : Number(e.target.value))}
                      className="w-20 rounded-md px-2 py-1 text-sm"
                      style={{ background: "var(--card2)", border: "1px solid var(--stroke)" }}
                      placeholder="20"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm whitespace-nowrap">2-р хэсэг:</span>
                    <input
                      type="number"
                      min={0}
                      value={defaultQuestions2 === "" ? "" : defaultQuestions2}
                      onChange={(e) => setDefaultQuestions2(e.target.value === "" ? "" : Number(e.target.value))}
                      className="w-20 rounded-md px-2 py-1 text-sm"
                      style={{ background: "var(--card2)", border: "1px solid var(--stroke)" }}
                      placeholder="20"
                    />
                  </div>
                </>
              )}

              <div className="flex-1">
                <input
                  value={quizTitle}
                  onChange={(e) => setQuizTitle(e.target.value)}
                  placeholder="Шалгалтын нэр (ж: 2025 оны сорил 1)"
                  className="w-full rounded-md px-3 py-2 text-sm"
                  style={{ background: "var(--card2)", border: "1px solid var(--stroke)" }}
                />
              </div>
            </div>
          ) : null}

          {/* сурагчдын хүснэгт */}
          {className ? (
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  {examParts === 1 ? (
                    <tr style={{ background: "var(--card2)" }}>
                      <th className="text-left p-2">External ID</th>
                      <th className="text-left p-2">Овог</th>
                      <th className="text-left p-2">Нэр</th>
                      <th className="text-left p-2 w-[120px]">Нийт асуулт</th>
                      <th className="text-left p-2 w-[120px]">Зөв хариу</th>
                    </tr>
                  ) : (
                    <tr style={{ background: "var(--card2)" }}>
                      <th className="text-left p-2" rowSpan={2}>External ID</th>
                      <th className="text-left p-2" rowSpan={2}>Овог</th>
                      <th className="text-left p-2" rowSpan={2}>Нэр</th>
                      <th className="text-center p-2" colSpan={2}>1-р хэсэг</th>
                      <th className="text-center p-2" colSpan={2}>2-р хэсэг</th>
                    </tr>
                  )}
                  {examParts === 2 && (
                    <tr style={{ background: "var(--card2)" }}>
                      <th className="text-left p-2 w-[110px]">Нийт</th>
                      <th className="text-left p-2 w-[110px]">Зөв</th>
                      <th className="text-left p-2 w-[110px]">Нийт</th>
                      <th className="text-left p-2 w-[110px]">Зөв</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {studentsOfClass.length === 0 ? (
                    <tr>
                      <td colSpan={examParts === 1 ? 5 : 7} className="p-3 text-center" style={{ color: "var(--muted)" }}>
                        Энэ ангид сурагч олдсонгүй.
                      </td>
                    </tr>
                  ) : (
                    studentsOfClass.map((s) => {
                      const score = scoreByExt[s.externalId] || {
                        numQuestions1: "", numCorrect1: "", numQuestions2: "", numCorrect2: "",
                      };
                      if (examParts === 1) {
                        return (
                          <tr key={s.externalId} className="border-b" style={{ borderColor: "var(--stroke)" }}>
                            <td className="p-2">{s.externalId}</td>
                            <td className="p-2">{s.lastName}</td>
                            <td className="p-2">{s.firstName}</td>
                            <td className="p-2">
                              <input
                                type="number"
                                min={0}
                                value={defaultQuestions1 !== "" ? defaultQuestions1 : (score.numQuestions1 === "" ? "" : score.numQuestions1)}
                                onChange={(e) => updateScore(s.externalId, "numQuestions1", e.target.value)}
                                disabled={defaultQuestions1 !== ""}
                                className="w-full rounded-md px-2 py-1"
                                style={{ background: "var(--card2)", border: "1px solid var(--stroke)" }}
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min={0}
                                value={score.numCorrect1 === "" ? "" : score.numCorrect1}
                                onChange={(e) => updateScore(s.externalId, "numCorrect1", e.target.value)}
                                className="w-full rounded-md px-2 py-1"
                                style={{ background: "var(--card2)", border: "1px solid var(--stroke)" }}
                              />
                            </td>
                          </tr>
                        );
                      } else {
                        return (
                          <tr key={s.externalId} className="border-b" style={{ borderColor: "var(--stroke)" }}>
                            <td className="p-2">{s.externalId}</td>
                            <td className="p-2">{s.lastName}</td>
                            <td className="p-2">{s.firstName}</td>
                            {/* 1-р хэсэг */}
                            <td className="p-2">
                              <input
                                type="number"
                                min={0}
                                value={defaultQuestions1 !== "" ? defaultQuestions1 : (score.numQuestions1 === "" ? "" : score.numQuestions1)}
                                onChange={(e) => updateScore(s.externalId, "numQuestions1", e.target.value)}
                                disabled={defaultQuestions1 !== ""}
                                className="w-full rounded-md px-2 py-1"
                                style={{ background: "var(--card2)", border: "1px solid var(--stroke)" }}
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min={0}
                                value={score.numCorrect1 === "" ? "" : score.numCorrect1}
                                onChange={(e) => updateScore(s.externalId, "numCorrect1", e.target.value)}
                                className="w-full rounded-md px-2 py-1"
                                style={{ background: "var(--card2)", border: "1px solid var(--stroke)" }}
                              />
                            </td>
                            {/* 2-р хэсэг */}
                            <td className="p-2">
                              <input
                                type="number"
                                min={0}
                                value={defaultQuestions2 !== "" ? defaultQuestions2 : (score.numQuestions2 === "" ? "" : score.numQuestions2)}
                                onChange={(e) => updateScore(s.externalId, "numQuestions2", e.target.value)}
                                disabled={defaultQuestions2 !== ""}
                                className="w-full rounded-md px-2 py-1"
                                style={{ background: "var(--card2)", border: "1px solid var(--stroke)" }}
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min={0}
                                value={score.numCorrect2 === "" ? "" : score.numCorrect2}
                                onChange={(e) => updateScore(s.externalId, "numCorrect2", e.target.value)}
                                className="w-full rounded-md px-2 py-1"
                                style={{ background: "var(--card2)", border: "1px solid var(--stroke)" }}
                              />
                            </td>
                          </tr>
                        );
                      }
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : null}

          {status && (
            <div className="text-sm mb-2" style={{ color: "orange" }}>
              {status}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Link
              href="/teacher"
              className="rounded-xl font-bold px-4 py-2 text-center"
              style={{ background: "var(--card2)", border: "1px solid var(--stroke)", color: "var(--text)" }}
            >
              Буцах
            </Link>
            <button
              onClick={submit}
              className="rounded-xl font-bold px-4 py-2 text-center"
              style={{ background: "var(--primary-bg)", color: "var(--primary-text)", border: "1px solid transparent" }}
            >
              Хадгалах
            </button>
          </div>
        </div>
      </div>

      {/* modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,.6)", backdropFilter: "blur(4px)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            className="rounded-2xl p-6 w-[92%] max-w-[420px] text-center"
            style={{ background: "var(--bg)", border: "1px solid var(--stroke)" }}
          >
            <div className="flex items-center justify-center gap-2 mb-3">
              <span style={{ fontSize: 24 }}>
                {modalType === "success"
                  ? "✅"
                  : modalType === "error"
                  ? "⚠️"
                  : modalType === "warning"
                  ? "🔔"
                  : "ℹ️"}
              </span>
              <h3 className="m-0 text-lg font-bold" style={{ color: modalTitleColor }}>
                {modalTitle}
              </h3>
            </div>
            <p className="mb-5 sm:mb-6" style={{ color: "var(--muted)", lineHeight: 1.5 }}>
              {modalMessage}
            </p>
            <button
              className="rounded-xl font-bold px-4 py-2 w-full"
              style={{ background: "var(--card2)", border: "1px solid var(--stroke)", color: "var(--text)" }}
              onClick={closeModal}
            >
              Ойлголоо
            </button>
          </div>
        </div>
      )}
    </div>
  );
}