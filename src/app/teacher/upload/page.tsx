// src/app/teacher/upload/page.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type PartKey = "part1" | "part2";

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
];

type ModalType = "success" | "error" | "warning" | "info";

export default function TeacherUploadPage() {
  // --- THEME: hydration-safe ---
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

  // --- SUBJECT / FILES ---
  const [subject, setSubject] = useState<string>("");
  const [filePart1, setFilePart1] = useState<File | null>(null);
  const [filePart2, setFilePart2] = useState<File | null>(null);
  const fileInput1Ref = useRef<HTMLInputElement>(null);
  const fileInput2Ref = useRef<HTMLInputElement>(null);

  // --- STATUS + MODAL ---
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

  // --- HELPERS ---
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

  const readAsDataURL = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    });

  const doUpload = async () => {
    if (!subject) return openModal("Анхааруулга", "Хичээлээ сонгоно уу!", "warning");
    if (!filePart1) return openModal("Анхааруулга", "Шалгалтын 1-р хэсгийн файлаа сонгоно уу!", "warning");

    setStatus("Хуулж байна…");
    try {
      const payload = {
        subject,
        part1: filePart1 ? { name: filePart1.name, dataURL: await readAsDataURL(filePart1) } : undefined,
        part2: filePart2 ? { name: filePart2.name, dataURL: await readAsDataURL(filePart2) } : undefined,
      };

      // TODO: энд API холбоно (хүсвэл бичээд өгье)
      // await fetch("/api/teacher/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

      openModal(
        "Амжилттай",
        `“${subject}” хичээлийн${filePart2 ? " 1 ба 2-р хэсгийн" : " 1-р хэсгийн"} файл хүлээн авлаа.`,
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

  // modal өнгө: mounted болмогц шалгана
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
          {/* Hydration-safe: mounted болмогц icon-оо үзүүлнэ */}
          {!mounted ? null : lightMode ? (
            // moon
            <svg className="m-auto" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
          ) : (
            // sun
            <svg className="m-auto" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
          )}
        </button>
      </div>

      {/* Inline nav (энэнд глобал Header-н оронд энэ хуудасны навигци) */}
      <div className="header text-center pt-4">
        <div
          className="inline-flex gap-2 p-2 rounded-xl"
          style={{ background: "var(--card)", border: "1px solid var(--stroke)" }}
        >
          <Link href="/teacher" className="px-4 py-2 rounded-md font-bold transition-colors" style={{ color: "var(--muted)" }}>
            Нүүр
          </Link>
          <Link href="/teacher/upload" className="px-4 py-2 rounded-md font-bold" style={{ background: "var(--card2)", color: "var(--text)" }}>
            Дүн оруулах
          </Link>
          <Link href="/teacher/results" className="px-4 py-2 rounded-md font-bold transition-colors" style={{ color: "var(--muted)" }}>
            Дүн харах
          </Link>
          <Link href="/teacher/files" className="px-4 py-2 rounded-md font-bold transition-colors" style={{ color: "var(--muted)" }}>
            Файл удирдлага
          </Link>
        </div>
      </div>

      <div className="wrap max-w-[1000px] mx-auto px-4 my-8">
        <div
          className="card rounded-2xl p-4 md:p-6"
          style={{ background: "var(--card)", border: "1px solid var(--stroke)" }}
        >
          <label className="block mb-3">Хичээлээ сонго</label>
          <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
            {SUBJECTS.map((s) => {
              const selected = subject === s;
              return (
                <button
                  key={s}
                  onClick={() => setSubject(s)}
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

          {/* Upload areas */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Part 1 */}
            <div
              className="dropzone rounded-2xl p-5 text-center cursor-pointer min-h-[160px] grid place-items-center border-2 border-dashed"
              style={{
                borderColor: filePart1 ? "#9af5e3" : "#9fbfff33",
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
                  <div className="mt-3 text-sm">
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
              className="dropzone rounded-2xl p-5 text-center cursor-pointer min-h-[160px] grid place-items-center border-2 border-dashed"
              style={{
                borderColor: filePart2 ? "#9af5e3" : "#9fbfff33",
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
                  <div className="mt-3 text-sm">
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

          {/* status */}
          {!!status && (
            <div id="status" className="mt-3 text-sm" style={{ color: "orange" }}>
              {status}
            </div>
          )}

          {/* footer buttons */}
          <div className="footer mt-4 flex items-center justify-end gap-3">
            <a
              className="btn sample rounded-xl font-bold px-4 py-2"
              href="https://docs.google.com/spreadsheets/d/19jHswtR9uxTRexVvCxPIPEzuQSSjs-9O7_32IXGEF4g/export?format=xlsx"
              target="_blank"
              rel="noopener"
              style={{ background: "var(--card2)", border: "1px solid var(--stroke)", textDecoration: "none", color: "var(--text)" }}
            >
              Дүнгийн жишээ файл татах
            </a>
            <Link
              href="/teacher"
              className="btn rounded-xl font-bold px-4 py-2"
              style={{ background: "var(--card2)", border: "1px solid var(--stroke)", color: "var(--text)" }}
            >
              Буцах
            </Link>
            <button
              className="btn primary rounded-xl font-bold px-4 py-2"
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
            className="rounded-2xl p-6 w-[90%] max-w-[420px] text-center animate-[fadeIn_.3s_ease]"
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
            <p className="mb-6" style={{ color: "var(--muted)", lineHeight: 1.5 }}>
              {modalMessage}
            </p>
            <button
              className="btn rounded-xl font-bold px-4 py-2 w-full"
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