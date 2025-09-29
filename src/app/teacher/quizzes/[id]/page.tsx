// src/app/teacher/quizzes/[id]/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { getCache, setCache, delCache } from "@/lib/cache";

type QuizMeta = {
  id: string;
  title: string;
  subject: string;
  class: string;
  date: string; // YYYY-MM-DD
  uploadedAt?: string;
  uploadedBy?: string | null;
  uploadedByEmail?: string | null;
  totalStudents?: number | null;
  stats?: { avg: number | null; max: number | null; min: number | null };
  sourceFiles?: { part1?: string; part2?: string };
};

type ResultItem = {
  id: string;           // results_flat doc id
  studentId: string;
  studentName: string;
  class: string;
  subject: string;
  date: string;
  score: number | null;
  raw?: any;
};

const CACHE_TTL = 60_000; // 1 мин — метадатыг богино кэшлэнэ
const metaCacheKey = (quizId: string) => `quiz_meta_${quizId}_v1`;

export default function QuizDetailPage(props: { params: Promise<{ id: string }> }) {
  const { user } = useAuth();
  const [quizId, setQuizId] = useState<string>("");
  const [meta, setMeta] = useState<QuizMeta | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [errorMeta, setErrorMeta] = useState<string | null>(null);

  const [items, setItems] = useState<ResultItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [errItems, setErrItems] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);

  const [q, setQ] = useState("");
  const firstLoadRef = useRef(true);

  // resolve params (Next 15: params is Promise)
  useEffect(() => {
    (async () => {
      const p = await props.params;
      setQuizId(decodeURIComponent(p.id));
    })();
  }, [props.params]);

  // Theme (simple)
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

  // fetch meta (with cache)
  useEffect(() => {
    if (!user || !quizId) return;
    const cached = getCache<QuizMeta>(metaCacheKey(quizId), 1);
    if (cached) setMeta(cached);

    (async () => {
      try {
        setLoadingMeta(true);
        setErrorMeta(null);
        const token = await user.getIdToken();
        const res = await fetch(`/api/teacher/quizzes/${encodeURIComponent(quizId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data: { ok: boolean; quiz?: QuizMeta; error?: string } = await res.json();
        if (!res.ok || !data.ok || !data.quiz) throw new Error(data.error || "Алдаа гарлаа");
        setMeta(data.quiz);
        setCache(metaCacheKey(quizId), data.quiz, CACHE_TTL, 1);
      } catch (e) {
        setErrorMeta(e instanceof Error ? e.message : "Метадата ачаалж чадсангүй.");
      } finally {
        setLoadingMeta(false);
      }
    })();
  }, [user, quizId]);

  // fetch results (paged)
  async function loadPage(nextCursor?: string | null) {
    if (!user || !quizId) return;
    setLoadingItems(true);
    setErrItems(null);
    try {
      const token = await user.getIdToken();
      const url = new URL(`/api/teacher/quizzes/${encodeURIComponent(quizId)}/results`, window.location.origin);
      if (nextCursor) url.searchParams.set("cursor", nextCursor);
      url.searchParams.set("limit", "200");

      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      const data: { ok: true; items: ResultItem[]; nextCursor: string | null } | { ok: false; error: string } =
        await res.json();

      if (!res.ok || !("ok" in data) || !data.ok) {
        const msg = "error" in data ? data.error : "Серверийн алдаа";
        throw new Error(msg);
      }

      setItems((prev) => (nextCursor ? [...prev, ...data.items] : data.items));
      setCursor(data.nextCursor);
      setHasMore(!!data.nextCursor);
    } catch (e) {
      setErrItems(e instanceof Error ? e.message : "Дүн ачаалж чадсангүй.");
    } finally {
      setLoadingItems(false);
    }
  }

  // first load results
  useEffect(() => {
    if (!user || !quizId) return;
    if (firstLoadRef.current) {
      firstLoadRef.current = false;
      loadPage(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, quizId]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((r) =>
      `${r.studentName} ${r.class} ${r.studentId}`.toLowerCase().includes(s)
    );
  }, [items, q]);

  const fmtDate = (iso?: string) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return isNaN(+d) ? "—" : d.toLocaleString();
    };

  return (
    <div className="min-h-dvh" style={{ background: "var(--bg)", color: "var(--text)" }}>
      {/* Theme */}
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

      {/* Header nav */}
      <div className="pt-4 text-center">
        <div className="inline-flex gap-2 p-2 rounded-xl" style={{ background: "var(--card)", border: "1px solid var(--stroke)" }}>
          <Link href="/teacher" className="px-4 py-2 rounded-md font-bold" style={{ color: "var(--muted)" }}>
            Нүүр
          </Link>
          <Link href="/teacher/upload" className="px-4 py-2 rounded-md font-bold" style={{ color: "var(--muted)" }}>
            Дүн оруулах
          </Link>
          <Link href="/teacher/files" className="px-4 py-2 rounded-md font-bold" style={{ color: "var(--muted)" }}>
            Файл удирдлага
          </Link>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-4 py-5">
        {/* Meta */}
        <div className="rounded-2xl p-4 sm:p-5 mb-5" style={{ background: "var(--card)", border: "1px solid var(--stroke)" }}>
          {loadingMeta ? (
            <div className="animate-pulse h-16 rounded-lg" style={{ background: "var(--card2)" }} />
          ) : errorMeta ? (
            <div className="text-center text-sm" style={{ color: "#ff8b8b" }}>
              {errorMeta}
            </div>
          ) : meta ? (
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <div className="text-xl font-extrabold">{meta.title}</div>
                <div className="text-sm" style={{ color: "var(--muted)" }}>
                  Хичээл: <b style={{ color: "var(--text)" }}>{meta.subject || "—"}</b>
                  {meta.class ? <> · Анги: <b style={{ color: "var(--text)" }}>{meta.class}</b></> : null}
                </div>
                <div className="text-sm" style={{ color: "var(--muted)" }}>
                  Үүсгэсэн: <b style={{ color: "var(--text)" }}>{meta.uploadedByEmail || "—"}</b> · {fmtDate(meta.uploadedAt)}
                </div>
                {(meta.sourceFiles?.part1 || meta.sourceFiles?.part2) && (
                  <div className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                    Эх файл: <span style={{ color: "var(--text)" }}>
                      {[meta.sourceFiles?.part1, meta.sourceFiles?.part2].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </div>
                )}
              </div>
              <div className="sm:text-right">
                <div className="text-sm mb-1" style={{ color: "var(--muted)" }}>Нийт сурагч</div>
                <div className="text-2xl font-extrabold">{meta.totalStudents ?? 0}</div>
                <div className="mt-3 text-sm" style={{ color: "var(--muted)" }}>Дундаж · Их · Бага</div>
                <div className="text-lg font-bold">
                  {meta.stats?.avg ?? "—"} / {meta.stats?.max ?? "—"} / {meta.stats?.min ?? "—"}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Search + actions */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Сурагчийн нэр/анги/ID-гаар хайх…"
            className="w-full rounded-md px-3 py-2 text-sm sm:text-base"
            style={{ background: "var(--card2)", border: "1px solid var(--stroke)", color: "var(--text)" }}
          />
          <div className="flex gap-2">
            <button
              className="rounded-md px-3 py-2 text-sm font-bold"
              style={{ background: "var(--bg)", border: "1px solid var(--stroke)", color: "var(--text)" }}
              onClick={() => { delCache(metaCacheKey(quizId)); if (user) { /* refetch meta */ (async () => {
                try {
                  setLoadingMeta(true);
                  const token = await user.getIdToken();
                  const res = await fetch(`/api/teacher/quizzes/${encodeURIComponent(quizId)}`, {
                    headers: { Authorization: `Bearer ${token}` },
                  });
                  const data = await res.json();
                  if (data?.ok && data.quiz) {
                    setMeta(data.quiz);
                    setCache(metaCacheKey(quizId), data.quiz, CACHE_TTL, 1);
                  }
                } finally { setLoadingMeta(false); }
              })(); } }}
            >
              Meta Refresh
            </button>
            <Link
              href="/teacher/files"
              className="rounded-md px-3 py-2 text-sm font-bold"
              style={{ background: "var(--card2)", border: "1px solid var(--stroke)", color: "var(--text)" }}
            >
              Буцах
            </Link>
          </div>
        </div>

        {/* Results table */}
        <div className="overflow-auto border border-[var(--stroke)] rounded-xl">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b" style={{ background: "var(--card2)", borderColor: "var(--stroke)" }}>
                <th className="px-3 py-2 text-left">Нэр</th>
                <th className="px-3 py-2 text-left">Анги</th>
                <th className="px-3 py-2 text-left">Огноо</th>
                <th className="px-3 py-2 text-right">Оноо (0–100)</th>
              </tr>
            </thead>
            <tbody>
              {loadingItems && items.length === 0 ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i} className="border-b" style={{ borderColor: "var(--stroke)" }}>
                    <td className="px-3 py-4" colSpan={4}>
                      <div className="h-4 rounded-md animate-pulse" style={{ background: "var(--card2)" }} />
                    </td>
                  </tr>
                ))
              ) : errItems ? (
                <tr>
                  <td className="px-3 py-4 text-center" colSpan={4} style={{ color: "#ff8b8b" }}>
                    {errItems}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-center text-muted" colSpan={4}>
                    Дүн алга.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="border-b" style={{ borderColor: "var(--stroke)" }}>
                    <td className="px-3 py-2">{r.studentName}</td>
                    <td className="px-3 py-2">{r.class}</td>
                    <td className="px-3 py-2">{r.date || "—"}</td>
                    <td className="px-3 py-2 text-right">{r.score ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex justify-between items-center mt-3">
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            Нийт ачаалсан: {items.length}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => loadPage(null)}
              disabled={loadingItems}
              className="rounded-md px-3 py-2 text-sm font-bold disabled:opacity-50"
              style={{ background: "var(--bg)", border: "1px solid var(--stroke)", color: "var(--text)" }}
              title="Дахин ачаах"
            >
              Дахин ачаах
            </button>
            <button
              onClick={() => loadPage(cursor)}
              disabled={!hasMore || loadingItems}
              className="rounded-md px-3 py-2 text-sm font-bold disabled:opacity-50"
              style={{ background: "var(--primary-bg)", color: "var(--primary-text)", border: "1px solid transparent" }}
              title="Цааш ачаалах"
            >
              Цааш ачаалах
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}