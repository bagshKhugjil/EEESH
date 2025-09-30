"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Loader2, BookOpen, Library } from "lucide-react";

type Quiz = {
  id: string;
  subject: string;
  date: string; // "YYYY-MM-DD"
  quizName: string; // title
  class?: string; // "12"
  totalStudents?: number;
  stats?: { avg?: number; max?: number; min?: number };
};

export const SUBJECTS_10 = [
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

export default function QuizzesManager() {
  const { user } = useAuth();
  const [activeSubject, setActiveSubject] =
    useState<typeof SUBJECTS_10[number]>("МАТЕМАТИК");
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Хичээл тус бүрийн шалгалтын тоог хадгалах state
  const [subjectCounts, setSubjectCounts] = useState<Record<string, number>>({});
  const [countsLoading, setCountsLoading] = useState(true);

  // Хичээл тус бүрийн нийт шалгалтын тоог татах болон localStorage-д хадгалах хэсэг
  useEffect(() => {
    const fetchSubjectCounts = async () => {
      if (!user) return;

      // 1. localStorage-аас кэшлэгдсэн датаг уншиж, шууд харуулах
      try {
        const cachedCounts = localStorage.getItem("subjectQuizCounts");
        if (cachedCounts) {
          setSubjectCounts(JSON.parse(cachedCounts));
        }
      } catch (e) {
        console.error("Failed to read counts from localStorage", e);
      } finally {
        setCountsLoading(false); // Кэш байсан ч, байгаагүй ч loading-г зогсооно
      }

      // 2. API-аас шинэ датаг татаж, state болон localStorage-г шинэчлэх
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/admin/quizzes/counts", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data: { counts?: Record<string, number> } = await res.json();
        if (res.ok && data.counts) {
          setSubjectCounts(data.counts);
          localStorage.setItem("subjectQuizCounts", JSON.stringify(data.counts));
        }
      } catch (e) {
        console.error("Failed to fetch subject counts", e);
        // Энд алдаа гарвал хэрэглэгчид мэдэгдэхгүй, зөвхөн консол дээр харуулна
      }
    };

    void fetchSubjectCounts();
  }, [user]);


  const fetchQuizzes = async (subject: string) => {
    if (!user) return;
    try {
      setLoading(true);
      setErr(null);
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/quizzes?subject=${encodeURIComponent(subject)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Шалгалтуудыг татаж чадсангүй.");
      setQuizzes((data.quizzes || []) as Quiz[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Тодорхойгүй алдаа.");
      setQuizzes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchQuizzes(activeSubject);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeSubject]);

  const rows = useMemo(
    () =>
      quizzes.map((q) => ({
        id: q.id,
        date: q.date,
        title: q.quizName,
        class: q.class ?? "",
        avg: q.stats?.avg ?? "-",
        max: q.stats?.max ?? "-",
        min: q.stats?.min ?? "-",
        total: q.totalStudents ?? "-",
      })),
    [quizzes]
  );

  return (
    <div className="space-y-6">
      {/* Subject selector */}
      <div>
        <h3 className="text-xl font-extrabold mb-4">Хичээлээ сонго</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-4">
          {SUBJECTS_10.map((s) => {
            const isActive = activeSubject === s;
            const count = subjectCounts[s];
            return (
              <button
                key={s}
                onClick={() => setActiveSubject(s)}
                className={`rounded-xl px-4 py-4 text-center transition-colors border flex flex-col items-center justify-center gap-2 ${
                  isActive
                    ? "bg-primary-bg/15 border-primary-bg/40 text-primary-bg ring-2 ring-primary-bg/40"
                    : "bg-card2 border-stroke hover:bg-card hover:border-muted-stroke"
                }`}
                style={{ minHeight: '110px' }}
              >
                <div className="font-extrabold text-lg">{s}</div>
                <div className="text-sm font-medium flex items-center gap-1.5" style={{ color: isActive ? 'var(--primary-bg)' : 'var(--muted)' }}>
                  {countsLoading && !count ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Library className="w-4 h-4" />
                      <span>{count ?? 0} шалгалт</span>
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="border border-stroke rounded-xl overflow-hidden">
        <div className="bg-primary-bg/10 px-4 py-3 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary-bg" />
          <div className="font-bold">{activeSubject} — шалгалтын жагсаалт</div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted">
            <Loader2 className="animate-spin mr-2" /> Уншиж байна…
          </div>
        ) : err ? (
          <div className="text-red-500 px-4 py-6">{err}</div>
        ) : rows.length === 0 ? (
          <div className="text-muted px-4 py-6">Мэдээлэл алга.</div>
        ) : (
          <table className="min-w-full text-sm">
            {/* ... table-ийн бусад хэсэг өөрчлөгдөөгүй ... */}
            <thead className="bg-card2 border-b border-stroke">
              <tr>
                <th className="px-3 py-2 text-left">Огноо</th>
                <th className="px-3 py-2 text-left">Шалгалт</th>
                <th className="px-3 py-2 text-left">Анги</th>
                <th className="px-3 py-2 text-left">Дундаж</th>
                <th className="px-3 py-2 text-left">Их</th>
                <th className="px-3 py-2 text-left">Бага</th>
                <th className="px-3 py-2 text-left">Нийт</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-stroke">
                  <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                  <td className="px-3 py-2">{r.title}</td>
                  <td className="px-3 py-2">{r.class}</td>
                  <td className="px-3 py-2">{r.avg}</td>
                  <td className="px-3 py-2">{r.max}</td>
                  <td className="px-3 py-2">{r.min}</td>
                  <td className="px-3 py-2">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}