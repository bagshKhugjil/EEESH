// src/app/teacher/files/page.tsx
"use client";

import { useAuth } from "@/components/auth-provider";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
type Subject = (typeof SUBJECTS)[number];

type QuizItem = {
  id: string;
  quizName: string;
  subject: string;
  uploadedAt: string;
  uploadedByEmail: string | null;
  sourceFiles?: { part1?: string; part2?: string };
};

type ModalState = {
  open: boolean;
  title: string;
  message: string;
  onConfirm?: () => void;
};

export default function TeacherFilesPage() {
  const { user } = useAuth();

  const [subject, setSubject] = useState<Subject | "">("");
  const [items, setItems] = useState<QuizItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((it) =>
      `${it.quizName} ${it.uploadedByEmail ?? ""}`.toLowerCase().includes(s)
    );
  }, [items, q]);

  // theme
  const [mounted, setMounted] = useState(false);
  const [lightMode, setLightMode] = useState(false);
  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined" && localStorage.getItem("theme") === "light") {
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

  // modal
  const [modal, setModal] = useState<ModalState>({ open: false, title: "", message: "" });
  const openConfirm = (title: string, message: string, onConfirm: () => void) =>
    setModal({ open: true, title, message, onConfirm });
  const closeModal = () => setModal((m) => ({ ...m, open: false }));

  // fetch files (quizzes) by subject
  const fetchFiles = async (s: Subject) => {
    if (!user) return;
    setSubject(s);
    setLoading(true);
    setErr(null);

    try {
      const token = await user.getIdToken();
      const headers: HeadersInit = { Authorization: `Bearer ${token}` };

      const res = await fetch(`/api/teacher/files?subject=${encodeURIComponent(s)}`, { headers });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Серверийн хариуг уншиж чадсангүй" }));
        throw new Error(errData.detail || errData.error || "Алдаа гарлаа");
      }
      
      const data: { ok: boolean; items?: QuizItem[] } = await res.json();
      const newItems = Array.isArray(data.items) ? data.items : [];
      setItems(newItems);
    } catch (e) {
      setItems([]);
      setErr(e instanceof Error ? e.message : "Алдаа гарлаа");
    } finally {
      setLoading(false);
    }
  };

  // delete (archive) one quiz
  const deleteQuiz = async (quiz: QuizItem) => {
    if (!user) return;
    closeModal();
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/teacher/files/${encodeURIComponent(quiz.id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: { ok?: boolean; error?: string } = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Устгал амжилтгүй.");
      
      setItems((prev) => prev.filter((x) => x.id !== quiz.id));
      
    } catch (e) {
      alert(e instanceof Error ? e.message : "Алдаа гарлаа");
    }
  };

  useEffect(() => {
    if (user && !subject && SUBJECTS.length) {
      const firstSubject = SUBJECTS[0];
            
      fetchFiles(firstSubject);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, subject]);

  const fmtDateTime = (iso?: string) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(+d)) return "—";
    return d.toLocaleString();
  };

  return (
    <div className="min-h-dvh" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <div className="fixed top-3 right-3 z-[999]">
        <button
          onClick={toggleTheme}
          className="w-10 h-10 rounded-full border flex items-center justify-center"
          style={{ background: "var(--card)", borderColor: "var(--stroke)", color: "var(--muted)" }}
          title="Өнгө солих"
          aria-label="Өнгө солих"
        >
          {!mounted ? null : lightMode ? "☀️" : "🌙"}
        </button>
      </div>

      <div className="pt-4 text-center">
        <div className="inline-flex gap-2 p-2 rounded-xl" style={{ background: "var(--card)", border: "1px solid var(--stroke)" }}>
          <Link href="/teacher" className="px-4 py-2 rounded-md font-bold transition-colors" style={{ color: "var(--muted)" }}>Нүүр</Link>
          <Link href="/teacher/upload" className="px-4 py-2 rounded-md font-bold transition-colors" style={{ color: "var(--muted)" }}>Дүн оруулах</Link>
          <Link href="/teacher/files" className="px-4 py-2 rounded-md font-bold" style={{ background: "var(--card2)", color: "var(--text)" }}>Файл удирдах</Link>
        </div>
      </div>

      <div
        className="sticky top-0 z-40 mt-3 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-[color:var(--card)/0.7] bg-[var(--card)] border-b"
        style={{ borderColor: "var(--stroke)" }}
      >
        <div className="max-w-[1000px] mx-auto">
          <label className="block mb-2 font-bold text-sm sm:text-base">Хичээлээ сонго</label>

          <div className="grid gap-2 sm:gap-3 mb-3 sm:mb-4 grid-cols-3 xs:grid-cols-4 md:grid-cols-5">
            {SUBJECTS.map((s) => {
              const selected = subject === s;
              return (
                <button
                  key={s}
                  onClick={() => fetchFiles(s)}
                  className="rounded-lg px-3 py-2 text-center text-xs sm:text-sm font-semibold truncate"
                  style={{
                    border: `1px solid ${selected ? "#9fbfff" : "var(--stroke)"}`,
                    background: selected ? "rgba(139,184,255,.15)" : "var(--card2)",
                    color: "var(--text)",
                    transition: "background-color .2s, border-color .2s",
                  }}
                >
                  {s}
                </button>
              );
            })}
          </div>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Файлын нэр/үүсгэсэн имэйлээр хайх…"
            className="w-full rounded-md px-3 py-2 text-sm sm:text-base"
            style={{ background: "var(--card2)", border: "1px solid var(--stroke)", color: "var(--text)" }}
          />
        </div>
      </div>

      <div className="max-w-[1000px] mx-auto px-4 py-5">
        {(loading && items.length === 0) && (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: "var(--card)", border: "1px solid var(--stroke)" }} />
            ))}
          </div>
        )}

        {err && (
          <div className="text-center p-6" style={{ color: "#ff8b8b" }}>{err}</div>
        )}

        {!loading && !err && subject && filtered.length === 0 && (
          <div className="text-center p-6" style={{ color: "var(--muted)" }}>
            “{subject}” хичээлд бичлэг алга.
          </div>
        )}

        {filtered.length > 0 && (
          <>
            <div className="md:hidden space-y-3">
              {filtered.map((f) => {
                const canDelete = user?.email && f.uploadedByEmail && user.email === f.uploadedByEmail;
                return (
                  <div key={f.id} className="rounded-2xl p-3" style={{ background: "var(--card)", border: "1px solid var(--stroke)" }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/teacher/quizzes/${encodeURIComponent(f.id)}`}
                          className="font-semibold truncate underline decoration-dotted hover:decoration-solid"
                          title="Шалгалтын дүн рүү очих"
                        >
                          {f.quizName}
                        </Link>
                        <div className="text-xs text-[var(--muted)] mt-1">
                          Үүсгэсэн: {f.uploadedByEmail ?? "—"}
                        </div>
                        <div className="text-xs text-[var(--muted)]">
                          Огноо: {fmtDateTime(f.uploadedAt)}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {canDelete ? (
                          <button
                            className="px-3 py-1.5 rounded-lg text-xs"
                            style={{ background: "#ff4d4d2b", color: "#ff8b8b", border: "1px solid #ff4d4d88" }}
                            onClick={() =>
                              openConfirm(
                                "Архивлах уу?",
                                `“${f.quizName}” бичлэгийг архивлахаар устгана. Үүнтэй холбоотой бүх дүн (results_flat) мөн устгагдана.`,
                                () => deleteQuiz(f)
                              )
                            }
                          >
                            Архивлах
                          </button>
                        ) : (
                          <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                            Зөвхөн эзэмшигч
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden md:block overflow-auto border border-[var(--stroke)] rounded-xl">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ background: "var(--card2)", borderColor: "var(--stroke)" }}>
                    <th className="px-3 py-2 text-left">Файлын нэр</th>
                    <th className="px-3 py-2 text-left">Үүсгэсэн</th>
                    <th className="px-3 py-2 text-left">Огноо</th>
                    <th className="px-3 py-2 text-right">Үйлдэл</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((f) => {
                    const canDelete = user?.email && f.uploadedByEmail && user.email === f.uploadedByEmail;
                    return (
                      <tr key={f.id} className="border-b" style={{ borderColor: "var(--stroke)" }}>
                        <td className="px-3 py-2">
                          <Link
                            href={`/teacher/quizzes/${encodeURIComponent(f.id)}`}
                            className="font-semibold underline decoration-dotted hover:decoration-solid"
                            title="Шалгалтын дүн рүү очих"
                          >
                            {f.quizName}
                          </Link>
                        </td>
                        <td className="px-3 py-2">{f.uploadedByEmail ?? "—"}</td>
                        <td className="px-3 py-2">{fmtDateTime(f.uploadedAt)}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex gap-2">
                            <Link
                              href={`/teacher/quizzes/${encodeURIComponent(f.id)}`}
                              className="px-3 py-1.5 rounded-lg text-sm"
                              style={{ background: "var(--bg)", border: "1px solid var(--stroke)", color: "var(--text)" }}
                              title="Дүн харах"
                            >
                              Нээх
                            </Link>
                            {canDelete ? (
                              <button
                                className="px-3 py-1.5 rounded-lg text-sm"
                                style={{ background: "#ff4d4d2b", color: "#ff8b8b", border: "1px solid #ff4d4d88" }}
                                onClick={() =>
                                  openConfirm(
                                    "Архивлах уу?",
                                    `“${f.quizName}” бичлэгийг архивлахаар устгана. Үүнтэй холбоотой бүх дүн (results_flat) мөн устгагдана.`,
                                    () => deleteQuiz(f)
                                  )
                                }
                              >
                                Архивлах
                              </button>
                            ) : (
                              <span className="text-xs" style={{ color: "var(--muted)" }}>
                                Зөвхөн эзэмшигч
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {modal.open && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,.6)", backdropFilter: "blur(4px)" }}
          onClick={(e) => e.currentTarget === e.target && closeModal()}
        >
          <div className="rounded-2xl p-6 w-[92%] max-w-[420px] text-center" style={{ background: "var(--bg)", border: "1px solid var(--stroke)" }}>
            <h3 className="m-0 text-lg font-bold mb-2">{modal.title}</h3>
            <p className="mb-5" style={{ color: "var(--muted)" }}>
              {modal.message}
            </p>
            <div className="flex gap-2 justify-center">
              <button
                className="px-4 py-2 rounded-lg border"
                style={{ background: "var(--card2)", borderColor: "var(--stroke)", color: "var(--text)" }}
                onClick={closeModal}
              >
                Цуцлах
              </button>
              <button
                className="px-4 py-2 rounded-lg border"
                style={{ background: "#ff4d4d55", borderColor: "#ff8b8b", color: "#ff8b8b" }}
                onClick={() => modal.onConfirm?.()}
              >
                Архивлах
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}