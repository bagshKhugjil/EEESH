// src/app/admin/page.tsx (Эцсийн, бүрэн гүйцэд, алдаагүй хувилбар)
"use client";

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { withRole } from '@/components/withRole';
import { useAuth } from '@/components/auth-provider';
import { Users, Loader2, CheckCircle, AlertCircle, ShieldQuestion } from 'lucide-react';

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

const getRoleBadgeClasses = (role: string | null): string => {
  const baseClasses = "px-2.5 py-0.5 text-xs font-semibold rounded-full border";
  switch (role) {
    case 'admin':
      return `${baseClasses} bg-red-500/10 text-red-400 border-red-500/20`;
    case 'teacher':
      return `${baseClasses} bg-blue-500/10 text-blue-400 border-blue-500/20`;
    case 'student':
      return `${baseClasses} bg-green-500/10 text-green-400 border-green-500/20`;
    case 'parent':
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
          <div className="w-10 h-10 rounded-full bg-card2"></div>
          <div className="space-y-2">
            <div className="h-4 w-24 rounded bg-card2"></div>
            <div className="h-3 w-32 rounded bg-card2"></div>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-16 rounded-md bg-card2"></div>
          <div className="h-8 w-16 rounded-md bg-card2"></div>
          <div className="h-8 w-16 rounded-md bg-card2"></div>
        </div>
      </div>
    ))}
  </>
);

const ConfirmationModal = ({
  modalState,
  onCancel,
  onConfirm,
  isChangingRole
}: {
  modalState: ModalState,
  onCancel: () => void,
  onConfirm: () => void,
  isChangingRole: boolean
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
          Та <span className="font-bold text-text">{modalState.userToUpdate.displayName || modalState.userToUpdate.email}</span> хэрэглэгчийн эрхийг
          <span className="font-bold text-primary-bg"> &quot;{modalState.newRole}&quot;</span> болгохдоо итгэлтэй байна уу?
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="bg-card2 border-stroke text-text px-4 py-2 text-sm font-bold rounded-lg hover:bg-card2/80">Цуцлах</button>
          <button
            onClick={onConfirm}
            disabled={isChangingRole}
            className="bg-primary-bg text-primary-text px-4 py-2 text-sm font-bold rounded-lg disabled:opacity-50 flex items-center"
          >
            {isChangingRole ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
            {isChangingRole ? 'Өөрчилж байна...' : 'Тийм, өөрчлөх'}
          </button>
        </div>
      </div>
    </div>
  );
};

function AdminDashboard() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' as 'success' | 'error' });
  const [modalState, setModalState] = useState<ModalState>({ isOpen: false, userToUpdate: null, newRole: null });
  const [isChangingRole, setIsChangingRole] = useState(false);

  const showToast = (message: string, type: 'success' | 'error'): void => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  const fetchUsers = useCallback(async (): Promise<void> => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/users', { headers: { 'Authorization': `Bearer ${token}` } });

      const data: unknown = await response.json();
      if (!response.ok) {
        const errorData = data as { error?: string };
        throw new Error(errorData.error || 'Хэрэглэгчдийн мэдээллийг татахад алдаа гарлаа.');
      }
      setUsers(data as UserRecord[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Тодорхойгүй алдаа гарлаа.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchUsers();
    }
  }, [user, fetchUsers]);

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
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: modalState.newRole })
      });
      const result = await response.json() as { message?: string, error?: string };
      if (!response.ok) throw new Error(result.error || 'Роль өөрчлөхөд алдаа гарлаа.');

      showToast(result.message || 'Амжилттай', 'success');
      await fetchUsers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Тодорхойгүй алдаа гарлаа.", 'error');
    } finally {
      setIsChangingRole(false);
      setModalState({ isOpen: false, userToUpdate: null, newRole: null });
    }
  };

  const ROLES = ['student', 'parent', 'teacher', 'admin'];

  return (
    <>
      <div className="card border border-stroke bg-card p-6 rounded-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-primary-bg/10 p-2 rounded-lg border border-primary-bg/20">
            <Users className="w-6 h-6 text-primary-bg" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Хэрэглэгчийн удирдлага</h1>
            <p className="text-sm text-muted">Системийн хэрэглэгчдийн эрхийг удирдах хэсэг.</p>
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
          ) : (
            users.map((u) => (
              <div key={u.uid} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border-b border-stroke last:border-0">
                <div className="flex items-center gap-4">
                  <Image
                    src={u.photoURL || `https://ui-avatars.com/api/?name=${u.displayName || u.email}&background=random`}
                    alt={u.displayName || 'Хэрэглэгчийн зураг'}
                    width={40}
                    height={40}
                    className="w-10 h-10 rounded-full"
                  />
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-bold text-text">{u.displayName || 'Нэргүй'}</p>
                      <span className={getRoleBadgeClasses(u.role)}>
                        {u.role ? u.role.charAt(0).toUpperCase() + u.role.slice(1) : 'Тодорхойгүй'}
                      </span>
                    </div>
                    <p className="text-xs text-muted">{u.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {ROLES.map(role => (
                    <button
                      key={role}
                      onClick={() => handleRoleChange(u, role)}
                      disabled={u.role === role}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all duration-200 border ${
                        u.role === role
                          ? 'bg-primary-bg text-primary-text border-transparent cursor-default'
                          : 'bg-card2 border-stroke text-muted hover:bg-primary-bg/10 hover:border-primary-bg/20 hover:text-text disabled:opacity-100'
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
      </div>

      <ConfirmationModal
        modalState={modalState}
        onCancel={() => setModalState({ isOpen: false, userToUpdate: null, newRole: null })}
        onConfirm={executeRoleChange}
        isChangingRole={isChangingRole}
      />

      {toast.show && (
        <div
          className={`fixed bottom-5 right-5 flex items-center gap-3 p-4 rounded-lg border text-sm font-bold animate-fade-in-up
            ${toast.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}
        >
          {toast.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          {toast.message}
        </div>
      )}
    </>
  );
}

export default withRole(AdminDashboard, ['admin']);