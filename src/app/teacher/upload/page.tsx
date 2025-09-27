// src/app/teacher/upload/page.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { useAuth } from "@/components/auth-provider";

type PartKey = "part1" | "part2";
type ModalType = "success" | "error" | "warning" | "info";

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

type RawRow = {
  "Quiz Name"?: string;
  Class?: string;
  "ZipGrade ID"?: string | number;
  "External Id"?: string | number;
  "First Name"?: string;
  "Last Name"?: string;
  "Num Questions"?: string | number;
  "Num Correct"?: string | number;
  "Percent Correct"?: string | number;
};

type ParsedRow = {
  externalId: string;
  className: string;
  firstName: string;
  lastName: string;
  numQuestions: number | null;
  numCorrect: number | null;
  percentCorrect: number | null;
};

type MergedRow = {
  externalId: string;
  className: string;
  firstName: string;
  lastName: string;
  part1?: Omit<ParsedRow, "externalId" | "className" | "firstName" | "lastName">;
  part2?: Omit<ParsedRow, "externalId" | "className" | "firstName" | "lastName">;
};

type UploadPayload = {
  subject: Subject | string;
  quizName: string;
  uploadedAt: string; // ISO
  rows: MergedRow[];
  sourceFiles: {
    part1?: string;
    part2?: string;
  };
};

