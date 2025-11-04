// src/app/teacher/quizzes/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";

// --- Үндсэн төрлүүд ---
type QuizMeta = {
  id: string;
  title: string;
  subject: string;
  class: string;
  date: string;
  uploadedAt?: string;
  uploadedBy?: string | null;
  uploadedByEmail?: string | null;
  totalStudents?: number | null;
  stats?: { avg: number | null; max: number | null; min: number | null };
  sourceFiles?: { part1?: string; part2?: string };
};

type ResultItem = {
  id: string;
  studentId: string;
  studentName: string;
  class: string;
  subject: string;
  date: string;
  score: number | null;
  raw?: object;
};

// --- ETag-тай кешлэх өгөгдлийн төрлүүд ---
type CachedQuizMeta = {
  etag: string;
  data: QuizMeta;
};

type CachedResultItems = {
  etag: string;
  data: ResultItem[];
  nextCursor: string | null;
};

// --- Кеш түлхүүрүүд ---
const metaCacheKey = (quizId: string) => `quiz_meta_etag_${quizId}_v1`;
const resultsCacheKey = (quizId: string) => `quiz_results_etag_${quizId}_v1`;

function safeJsonParse<T>(str: string | null): T | null {
  if (!str) return null;
  try {
    return JSON.parse(str) as T;
  } catch (e) {
    console.error("LocalStorage-с JSON уншихад алдаа гарлаа:", e);
    return null;
  }
}

