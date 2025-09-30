"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "@/components/auth-provider";
import { useStudentsStore } from "@/store/students-store";

type ApiPayload = {
  ok: boolean;
  studentId: string;
  subjects: string[];
  results: Record<
    string,
    { average: number; history: Array<{ date: string; total: number; part1?: number; part2?: number }> }
  >;
};

export default function StudentResultsTab() {
  const { user } = useAuth();

  // ✅ local(k) кэшээс сурагчдыг уншина
  const students = useStudentsStore((s) => s.students);

  // Анги/сурагчийн шүүлт
  const [classFilter, setClassFilter] = useState<string>("");
  const [studentId, setStudentId] = useState<string>("");

  // API data
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<ApiPayload | null>(null);

  // Ангиудын жагсаалт
  const classes = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => s.class && set.add(s.class));
    return Array.from(set).sort();
  }, [students]);

  // Ангигаар шүүсэн сурагчид
  const filteredStudents = useMemo(() => {
    const arr = classFilter ? students.filter((s) => (s.class || "") === classFilter) : students;
    // нэр/имэйл-ээр бага зэрэг эрэмбэлчихье
    return [...arr].sort((a, b) => {
      const A = `${a.lastName || ""} ${a.firstName || ""} ${a.email || ""}`.toLowerCase();
      const B = `${b.lastName || ""} ${b.firstName || ""} ${b.email || ""}`.toLowerCase();
      return A < B ? -1 : A > B ? 1 : 0;
    });
  }, [students, classFilter]);

  // Сонгогдсон анги өөрчлөгдөхөд сурагч сонголтыг reset
  useEffect(() => {
    setStudentId("");
    setData(null);
    setErr(null);
  }, [classFilter]);

  const loadResults = useCallback(async () => {
    if (!user || !studentId) return;
    setLoading(true);
    setErr(null);
    setData(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/students/${encodeURIComponent(studentId)}/results`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as ApiPayload & { error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Дүн татаж чадсангүй.");
      setData(json);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Тодорхойгүй алдаа.");
    } finally {
      setLoading(false);
    }
  }, [user, studentId]);

  // Сурагч сонгогдмогц автоматаар татах
  useEffect(() => {
    if (studentId) void loadResults();
  }, [studentId, loadResults]);

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === studentId) || null,
    [students, studentId]
  );

  return (
    <div className="card border border-stroke bg-card p-6 rounded-2xl">
      <h2 className="text-lg font-bold mb-4">Сурагчийн дүн (results_flat)</h2>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="w-full md:w-60 rounded-md px-3 py-2 text-sm"
          style={{ background: "var(--card2)", border: "1px solid var(--stroke)", color: "var(--text)" }}
          aria-label="Анги шүүх"
        >
          <option value="">Бүх анги</option>
          {classes.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          className="w-full md:w-80 rounded-md px-3 py-2 text-sm"
          style={{ background: "var(--card2)", border: "1px solid var(--stroke)", color: "var(--text)" }}
          aria-label="Сурагч сонгох"
        >
          <option value="">— Сурагч сонгох —</option>
          {filteredStudents.map((s) => {
            const label = `${s.lastName || ""} ${s.firstName || ""}`.trim() || s.email || s.id;
            return (
              <option key={s.id} value={s.id}>
                {label} {s.class ? `• ${s.class}` : ""} {s.email ? `• ${s.email}` : ""}
              </option>
            );
          })}
        </select>
      </div>

      {/* Summary of chosen student */}
      {selectedStudent && (
        <div className="mb-4 text-sm text-muted">
          Сонгогдсон: <span className="font-bold text-text">{`${selectedStudent.lastName || ""} ${selectedStudent.firstName || ""}`.trim() || selectedStudent.email}</span>
          {selectedStudent.class ? ` • Анги: ${selectedStudent.class}` : ""}
          {selectedStudent.externalId ? ` • ID: ${selectedStudent.externalId}` : ""}
        </div>
      )}

      {/* Content */}
      {!studentId ? (
        <div className="text-muted">Дээрээс анги, дараа нь сурагч сонгоно уу.</div>
      ) : loading ? (
        <div className="text-muted">Ачаалж байна…</div>
      ) : err ? (
        <div className="text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">{err}</div>
      ) : data && data.subjects.length === 0 ? (
        <div className="text-muted">Дүн олдсонгүй.</div>
      ) : data ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {data.subjects.map((subj) => {
            const bucket = data.results[subj];
            return (
              <div key={subj} className="border border-stroke rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-card2 border-b border-stroke flex items-center justify-between">
                  <div className="font-bold">{subj}</div>
                  <div className="text-sm text-muted">Дундаж: <span className="font-bold text-text">{bucket?.average ?? 0}</span></div>
                </div>
                <div className="p-3 overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left border-b border-stroke">
                        <th className="px-2 py-2">Огноо</th>
                        <th className="px-2 py-2">Нийт (%)</th>
                        <th className="px-2 py-2">Part 1</th>
                        <th className="px-2 py-2">Part 2</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bucket?.history?.map((h, i) => (
                        <tr key={i} className="border-b border-stroke">
                          <td className="px-2 py-2 whitespace-nowrap">{h.date || "-"}</td>
                          <td className="px-2 py-2">{h.total ?? "-"}</td>
                          <td className="px-2 py-2">{h.part1 ?? "-"}</td>
                          <td className="px-2 py-2">{h.part2 ?? "-"}</td>
                        </tr>
                      ))}
                      {!bucket?.history?.length && (
                        <tr>
                          <td className="px-2 py-3 text-muted" colSpan={4}>Түүх алга</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}