export default function TeacherUploadPage() {
  const { user } = useAuth();

  // THEME
  const [mounted, setMounted] = useState(false);
  const [lightMode, setLightMode] = useState(false);
  useEffect(() => {
    setMounted(true);
    const html = document.documentElement;
    const prefersLight = localStorage.getItem("theme") === "light";
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

  // SUBJECT / FILES
  const [subject, setSubject] = useState<string>("");
  const [filePart1, setFilePart1] = useState<File | null>(null);
  const [filePart2, setFilePart2] = useState<File | null>(null);
  const fileInput1Ref = useRef<HTMLInputElement>(null);
  const fileInput2Ref = useRef<HTMLInputElement>(null);

  // STATUS + MODAL
  const [status, setStatus] = useState<string>("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");
  const [modalType, setModalType] = useState<ModalType>("info");

  const openModal = (title: string, message: string, type: ModalType = "info") => {
    setModalTitle(title);
    setModalMessage(message);
    setModalType(type);
    setModalOpen(true);
  };
  const closeModal = () => setModalOpen(false);

  // HELPERS
  const allowedExt = ["xlsx", "csv"];
  const acceptAttr =
    ".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv";

  const pickFile = (which: PartKey) => {
    (which === "part1" ? fileInput1Ref : fileInput2Ref).current?.click();
  };

  const handleFileChoose = (which: PartKey, file?: File | null) => {
    if (!file) {
      if (which === "part1") setFilePart1(null);
      else setFilePart2(null);
      return;
    }
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!allowedExt.includes(ext)) {
      openModal("Буруу файл", "Зөвхөн .xlsx эсвэл .csv өргөтгөлтэй файл сонгоно уу.", "warning");
      if (which === "part1") {
        setFilePart1(null);
        if (fileInput1Ref.current) fileInput1Ref.current.value = "";
      } else {
        setFilePart2(null);
        if (fileInput2Ref.current) fileInput2Ref.current.value = "";
      }
      return;
    }
    if (which === "part1") setFilePart1(file);
    else setFilePart2(file);
  };

  const onDrop = useCallback((which: PartKey, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0] ?? null;
    handleFileChoose(which, f);
  }, []);

  // ==== Excel/CSV ====
  async function readTable(file: File): Promise<ParsedRow[]> {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "" });

    const parsed: ParsedRow[] = rows.map((r) => {
      const ext = String(r["External Id"] ?? "").trim();
      const cls = String(r["Class"] ?? "").trim();
      const fn = String(r["First Name"] ?? "").trim();
      const ln = String(r["Last Name"] ?? "").trim();

      const nqRaw = r["Num Questions"];
      const ncRaw = r["Num Correct"];
      const pcRaw = r["Percent Correct"];

      const nqNum = nqRaw === "" || nqRaw === undefined ? null : Number(nqRaw);
      const ncNum = ncRaw === "" || ncRaw === undefined ? null : Number(ncRaw);
      const pcNum =
        pcRaw === "" || pcRaw === undefined ? null : Number(String(pcRaw).replace("%", ""));

      return {
        externalId: ext,
        className: cls,
        firstName: fn,
        lastName: ln,
        numQuestions: Number.isFinite(nqNum as number) ? (nqNum as number) : null,
        numCorrect: Number.isFinite(ncNum as number) ? (ncNum as number) : null,
        percentCorrect: Number.isFinite(pcNum as number) ? (pcNum as number) : null,
      };
    });

    return parsed.filter((r) => r.externalId !== "");
  }

  function mergeParts(p1?: ParsedRow[], p2?: ParsedRow[]): MergedRow[] {
    const map = new Map<string, MergedRow>();
    const attach = (rows: ParsedRow[], which: "part1" | "part2") => {
      rows.forEach((r) => {
        const key = r.externalId;
        const base =
          map.get(key) ||
          {
            externalId: r.externalId,
            className: r.className,
            firstName: r.firstName,
            lastName: r.lastName,
          };
        const payload = {
          numQuestions: r.numQuestions,
          numCorrect: r.numCorrect,
          percentCorrect: r.percentCorrect,
        };
        if (which === "part1") (base as MergedRow).part1 = payload;
        else (base as MergedRow).part2 = payload;
        map.set(key, base as MergedRow);
      });
    };

    if (p1 && p1.length) attach(p1, "part1");
    if (p2 && p2.length) attach(p2, "part2");
    return Array.from(map.values());
  }

  function makeQuizName(subjectName: string, file1?: File | null, file2?: File | null): string {
    const date = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const ts = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
      date.getHours()
    )}:${pad(date.getMinutes())}`;
    const names = [file1?.name, file2?.name].filter(Boolean).join(" & ");
    return `${subjectName} — ${names || "quiz"} — ${ts}`;
  }

  // ==== UPLOAD ====
  const doUpload = async () => {
    if (!subject) return openModal("Анхааруулга", "Хичээлээ сонгоно уу!", "warning");
    if (!filePart1) return openModal("Анхааруулга", "1-р хэсгийн файлаа сонгоно уу!", "warning");
    if (!user) return openModal("Анхааруулга", "Нэвтэрсэн байх шаардлагатай.", "warning");

    setStatus("Файл(ууд) уншиж байна…");
    try {
      const p1 = await readTable(filePart1);
      const p2 = filePart2 ? await readTable(filePart2) : undefined;

      const rows = mergeParts(p1, p2);
      if (rows.length === 0) {
        setStatus("");
        return openModal("Хоосон", "Хүчингүй эсвэл хоосон файл байна.", "warning");
      }

      const payload: UploadPayload = {
        subject,
        quizName: makeQuizName(subject, filePart1, filePart2),
        uploadedAt: new Date().toISOString(),
        rows,
        sourceFiles: { part1: filePart1?.name, part2: filePart2?.name },
      };

      setStatus("Сервер рүү илгээж байна…");
      const token = await user.getIdToken();
      const res = await fetch("/api/teacher/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      type ApiResp =
        | { ok: true; quizId: string; inserted: number; updated: number }
        | { ok: false; error: string };

      const data: ApiResp = await res.json();
      if (!res.ok || !("ok" in data) || data.ok !== true) {
        const msg = "error" in data ? data.error : "Серверийн алдаа.";
        throw new Error(msg);
      }

      openModal(
        "Амжилттай",
        `“${payload.quizName}” илгээгдлээ. Нийт ${data.inserted + data.updated} мөр.`,
        "success"
      );

      // reset
      setSubject("");
      setFilePart1(null);
      setFilePart2(null);
      if (fileInput1Ref.current) fileInput1Ref.current.value = "";
      if (fileInput2Ref.current) fileInput2Ref.current.value = "";
      setStatus("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Тодорхойгүй алдаа гарлаа.";
      setStatus("");
      openModal("Системийн алдаа", msg, "error");
    }
  };

  // modal өнгө (warning өнгөний жижиг тэмдэгтийн алдаа зассан)
  const isLight = mounted && document.documentElement.classList.contains("light");
  const modalTitleColor =
    modalType === "success" ? (isLight ? "#10b981" : "#9af5e3")
    : modalType === "error" ? (isLight ? "#ef4444" : "#ff8b8b")
    : modalType === "warning" ? (isLight ? "#f59e0b" : "#ffc97a")
    : "var(--text)";

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

      {/* Inline nav */}
      <div className="header text-center pt-4 px-4 sm:px-0">
        <div
          className="inline-flex flex-wrap gap-2 p-2 rounded-xl"
          style={{ background: "var(--card)", border: "1px solid var(--stroke)" }}
        >
          <Link href="/teacher" className="px-3 sm:px-4 py-2 rounded-md font-bold" style={{ color: "var(--muted)" }}>
            Нүүр
          </Link>
          <Link href="/teacher/upload" className="px-3 sm:px-4 py-2 rounded-md font-bold" style={{ background: "var(--card2)", color: "var(--text)" }}>
            Дүн оруулах
          </Link>
          <Link href="/teacher/results" className="px-3 sm:px-4 py-2 rounded-md font-bold" style={{ color: "var(--muted)" }}>
            Дүн харах
          </Link>
          <Link href="/teacher/files" className="px-3 sm:px-4 py-2 rounded-md font-bold" style={{ color: "var(--muted)" }}>
            Файл удирдлага
          </Link>
        </div>
      </div>

      <div className="wrap max-w-[1000px] mx-auto px-4 my-6 sm:my-8">
        <div className="card rounded-2xl p-4 sm:p-6" style={{ background: "var(--card)", border: "1px solid var(--stroke)" }}>
          <label className="block mb-3 font-bold">Хичээлээ сонго</label>

          {/* SUBJECT GRID: auto-fit responsive */}
          <div
            className="grid gap-2 sm:gap-3 mb-4"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}
          >
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
                    transition: "background-color .2s, border-color .2s",
                  }}
                >
                  {s}
                </button>
              );
            })}
          </div>

          {/* Upload areas */}
          <div className="grid gap-4 sm:gap-5 sm:grid-cols-2">
            {/* Part 1 */}
            <div
              className="rounded-2xl p-4 sm:p-5 text-center cursor-pointer min-h-[150px] grid place-items-center border-2 border-dashed"
              style={{
                borderColor: filePart1 ? "#9af5e3" : "var(--stroke)",
                background: filePart1 ? "rgba(154, 245, 227, .08)" : "transparent",
              }}
              onClick={() => pickFile("part1")}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop("part1", e)}
            >
              <div>
                <div className="font-extrabold mb-1">Шалгалтын 1-р хэсэг</div>
                <div className="text-sm" style={{ color: "var(--muted)" }}>
                  Excel/CSV — чирж оруулах эсвэл дарж сонгох
                </div>
                {filePart1 && (
                  <div className="mt-3 text-sm break-words">
                    <b>Сонгогдсон:</b> {filePart1.name}
                  </div>
                )}
              </div>
              <input
                ref={fileInput1Ref}
                type="file"
                accept={acceptAttr}
                hidden
                onChange={(e) => handleFileChoose("part1", e.target.files?.[0] ?? null)}
              />
            </div>

            {/* Part 2 */}
            <div
              className="rounded-2xl p-4 sm:p-5 text-center cursor-pointer min-h-[150px] grid place-items-center border-2 border-dashed"
              style={{
                borderColor: filePart2 ? "#9af5e3" : "var(--stroke)",
                background: filePart2 ? "rgba(154, 245, 227, .08)" : "transparent",
              }}
              onClick={() => pickFile("part2")}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop("part2", e)}
            >
              <div>
                <div className="font-extrabold mb-1">Шалгалтын 2-р хэсэг</div>
                <div className="text-sm" style={{ color: "var(--muted)" }}>
                  Excel/CSV — чирж оруулах эсвэл дарж сонгох
                </div>
                {filePart2 && (
                  <div className="mt-3 text-sm break-words">
                    <b>Сонгогдсон:</b> {filePart2.name}
                  </div>
                )}
              </div>
              <input
                ref={fileInput2Ref}
                type="file"
                accept={acceptAttr}
                hidden
                onChange={(e) => handleFileChoose("part2", e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          {!!status && (
            <div id="status" className="mt-3 text-sm" style={{ color: "orange" }}>
              {status}
            </div>
          )}

          {/* Footer actions (wrap on mobile) */}
          <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3">
            <a
              className="rounded-xl font-bold px-4 py-2 text-center"
              href="https://docs.google.com/spreadsheets/d/19jHswtR9uxTRexVvCxPIPEzuQSSjs-9O7_32IXGEF4g/export?format=xlsx"
              target="_blank"
              rel="noopener"
              style={{ background: "var(--card2)", border: "1px solid var(--stroke)", textDecoration: "none", color: "var(--text)" }}
            >
              Дүнгийн жишээ файл татах
            </a>
            <Link
              href="/teacher"
              className="rounded-xl font-bold px-4 py-2 text-center"
              style={{ background: "var(--card2)", border: "1px solid var(--stroke)", color: "var(--text)" }}
            >
              Буцах
            </Link>
            <button
              className="rounded-xl font-bold px-4 py-2 text-center"
              style={{ background: "var(--primary-bg)", color: "var(--primary-text)", border: "1px solid transparent" }}
              onClick={doUpload}
            >
              Upload
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
                {modalType === "success" ? "✅" : modalType === "error" ? "⚠️" : modalType === "warning" ? "🔔" : "ℹ️"}
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