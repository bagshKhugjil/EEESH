// src/app/admin/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import * as XLSX from "xlsx";
import Image from "next/image";
import Link from "next/link";
import { withRole } from "@/components/withRole";
import { useAuth } from "@/components/auth-provider";
import { Users, Loader2, CheckCircle, AlertCircle, ShieldQuestion, Upload } from "lucide-react";

/* ============================= Shared Types ============================= */

interface UserRecord {
  uid: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  role: string | null;
}

interface ModalState {
  isOpen: boolean;
  userToUpdate: UserRecord | null;
  newRole: string | null;
}

type FieldKey =
  | "firstName"
  | "lastName"
  | "email"
  | "grade"
  | "class"
  | "parentEmail1"
  | "parentEmail2"
  | "externalId";

const REQUIRED_FIELDS: FieldKey[] = ["firstName", "lastName", "email"];

type StudentMappedRow = {
  firstName: string;
  lastName: string;
  email: string;
  grade?: string;
  class?: string;
  parentEmail1?: string;
  parentEmail2?: string;
  externalId?: string;
};

type Student = {
  id: string;
  firstName?: string;
  lastName?: string;
  email: string;
  grade?: string;
  class?: string;
  parentEmail1?: string;
  parentEmail2?: string;
  externalId?: string;
  role?: string;
};

/* ============================== Small UI ============================== */

const getRoleBadgeClasses = (role: string | null): string => {
  const baseClasses = "px-2.5 py-0.5 text-xs font-semibold rounded-full border";
  switch (role) {
    case "admin":
      return `${baseClasses} bg-red-500/10 text-red-400 border-red-500/20`;
    case "teacher":
      return `${baseClasses} bg-blue-500/10 text-blue-400 border-blue-500/20`;
    case "student":
      return `${baseClasses} bg-green-500/10 text-green-400 border-green-500/20`;
    case "parent":
      return `${baseClasses} bg-yellow-500/10 text-yellow-400 border-yellow-500/20`;
    default:
      return `${baseClasses} bg-card2 text-muted border-stroke`;
  }
};

const SkeletonLoader = () => (
  <>
    {[...Array(3)].map((_, i) => (
      <div key={i} className="flex items-center justify-between p-4 border-b border-stroke animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-card2" />
          <div className="space-y-2">
            <div className="h-4 w-24 rounded bg-card2" />
            <div className="h-3 w-32 rounded bg-card2" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-16 rounded-md bg-card2" />
          <div className="h-8 w-16 rounded-md bg-card2" />
          <div className="h-8 w-16 rounded-md bg-card2" />
        </div>
      </div>
    ))}
  </>
);

