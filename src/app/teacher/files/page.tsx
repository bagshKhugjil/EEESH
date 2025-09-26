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
  id: string;                 // firestore doc id
  quizId: string;             // == id
  quizName: string;
  subject: string;
  uploadedAt: string;         // ISO
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
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [q, setQ] = useState(""); // client-side search
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
    if (localStorage.getItem("theme") === "light") {
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
  const [modal, setModal] = useState<ModalState>({
    open: false,
    title: "",
    message: "",
  });

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
      const res = await fetch(`/api/teacher/files?subject=${encodeURIComponent(s)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: { ok: boolean; items?: QuizItem[]; error?: string; detail?: string } =
        await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.detail || data.error || "Алдаа гарлаа");
      }
      setItems(data.items ?? []);
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

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)", color: "var(--text)" }}>
      {/* Theme toggle */}
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

      {/* Inline nav (өмнөхтэй ижил таб) */}
      <div className="header text-center pt-4">
        <div
          className="inline-flex gap-2 p-2 rounded-xl"
          style={{ background: "var(--card)", border: "1px solid var(--stroke)" }}
        >
          <Link href="/teacher" className="px-4 py-2 rounded-md font-bold transition-colors" style={{ color: "var(--muted)" }}>
            Нүүр
          </Link>
          <Link href="/teacher/upload" className="px-4 py-2 rounded-md font-bold transition-colors" style={{ color: "var(--muted)" }}>
            Дүн оруулах
          </Link>
          <Link href="/teacher/results" className="px-4 py-2 rounded-md font-bold transition-colors" style={{ color: "var(--muted)" }}>
            Дүн харах
          </Link>
          <Link href="/teacher/files" className="px-4 py-2 rounded-md font-bold" style={{ background: "var(--card2)", color: "var(--text)" }}>
            Файл удирдах
          </Link>
        </div>
      </div>

      <div className="wrap max-w-[1000px] mx-auto px-4 my-8">
        {/* Subject grid */}
        <div
          className="card rounded-2xl p-4 md:p-6"
          style={{ background: "var(--card)", border: "1px solid var(--stroke)" }}
        >
          <label className="block mb-3 font-bold">Хичээлээ сонго</label>
          <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
            {SUBJECTS.map((s) => {
              const selected = subject === s;
              return (
                <button
                  key={s}
                  onClick={() => fetchFiles(s)}
                  className="subject-card rounded-xl p-3 text-center font-semibold"
                  style={{
                    border: `1px solid ${selected ? "#9fbfff" : "var(--stroke)"}`,
                    background: selected ? "rgba(139,184,255,.15)" : "transparent",
                    transition: "background-color .2s, border-color .2s",
                  }}
                >
                  {s}
                </button>
              );
            })}
          </div>

          {/* client-side search */}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Quiz нэр/имэйлээр хайх…"
            className="w-full rounded-md px-3 py-2"
            style={{ background: "var(--card2)", border: "1px solid var(--stroke)", color: "var(--text)" }}
          />
        </div>

        {/* List */}
        <div className="file-list-container mt-6">
          {loading ? (
            <div className="text-center p-6">Уншиж байна…</div>
          ) : err ? (
            <div className="text-center p-6" style={{ color: "#ff8b8b" }}>
              {err}
            </div>
          ) : subject && filtered.length === 0 ? (
            <div className="text-center p-6" style={{ color: "var(--muted)" }}>
              “{subject}” хичээлд бичлэг алга.
            </div>
          ) : filtered.length > 0 ? (
            <div className="overflow-auto border border-stroke rounded-lg">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-card2 border-b border-stroke">
                    <th className="px-3 py-2 text-left">Шалгалтын нэр</th>
                    <th className="px-3 py-2 text-left">Хичээл</th>
                    <th className="px-3 py-2 text-left">Оруулсан</th>
                    <th className="px-3 py-2 text-left">Огноо</th>
                    <th className="px-3 py-2 text-right">Үйлдэл</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((f) => {
                    const canDelete = user?.email && f.uploadedByEmail && user.email === f.uploadedByEmail;
                    return (
                      <tr key={f.id} className="border-b border-stroke">
                        <td className="px-3 py-2 font-semibold">{f.quizName}</td>
                        <td className="px-3 py-2">{f.subject}</td>
                        <td className="px-3 py-2">{f.uploadedByEmail ?? "—"}</td>
                        <td className="px-3 py-2">
                          {f.uploadedAt ? new Date(f.uploadedAt).toLocaleString() : "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {canDelete ? (
                            <button
                              className="px-3 py-1.5 rounded-lg text-sm"
                              style={{ background: "#ff4d4d2b", color: "#ff8b8b", border: "1px solid #ff4d4d88" }}
                              onClick={() =>
                                openConfirm(
                                  "Архивлах уу?",
                                  `“${f.quizName}” бичлэгийг архивлахаар устгана. Үүнтэй холбоотой бүх дүн (students/*/results/${f.quizId}) мөн устгагдана.`,
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
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>

      {/* Modal */}
      {modal.open && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,.6)", backdropFilter: "blur(4px)" }}
          onClick={(e) => e.currentTarget === e.target && closeModal()}
        >
          <div
            className="rounded-2xl p-6 w-[90%] max-w-[420px] text-center"
            style={{ background: "var(--bg)", border: "1px solid var(--stroke)" }}
          >
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