export default function QuizDetailPage(props: { params: { id: string } | Promise<{ id: string }> }) {
  const { user } = useAuth();
  
  const [quizId, setQuizId] = useState<string>("");

  const [meta, setMeta] = useState<QuizMeta | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [errorMeta, setErrorMeta] = useState<string | null>(null);

  const [items, setItems] = useState<ResultItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [errItems, setErrItems] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);

  const [q, setQ] = useState("");

  const [sortConfig, setSortConfig] = useState<{
    key: keyof ResultItem | null;
    direction: "ascending" | "descending";
  }>({ key: null, direction: "ascending" });

  useEffect(() => {
    const resolveParams = async () => {
      const p = await props.params;
      if (p.id) {
        setQuizId(decodeURIComponent(p.id));
      }
    };
    resolveParams();
  }, [props.params]);

  // Theme-тэй холбоотой код
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

  async function fetchMetaWithETag() {
    if (!user || !quizId) return;
    setLoadingMeta(true);
    setErrorMeta(null);

    const cacheKey = metaCacheKey(quizId);
    try {
      const token = await user.getIdToken();
      const cached = safeJsonParse<CachedQuizMeta>(localStorage.getItem(cacheKey));

      const headers: HeadersInit = { Authorization: `Bearer ${token}` };
      if (cached?.etag) headers["If-None-Match"] = cached.etag;

      const res = await fetch(`/api/teacher/quizzes/${encodeURIComponent(quizId)}`, { headers });

      if (res.status === 304) {
        if (cached?.data) setMeta(cached.data);
        return;
      }

      // ← НЭМЭЛТ: 404 ирвэл кешээ цэвэрлээд мессеж үзүүлнэ
      if (res.status === 404) {
        localStorage.removeItem(cacheKey);
        setMeta(null);
        setErrorMeta("Энэ шалгалт устгагдсан эсвэл олдсонгүй.");
        return;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Серверийн хариуг уншиж чадсангүй" }));
        throw new Error(errData.detail || errData.error || "Метадата ачаалахад алдаа гарлаа");
      }

      const data: { ok: boolean; quiz: QuizMeta } = await res.json();
      const newETag = res.headers.get("etag");
      setMeta(data.quiz);

      if (newETag) {
        localStorage.setItem(cacheKey, JSON.stringify({ etag: newETag, data: data.quiz }));
      }
    } catch (e) {
      setErrorMeta(e instanceof Error ? e.message : "Тодорхойгүй алдаа");
    } finally {
      setLoadingMeta(false);
    }
  }

  async function loadResultsWithETag(nextCursor: string | null) {
    if (!user || !quizId) return;
    setLoadingItems(true);
    setErrItems(null);

    const cacheKey = resultsCacheKey(quizId);
    try {
      const token = await user.getIdToken();
      const cached = safeJsonParse<CachedResultItems>(localStorage.getItem(cacheKey));

      const url = new URL(`/api/teacher/quizzes/${encodeURIComponent(quizId)}/results`, window.location.origin);
      if (nextCursor) url.searchParams.set("cursor", nextCursor);
      url.searchParams.set("limit", "200");

      const headers: HeadersInit = { Authorization: `Bearer ${token}` };
      if (!nextCursor && cached?.etag) {
        headers["If-None-Match"] = cached.etag;
      }

      const res = await fetch(url.toString(), { headers });

      if (res.status === 304) {
        if (cached?.data) {
          setItems(cached.data);
          setCursor(cached.nextCursor);
          setHasMore(!!cached.nextCursor);
        }
        return;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Серверийн хариуг уншиж чадсангүй" }));
        throw new Error(errData.detail || errData.error || "Дүн ачаалахад алдаа гарлаа");
      }

      const data: { ok: true; items: ResultItem[]; nextCursor: string | null } = await res.json();
      const newETag = res.headers.get("etag");

      const currentItems = nextCursor ? items : [];
      const newItems = [...currentItems, ...data.items];
      setItems(newItems);
      setCursor(data.nextCursor);
      setHasMore(!!data.nextCursor);

      if (newETag) {
        localStorage.setItem(cacheKey, JSON.stringify({
          etag: newETag,
          data: newItems,
          nextCursor: data.nextCursor,
        }));
      }
    } catch (e) {
      setErrItems(e instanceof Error ? e.message : "Тодорхойгүй алдаа");
    } finally {
      setLoadingItems(false);
    }
  }

  useEffect(() => {
    // ← НЭМЭЛТ: user, quizId байж байж ажиллуулна
    if (!user || !quizId) return;

    // эхлээд энэ id-гийн кешийг түр харуулна
    const cachedMeta = safeJsonParse<CachedQuizMeta>(localStorage.getItem(metaCacheKey(quizId)));
    if (cachedMeta) {
      setMeta(cachedMeta.data);
    } else {
      setMeta(null); // хуучин шалгалт үлдэхээс сэргийлнэ
    }

    const cachedResults = safeJsonParse<CachedResultItems>(localStorage.getItem(resultsCacheKey(quizId)));
    if (cachedResults) {
      setItems(cachedResults.data);
      setCursor(cachedResults.nextCursor);
      setHasMore(!!cachedResults.nextCursor);
    } else {
      setItems([]);
      setCursor(null);
      setHasMore(true);
    }

    // дараа нь серверээс шинэчилж авна
    fetchMetaWithETag();
    loadResultsWithETag(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, quizId]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((r) =>
      `${r.studentName} ${r.class} ${r.studentId}`.toLowerCase().includes(s)
    );
  }, [items, q]);

  const sortedAndFilteredItems = useMemo(() => {
    const sortableItems = q.trim() ? filtered : items;
    if (sortConfig.key) {
      return [...sortableItems].sort((a, b) => {
        const aValue = a[sortConfig.key!];
        const bValue = b[sortConfig.key!];
        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;
        if (aValue < bValue) return sortConfig.direction === "ascending" ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === "ascending" ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [items, filtered, q, sortConfig]);

  const requestSort = (key: keyof ResultItem) => {
    let direction: "ascending" | "descending" = "ascending";
    if (sortConfig.key === key && sortConfig.direction === "ascending") {
      direction = "descending";
    }
    setSortConfig({ key, direction });
  };
  const getSortDirectionIcon = (name: keyof ResultItem) => {
    if (sortConfig.key !== name) return null;
    return sortConfig.direction === "ascending" ? " ▲" : " ▼";
  };
  const fmtDate = (iso?: string) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return isNaN(+d) ? "—" : d.toLocaleString();
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

      <header className="pt-4 text-center">
        <div className="inline-flex gap-2 p-2 rounded-xl" style={{ background: "var(--card)", border: "1px solid var(--stroke)" }}>
          <Link href="/teacher" className="px-4 py-2 rounded-md font-bold transition-colors hover:text-[var(--text)]" style={{ color: "var(--muted)" }}>Нүүр</Link>
          <Link href="/teacher/upload" className="px-4 py-2 rounded-md font-bold transition-colors hover:text-[var(--text)]" style={{ color: "var(--muted)" }}>Дүн оруулах</Link>
          <Link href="/teacher/files" className="px-4 py-2 rounded-md font-bold transition-colors hover:text-[var(--text)]" style={{ color: "var(--muted)" }}>Файл удирдлага</Link>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-4 py-5">
        <section className="rounded-2xl p-4 sm:p-5 mb-5" style={{ background: "var(--card)", border: "1px solid var(--stroke)" }}>
          {(loadingMeta && !meta) ? (
            <div className="animate-pulse h-24 rounded-lg" style={{ background: "var(--card2)" }} />
          ) : errorMeta ? (
            <div className="text-center text-sm" style={{ color: "#ff8b8b" }}>{errorMeta}</div>
          ) : meta ? (
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <h1 className="text-xl font-extrabold">{meta.title}</h1>
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  Хичээл: <b style={{ color: "var(--text)" }}>{meta.subject || "—"}</b>
                  {meta.class ? <> · Анги: <b style={{ color: "var(--text)" }}>{meta.class}</b></> : null}
                </p>
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  Үүсгэсэн: <b style={{ color: "var(--text)" }}>{meta.uploadedByEmail || "—"}</b> · {fmtDate(meta.uploadedAt)}
                </p>
                 {(meta.sourceFiles?.part1 || meta.sourceFiles?.part2) && (
                  <div className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                    Эх файл: <span style={{ color: "var(--text)" }}>
                      {[meta.sourceFiles?.part1, meta.sourceFiles?.part2].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </div>
                )}
              </div>
              <div className="sm:text-right">
                <p className="text-sm mb-1" style={{ color: "var(--muted)" }}>Нийт сурагч</p>
                <p className="text-2xl font-extrabold">{meta.totalStudents ?? 0}</p>
                <div className="mt-3 text-sm" style={{ color: "var(--muted)" }}>Дундаж · Их · Бага</div>
                <div className="text-lg font-bold">
                  {meta.stats?.avg?.toFixed(2) ?? "—"} / {meta.stats?.max ?? "—"} / {meta.stats?.min ?? "—"}
                </div>
              </div>
            </div>
          ) : null}
        </section>
        
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-3">
            <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Сурагчийн нэр, ангиар хайх…"
                className="w-full rounded-md px-3 py-2 text-sm"
                style={{ background: "var(--card2)", border: "1px solid var(--stroke)" }}
            />
            <Link
              href="/teacher/files"
              className="rounded-md px-3 py-2 text-sm font-bold whitespace-nowrap"
              style={{ background: "var(--card2)", border: "1px solid var(--stroke)", color: "var(--text)" }}
            >
              Буцах
            </Link>
        </div>

        <div className="overflow-auto border border-[var(--stroke)] rounded-xl">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b" style={{ background: "var(--card2)", borderColor: "var(--stroke)" }}>
                <th className="p-1 text-left"><button type="button" onClick={() => requestSort("studentName")} className="w-full px-3 py-2 font-bold text-left rounded-md transition-colors hover:bg-[var(--stroke)]">Нэр{getSortDirectionIcon("studentName")}</button></th>
                <th className="p-1 text-left"><button type="button" onClick={() => requestSort("class")} className="w-full px-3 py-2 font-bold text-left rounded-md transition-colors hover:bg-[var(--stroke)]">Анги{getSortDirectionIcon("class")}</button></th>
                <th className="p-1 text-left"><button type="button" onClick={() => requestSort("date")} className="w-full px-3 py-2 font-bold text-left rounded-md transition-colors hover:bg-[var(--stroke)]">Огноо{getSortDirectionIcon("date")}</button></th>
                <th className="p-1 text-right"><button type="button" onClick={() => requestSort("score")} className="w-full px-3 py-2 font-bold text-right rounded-md transition-colors hover:bg-[var(--stroke)]">Оноо{getSortDirectionIcon("score")}</button></th>
              </tr>
            </thead>
            <tbody>
              {(loadingItems && items.length === 0) ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i} className="border-b border-[var(--stroke)]"><td colSpan={4} className="p-2"><div className="h-5 animate-pulse bg-[var(--card2)] rounded-md" /></td></tr>
                ))
              ) : errItems ? (
                <tr><td className="p-4 text-center" style={{color: "#ff8b8b"}} colSpan={4}>{errItems}</td></tr>
              ) : sortedAndFilteredItems.length === 0 ? (
                <tr><td className="p-4 text-center" style={{color: "var(--muted)"}} colSpan={4}>Дүн олдсонгүй.</td></tr>
              ) : (
                sortedAndFilteredItems.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--stroke)]">
                    <td className="px-3 py-2 font-medium">{r.studentName}</td>
                    <td className="px-3 py-2">{r.class}</td>
                    <td className="px-3 py-2">{r.date || "—"}</td>
                    <td className="px-3 py-2 text-right font-semibold">{r.score ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-center mt-3">
          <div className="text-xs" style={{ color: "var(--muted)" }}>Нийт: {items.length}</div>
          <button
            onClick={() => loadResultsWithETag(cursor)}
            disabled={!hasMore || loadingItems}
            className="rounded-md px-4 py-2 text-sm font-bold disabled:opacity-50 transition-colors"
            style={{ background: "var(--primary-bg)", color: "var(--primary-text)" }}
          >
            {loadingItems ? "Ачаалж байна..." : "Цааш нь"}
          </button>
        </div>
      </main>
    </div>
  );
}