const ConfirmationModal = ({
  modalState,
  onCancel,
  onConfirm,
  isChangingRole,
}: {
  modalState: ModalState;
  onCancel: () => void;
  onConfirm: () => void;
  isChangingRole: boolean;
}) => {
  if (!modalState.isOpen || !modalState.userToUpdate) return null;
  return (
    <div className="fixed inset-0 bg-bg/80 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in-up">
      <div className="bg-card border border-stroke rounded-2xl p-6 max-w-sm w-full m-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-yellow-500/10 p-2 rounded-lg border border-yellow-500/20">
            <ShieldQuestion className="w-6 h-6 text-yellow-400" />
          </div>
          <h2 className="text-lg font-bold">Үйлдлийг баталгаажуулна уу</h2>
        </div>
        <p className="text-sm text-muted mb-6">
          Та{" "}
          <span className="font-bold text-text">{modalState.userToUpdate.displayName || modalState.userToUpdate.email}</span>{" "}
          хэрэглэгчийн эрхийг
          <span className="font-bold text-primary-bg"> &quot;{modalState.newRole}&quot;</span> болгохдоо итгэлтэй байна уу?
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="bg-card2 border-stroke text-text px-4 py-2 text-sm font-bold rounded-lg hover:bg-card2/80">
            Цуцлах
          </button>
          <button
            onClick={onConfirm}
            disabled={isChangingRole}
            className="bg-primary-bg text-primary-text px-4 py-2 text-sm font-bold rounded-lg disabled:opacity-50 flex items-center"
          >
            {isChangingRole ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
            {isChangingRole ? "Өөрчилж байна..." : "Тийм, өөрчлөх"}
          </button>
        </div>
      </div>
    </div>
  );
};

function MappingSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="block mb-3">
      <span className="block mb-1 text-sm text-muted">{label}</span>
      <select className="w-full bg-card2 border border-stroke rounded-md px-3 py-2" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">-- Сонгох --</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

/* ======================== 1) Users Management ======================== */

function UsersManagement() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [toast, setToast] = useState<{ show: boolean; message: string; type: "success" | "error" }>({ show: false, message: "", type: "success" });

  const [modalState, setModalState] = useState<ModalState>({ isOpen: false, userToUpdate: null, newRole: null });
  const [isChangingRole, setIsChangingRole] = useState<boolean>(false);

  const showToast = (message: string, type: "success" | "error"): void => {
    setToast({ show: true, message, type });
    window.setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };

  const fetchUsers = useCallback(async (): Promise<void> => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();

      // —— Аюулгүй задлалт: массив эсвэл { users: [...] } хэлбэртэйг дэмжинэ
      let list: UserRecord[] = [];
      if (Array.isArray(data)) {
        list = data as UserRecord[];
      } else if (data && Array.isArray(data.users)) {
        list = data.users as UserRecord[];
      } else if (data?.error) {
        throw new Error(data.error || "Хэрэглэгчдийн мэдээллийг татахад алдаа гарлаа.");
      }
      setUsers(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Тодорхойгүй алдаа гарлаа.");
      setUsers([]); // хамгаалалт
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const handleRoleChange = (targetUser: UserRecord, newRole: string) => {
    if (!user || targetUser.role === newRole) return;
    setModalState({ isOpen: true, userToUpdate: targetUser, newRole });
  };

  const executeRoleChange = async (): Promise<void> => {
    if (!user || !modalState.userToUpdate || !modalState.newRole) return;

    setIsChangingRole(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/admin/users/${modalState.userToUpdate.uid}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ role: modalState.newRole }),
      });
      const result = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Роль өөрчлөхөд алдаа гарлаа.");

      showToast(result.message || "Амжилттай", "success");
      await fetchUsers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Тодорхойгүй алдаа гарлаа.", "error");
    } finally {
      setIsChangingRole(false);
      setModalState({ isOpen: false, userToUpdate: null, newRole: null });
    }
  };

  const ROLES = ["student", "parent", "teacher", "admin"];
  const safeUsers: UserRecord[] = Array.isArray(users) ? users : [];

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-primary-bg/10 p-2 rounded-lg border border-primary-bg/20">
          <Users className="w-6 h-6 text-primary-bg" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Хэрэглэгчийн удирдлага</h1>
          <p className="text-sm text-muted">Firebase Auth дахь хэрэглэгчдийн роль солих.</p>
        </div>
      </div>

      <div className="min-w-full">
        {loading ? (
          <SkeletonLoader />
        ) : error ? (
          <div className="text-center py-10 text-red-400 bg-red-500/10 rounded-lg">
            <AlertCircle className="mx-auto h-8 w-8 mb-2" />
            <p className="font-bold">Алдаа гарлаа</p>
            <p className="text-sm">{error}</p>
          </div>
        ) : safeUsers.length === 0 ? (
          <div className="text-center py-8 text-muted">Хэрэглэгч олдсонгүй.</div>
        ) : (
          safeUsers.map((u) => (
            <div key={u.uid} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border-b border-stroke last:border-0">
              <div className="flex items-center gap-4">
                <Image
                  src={u.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.displayName || u.email || "U")}&background=random`}
                  alt={u.displayName || "Хэрэглэгчийн зураг"}
                  width={40}
                  height={40}
                  className="w-10 h-10 rounded-full"
                />
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-bold text-text">{u.displayName || "Нэргүй"}</p>
                    <span className={getRoleBadgeClasses(u.role)}>{u.role ? u.role.charAt(0).toUpperCase() + u.role.slice(1) : "Тодорхойгүй"}</span>
                  </div>
                  <p className="text-xs text-muted">{u.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {ROLES.map((role) => (
                  <button
                    key={role}
                    onClick={() => handleRoleChange(u, role)}
                    disabled={u.role === role}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all duration-200 border ${
                      u.role === role
                        ? "bg-primary-bg text-primary-text border-transparent cursor-default"
                        : "bg-card2 border-stroke text-muted hover:bg-primary-bg/10 hover:border-primary-bg/20 hover:text-text disabled:opacity-100"
                    }`}
                  >
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 text-sm text-muted">
        <Link href="/admin">Админ самбар</Link>
      </div>

      <ConfirmationModal
        modalState={modalState}
        onCancel={() => setModalState({ isOpen: false, userToUpdate: null, newRole: null })}
        onConfirm={executeRoleChange}
        isChangingRole={isChangingRole}
      />

      {toast.show && (
        <div
          className={`fixed bottom-5 right-5 flex items-center gap-3 p-4 rounded-lg border text-sm font-bold animate-fade-in-up ${
            toast.type === "success" ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-red-500/10 border-red-500/20 text-red-400"
          }`}
        >
          {toast.type === "success" ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          {toast.message}
        </div>
      )}
    </>
  );
}

/* ==================== 2) Student Import w/ Mapping ==================== */

function StudentImportWithMapping() {
  const { user } = useAuth();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<File | null>(null);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [results, setResults] = useState<{ email: string; status: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const [mapping, setMapping] = useState<Record<FieldKey, string | "">>({
    firstName: "",
    lastName: "",
    email: "",
    grade: "",
    class: "",
    parentEmail1: "",
    parentEmail2: "",
    externalId: "",
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRows = useMemo(() => rawRows.slice(0, 12), [rawRows]);
  const mappingValid = useMemo(() => REQUIRED_FIELDS.every((k) => !!mapping[k]), [mapping]);

  const onPickFile = () => fileInputRef.current?.click();

  const onFileChosen = async (f?: File | null) => {
    if (!f) return;
    if (!/\.(xlsx|csv)$/i.test(f.name)) {
      alert("Зөвхөн .xlsx эсвэл .csv файл оруулна уу.");
      return;
    }
    setFile(f);

    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });

    if (!rows.length) {
      alert("Хоосон файл байна.");
      return;
    }

    const headerList = Object.keys(rows[0]);
    setHeaders(headerList);
    setRawRows(rows);
    setStep(2);
  };

  const onSelectMap = (field: FieldKey, col: string) => {
    setMapping((m) => ({ ...m, [field]: col }));
  };

  const makePayload = (): StudentMappedRow[] =>
    rawRows.map((r) => ({
      firstName: mapping.firstName ? r[mapping.firstName] ?? "" : "",
      lastName: mapping.lastName ? r[mapping.lastName] ?? "" : "",
      email: mapping.email ? r[mapping.email] ?? "" : "",
      grade: mapping.grade ? r[mapping.grade] ?? "" : undefined,
      class: mapping.class ? r[mapping.class] ?? "" : undefined,
      parentEmail1: mapping.parentEmail1 ? r[mapping.parentEmail1] ?? "" : undefined,
      parentEmail2: mapping.parentEmail2 ? r[mapping.parentEmail2] ?? "" : undefined,
      externalId: mapping.externalId ? r[mapping.externalId] ?? "" : undefined,
    }));

  const startImport = async () => {
    if (!user) return;
    if (!mappingValid) {
      alert("Шаардлагатай талбаруудыг (First Name, Last Name, Email) map хийж дуусга.");
      return;
    }
    setLoading(true);
    setResults([]);

    try {
      const token = await user.getIdToken();
      const rows = makePayload();

      const res = await fetch("/api/admin/students/import-mapped", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = (await res.json()) as { results: { email: string; status: string }[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Импортын алдаа");
      setResults(data.results);
      setStep(3);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Тодорхойгүй алдаа";
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card border border-stroke bg-card p-6 rounded-2xl">
      <div className="flex items-center gap-3 mb-4">
        <div className="bg-blue-500/10 p-2 rounded-lg border border-blue-500/20">
          <Upload className="w-6 h-6 text-blue-400" />
        </div>
        <h2 className="text-lg font-bold">Сурагч импорт (CSV/Excel + багана mapping)</h2>
      </div>

      {step === 1 && (
        <div className="space-y-3">
          <input ref={fileInputRef} type="file" accept=".xlsx,.csv" hidden onChange={(e) => onFileChosen(e.target.files?.[0] || null)} />
          <button onClick={onPickFile} className="px-4 py-2 bg-primary-bg text-primary-text rounded-lg font-bold">
            Файл сонгох
          </button>
          {file && <div className="text-sm text-muted">Сонгосон: {file.name}</div>}
          <div className="text-xs text-muted">Жишээ CSV толгой: First Name, Last Name, Email, Grade, Class, ParentEmail1, ParentEmail2, External ID</div>
        </div>
      )}

      {step === 2 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="font-bold mb-3">Багана → Талбар харгалзуулах</h3>
            <MappingSelect label="First Name *" value={mapping.firstName} onChange={(v) => onSelectMap("firstName", v)} options={headers} />
            <MappingSelect label="Last Name *" value={mapping.lastName} onChange={(v) => onSelectMap("lastName", v)} options={headers} />
            <MappingSelect label="Email *" value={mapping.email} onChange={(v) => onSelectMap("email", v)} options={headers} />
            <MappingSelect label="Grade" value={mapping.grade} onChange={(v) => onSelectMap("grade", v)} options={headers} />
            <MappingSelect label="Class" value={mapping.class} onChange={(v) => onSelectMap("class", v)} options={headers} />
            <MappingSelect label="Parent Email 1" value={mapping.parentEmail1} onChange={(v) => onSelectMap("parentEmail1", v)} options={headers} />
            <MappingSelect label="Parent Email 2" value={mapping.parentEmail2} onChange={(v) => onSelectMap("parentEmail2", v)} options={headers} />
            <MappingSelect label="External/Student ID" value={mapping.externalId} onChange={(v) => onSelectMap("externalId", v)} options={headers} />

            <div className="mt-4 flex gap-2">
              <button
                className="px-4 py-2 rounded-lg border border-stroke bg-card2 text-text font-bold"
                onClick={() => {
                  setStep(1);
                  setFile(null);
                  setRawRows([]);
                  setHeaders([]);
                }}
              >
                Буцах
              </button>
              <button className="px-4 py-2 rounded-lg bg-primary-bg text-primary-text font-bold disabled:opacity-50" onClick={startImport} disabled={!mappingValid || loading}>
                {loading ? "Импортлож байна…" : "Импортлох"}
              </button>
            </div>
            {!mappingValid && <p className="text-xs text-muted mt-2">* тэмдэгтэй талбарууд заавал сонгогдсон байх ёстой.</p>}
          </div>

          <div className="overflow-auto border border-stroke rounded-lg">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-card2">
                  {headers.map((h) => (
                    <th key={h} className="px-3 py-2 text-left border-b border-stroke">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, idx) => (
                  <tr key={idx} className="border-b border-stroke">
                    {headers.map((h) => (
                      <td key={h} className="px-3 py-1.5 whitespace-nowrap">
                        {row[h]}
                      </td>
                    ))}
                  </tr>
                ))}
                {previewRows.length === 0 && (
                  <tr>
                    <td className="px-3 py-4 text-muted">Мэдээлэл алга</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="mt-4">
          <h3 className="font-bold mb-2">Импортын үр дүн</h3>
          <div className="space-y-2">
            {results.map((r, i) => (
              <div key={i} className="text-sm">
                <span className="font-mono">{r.email}</span> — {r.status}
              </div>
            ))}
          </div>
          <div className="mt-4">
            <button
              className="px-4 py-2 rounded-lg border border-stroke bg-card2 text-text font-bold"
              onClick={() => {
                setStep(1);
                setFile(null);
                setRawRows([]);
                setHeaders([]);
                setResults([]);
                setMapping({
                  firstName: "",
                  lastName: "",
                  email: "",
                  grade: "",
                  class: "",
                  parentEmail1: "",
                  parentEmail2: "",
                  externalId: "",
                });
              }}
            >
              Дахин импортлох
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================== 3) Students List + Delete ==================== */

function StudentListManager() {
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const isAllSelected = useMemo(() => students.length > 0 && selected.size === students.length, [selected, students.length]);

  const fetchStudents = useCallback(async (): Promise<void> => {
    if (!user) return;
    setLoading(true);
    setErr(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/students", { headers: { Authorization: `Bearer ${token}` } });
      const data = (await res.json()) as { students?: Student[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Жагсаалт татаж чадсангүй.");
      setStudents(Array.isArray(data.students) ? data.students : []);
      setSelected(new Set());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Тодорхойгүй алдаа.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchStudents();
  }, [fetchStudents]);

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (isAllSelected) setSelected(new Set());
    else setSelected(new Set(students.map((s) => s.id)));
  };

  const deleteOne = async (id: string) => {
    if (!user) return;
    const target = students.find((s) => s.id === id);
    const label = target ? `${target.lastName ?? ""} ${target.firstName ?? ""}`.trim() : id;
    if (!window.confirm(`"${label || id}" сурагчийг устгах уу?`)) return;

    try {
      setBusyIds((p) => new Set(p).add(id));
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/students/${encodeURIComponent(id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Устгал амжилтгүй.");
      setStudents((list) => list.filter((s) => s.id !== id));
      setSelected((sel) => {
        const next = new Set(sel);
        next.delete(id);
        return next;
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Тодорхойгүй алдаа.");
    } finally {
      setBusyIds((p) => {
        const next = new Set(p);
        next.delete(id);
        return next;
      });
    }
  };

  const deleteSelected = async () => {
    if (!user || selected.size === 0) return;
    if (!window.confirm(`${selected.size} сурагчийг бөөнөөр устгах уу?`)) return;

    try {
      const token = await user.getIdToken();
      const ids = Array.from(selected);
      const res = await fetch("/api/admin/students/bulk-delete", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = (await res.json()) as { deleted?: number; error?: string };
      if (!res.ok) throw new Error(data.error || "Бөөн устгал амжилтгүй.");
      setStudents((list) => list.filter((s) => !selected.has(s.id)));
      setSelected(new Set());
    } catch (e) {
      alert(e instanceof Error ? e.message : "Тодорхойгүй алдаа.");
    }
  };

  return (
    <div className="card border border-stroke bg-card p-6 rounded-2xl">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="bg-green-500/10 p-2 rounded-lg border border-green-500/20">
            <Users className="w-6 h-6 text-green-400" />
          </div>
          <h2 className="text-lg font-bold">Сурагчдын жагсаалт</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void fetchStudents()} className="px-3 py-2 rounded-lg border border-stroke bg-card2 text-text text-sm font-bold">
            Дахин ачаалах
          </button>
          <button onClick={deleteSelected} disabled={selected.size === 0} className="px-3 py-2 rounded-lg bg-red-500/90 text-white text-sm font-bold disabled:opacity-50">
            Сонгосныг устгах ({selected.size})
          </button>
        </div>
      </div>

      {loading ? (
        <SkeletonLoader />
      ) : err ? (
        <div className="text-center py-10 text-red-400 bg-red-500/10 rounded-lg">
          <AlertCircle className="mx-auto h-8 w-8 mb-2" />
          <p className="font-bold">Алдаа</p>
          <p className="text-sm">{err}</p>
        </div>
      ) : students.length === 0 ? (
        <div className="text-center py-10 text-muted">Сурагч алга.</div>
      ) : (
        <div className="overflow-auto border border-stroke rounded-lg">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-card2 border-b border-stroke">
                <th className="px-3 py-2 w-12">
                  <input type="checkbox" aria-label="Бүгдийг сонгох" checked={isAllSelected} onChange={toggleAll} />
                </th>
                <th className="px-3 py-2 text-left">Овог</th>
                <th className="px-3 py-2 text-left">Нэр</th>
                <th className="px-3 py-2 text-left">И-мэйл</th>
                <th className="px-3 py-2 text-left">Анги</th>
                <th className="px-3 py-2 text-left">Зэрэглэл</th>
                <th className="px-3 py-2 text-left">Эцэг/эхийн имэйл 1</th>
                <th className="px-3 py-2 text-left">Эцэг/эхийн имэйл 2</th>
                <th className="px-3 py-2 text-left">ID</th>
                <th className="px-3 py-2 text-left">Үйлдэл</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const nameLast = s.lastName || "";
                const nameFirst = s.firstName || "";
                const checked = selected.has(s.id);
                const busy = busyIds.has(s.id);
                return (
                  <tr key={s.id} className="border-b border-stroke">
                    <td className="px-3 py-2">
                      <input type="checkbox" aria-label="Сонгох" checked={checked} onChange={() => toggleOne(s.id)} />
                    </td>
                    <td className="px-3 py-2">{nameLast}</td>
                    <td className="px-3 py-2">{nameFirst}</td>
                    <td className="px-3 py-2">{s.email}</td>
                    <td className="px-3 py-2">{s.class || ""}</td>
                    <td className="px-3 py-2">{s.grade || ""}</td>
                    <td className="px-3 py-2">{s.parentEmail1 || ""}</td>
                    <td className="px-3 py-2">{s.parentEmail2 || ""}</td>
                    <td className="px-3 py-2">{s.externalId || s.id}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => void deleteOne(s.id)}
                        disabled={busy}
                        className="px-3 py-1.5 rounded-md bg-red-500/90 text-white text-xs font-bold disabled:opacity-50"
                        title="Устгах"
                      >
                        {busy ? "Устгаж…" : "Устгах"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ======================== 4) Page with Tabs ======================== */

function AdminDashboardTabs() {
  const [activeTab, setActiveTab] = useState<"users" | "import" | "students">("users");

  return (
    <div className="card border border-stroke bg-card p-6 rounded-2xl">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-stroke mb-6">
        <button
          onClick={() => setActiveTab("users")}
          className={`px-4 py-2 font-bold text-sm rounded-t-lg ${activeTab === "users" ? "bg-primary-bg text-primary-text" : "bg-card2 text-muted hover:text-text"}`}
        >
          Хэрэглэгчид
        </button>
        <button
          onClick={() => setActiveTab("import")}
          className={`px-4 py-2 font-bold text-sm rounded-t-lg ${activeTab === "import" ? "bg-primary-bg text-primary-text" : "bg-card2 text-muted hover:text-text"}`}
        >
          Сурагч импорт
        </button>
        <button
          onClick={() => setActiveTab("students")}
          className={`px-4 py-2 font-bold text-sm rounded-t-lg ${activeTab === "students" ? "bg-primary-bg text-primary-text" : "bg-card2 text-muted hover:text-text"}`}
        >
          Сурагчдын жагсаалт
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "users" && <UsersManagement />}
      {activeTab === "import" && <StudentImportWithMapping />}
      {activeTab === "students" && <StudentListManager />}
    </div>
  );
}

export default withRole(AdminDashboardTabs, ["admin"]);