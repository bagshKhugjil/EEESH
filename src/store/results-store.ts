// src/store/results-store.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/** Нэг сурагчийн дүн */
export type StudentResults = {
    subjects: string[];
    results: Record<string, {
        average: number;
        history: Array<{
            date: string;
            total: number;
            part1?: number;
            part2?: number;
        }>;
    }>;
};

/** Store state */
type ResultsState = {
    // studentId -> results
    data: Record<string, StudentResults>;
    lastFetchedAt: number | null;

    // Actions
    setBulkResults: (bulkData: Record<string, StudentResults>, timestamp?: number) => void;
    getStudentResults: (studentId: string) => StudentResults | null;
    clear: () => void;
};

export const useResultsStore = create<ResultsState>()(
    persist(
        (set, get) => ({
            data: {},
            lastFetchedAt: null,

            setBulkResults: (bulkData, timestamp) =>
                set({
                    data: bulkData || {},
                    lastFetchedAt: timestamp ?? Date.now(),
                }),

            getStudentResults: (studentId) => {
                const { data } = get();
                return data[studentId] || null;
            },

            clear: () => set({ data: {}, lastFetchedAt: null }),
        }),
        {
            name: "eesh-admin-results", // localStorage key
            version: 1,
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                data: state.data,
                lastFetchedAt: state.lastFetchedAt,
            }),
        }
    )
);
