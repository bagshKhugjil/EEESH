// src/store/students-store.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/** Admin UI-д ашиглаж буй сурагчийн бүтэц */
export type Student = {
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

type StudentsState = {
  students: Student[];
  lastFetchedAt: number | null;      // cache шинэлэг эсэх
  setStudents: (rows: Student[], fetchedAt?: number) => void;
  upsertMany: (rows: Student[]) => void;
  removeByIds: (ids: string[]) => void;
  clear: () => void;
};

export const useStudentsStore = create<StudentsState>()(
  persist(
    (set, get) => ({
      students: [],
      lastFetchedAt: null,

      setStudents: (rows, fetchedAt) =>
        set({
          students: Array.isArray(rows) ? rows : [],
          lastFetchedAt: fetchedAt ?? Date.now(),
        }),

      upsertMany: (rows) => {
        const map = new Map<string, Student>();
        get().students.forEach((s) => map.set(s.id, s));
        rows.forEach((r) => map.set(r.id, { ...(map.get(r.id) || {}), ...r }));
        set({ students: Array.from(map.values()) });
      },

      removeByIds: (ids) => {
        const remove = new Set(ids);
        set({ students: get().students.filter((s) => !remove.has(s.id)) });
      },

      clear: () => set({ students: [], lastFetchedAt: null }),
    }),
    {
      name: "eesh-admin-students", // localStorage key
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        students: state.students,
        lastFetchedAt: state.lastFetchedAt,
      }),
    }
  )
);