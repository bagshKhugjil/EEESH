// src/store/results-store.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type PartStatsView = {
    numQuestions: number | null;
    numCorrect: number | null;
};

export type HistoryItem = {
    id: string;
    quizId: string;
    date: string;
    total: number;
    part1?: number;
    part2?: number;
    part1Stats?: PartStatsView;
    part2Stats?: PartStatsView;
};

/** Нэг сурагчийн дүн */
export type StudentResults = {
    subjects: string[];
    results: Record<string, {
        average: number;
        history: HistoryItem[];
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
    updateHistoryItem: (
        studentId: string,
        subject: string,
        itemId: string,
        patch: Partial<HistoryItem>
    ) => void;
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

            updateHistoryItem: (studentId, subject, itemId, patch) => {
                const { data } = get();
                const student = data[studentId];
                if (!student) return;
                const subjectData = student.results[subject];
                if (!subjectData) return;

                const nextHistory = subjectData.history.map((h) =>
                    h.id === itemId ? { ...h, ...patch } : h
                );
                const totals = nextHistory.map((h) => h.total).filter((v) => Number.isFinite(v));
                const nextAvg = totals.length
                    ? Number((totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(1))
                    : 0;

                set({
                    data: {
                        ...data,
                        [studentId]: {
                            ...student,
                            results: {
                                ...student.results,
                                [subject]: {
                                    average: nextAvg,
                                    history: nextHistory,
                                },
                            },
                        },
                    },
                });
            },

            clear: () => set({ data: {}, lastFetchedAt: null }),
        }),
        {
            name: "eesh-admin-results", // localStorage key
            version: 2,
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                data: state.data,
                lastFetchedAt: state.lastFetchedAt,
            }),
            migrate: (_persisted, version) => {
                // v1 → v2: HistoryItem-д id/quizId/part*Stats нэмэгдсэн
                // Хуучин кэшийг хаяад refetch хийлгэнэ
                if (version < 2) {
                    return { data: {}, lastFetchedAt: null } as Partial<ResultsState>;
                }
                return _persisted as Partial<ResultsState>;
            },
        }
    )
);
