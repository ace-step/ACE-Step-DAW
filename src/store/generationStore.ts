import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface GenerationJob {
  id: string;
  clipId: string;
  trackName: string;
  status: 'queued' | 'generating' | 'processing' | 'done' | 'error';
  progress: string;
  error?: string;
}

export interface PromptHistoryEntry {
  id: string;
  prompt: string;
  timestamp: number;
  trackName?: string;
  bpm?: number;
  keyScale?: string;
}

const MAX_PROMPT_HISTORY = 50;

interface GenerationState {
  jobs: GenerationJob[];
  isGenerating: boolean;
  promptHistory: PromptHistoryEntry[];

  addJob: (job: GenerationJob) => void;
  updateJob: (jobId: string, updates: Partial<GenerationJob>) => void;
  removeJob: (jobId: string) => void;
  clearCompletedJobs: () => void;
  setIsGenerating: (v: boolean) => void;
  addPromptToHistory: (prompt: string, meta?: Partial<Omit<PromptHistoryEntry, 'id' | 'prompt' | 'timestamp'>>) => void;
  clearPromptHistory: () => void;
}

export const useGenerationStore = create<GenerationState>()(
  persist(
    (set) => ({
      jobs: [],
      isGenerating: false,
      promptHistory: [],

      addJob: (job) => set((s) => ({ jobs: [...s.jobs, job] })),

      updateJob: (jobId, updates) =>
        set((s) => ({
          jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, ...updates } : j)),
        })),

      removeJob: (jobId) =>
        set((s) => ({ jobs: s.jobs.filter((j) => j.id !== jobId) })),

      clearCompletedJobs: () =>
        set((s) => ({
          jobs: s.jobs.filter((j) => j.status !== 'done' && j.status !== 'error'),
        })),

      setIsGenerating: (v) => set({ isGenerating: v }),

      addPromptToHistory: (prompt, meta) => set((s) => {
        // Avoid duplicates of exact same prompt
        const existing = s.promptHistory.find((p) => p.prompt === prompt);
        if (existing) {
          // Move to front with updated timestamp
          return {
            promptHistory: [
              { ...existing, timestamp: Date.now(), ...meta },
              ...s.promptHistory.filter((p) => p.id !== existing.id),
            ].slice(0, MAX_PROMPT_HISTORY),
          };
        }
        return {
          promptHistory: [
            { id: crypto.randomUUID(), prompt, timestamp: Date.now(), ...meta },
            ...s.promptHistory,
          ].slice(0, MAX_PROMPT_HISTORY),
        };
      }),

      clearPromptHistory: () => set({ promptHistory: [] }),
    }),
    {
      name: 'ace-step-daw-generation',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        promptHistory: state.promptHistory,
      }),
    },
  ),
);
