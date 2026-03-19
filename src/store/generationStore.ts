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

export type VariationStatus = 'pending' | 'generating' | 'processing' | 'done' | 'error' | 'cancelled';

export interface Variation {
  index: number;
  status: VariationStatus;
  clipId: string | null;
  progress: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface VariationSessionParams {
  prompt: string;
  trackId: string;
  variationCount: number;
  bpm: number;
  keyScale: string;
  duration: number;
  guidanceScale: number;
  lyrics?: string;
  globalCaption?: string;
  presetId?: string;
}

export interface VariationSession {
  id: string;
  prompt: string;
  trackId: string;
  variations: Variation[];
  activeVariationIndex: number;
  status: 'generating' | 'done' | 'cancelled';
  params: VariationSessionParams;
  createdAt: number;
}

const MAX_PROMPT_HISTORY = 50;

export interface GenerationState {
  jobs: GenerationJob[];
  isGenerating: boolean;
  promptHistory: PromptHistoryEntry[];
  variationSession: VariationSession | null;

  addJob: (job: GenerationJob) => void;
  updateJob: (jobId: string, updates: Partial<GenerationJob>) => void;
  removeJob: (jobId: string) => void;
  clearCompletedJobs: () => void;
  setIsGenerating: (v: boolean) => void;
  addPromptToHistory: (prompt: string, meta?: Partial<Omit<PromptHistoryEntry, 'id' | 'prompt' | 'timestamp'>>) => void;
  clearPromptHistory: () => void;

  startVariationSession: (params: VariationSessionParams) => void;
  updateVariation: (index: number, updates: Partial<Omit<Variation, 'index'>>) => void;
  setActiveVariation: (index: number) => void;
  clearVariationSession: () => void;
  cancelVariationSession: () => void;
}

export const useGenerationStore = create<GenerationState>()(
  persist(
    (set, get) => ({
      jobs: [],
      isGenerating: false,
      promptHistory: [],
      variationSession: null,

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
        const existing = s.promptHistory.find((p) => p.prompt === prompt);
        if (existing) {
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

      startVariationSession: (params) => {
        const count = Math.max(2, Math.min(4, params.variationCount));
        const variations: Variation[] = Array.from({ length: count }, (_, i) => ({
          index: i,
          status: 'pending' as const,
          clipId: null,
          progress: '',
        }));

        // Add to prompt history
        get().addPromptToHistory(params.prompt, {
          bpm: params.bpm,
          keyScale: params.keyScale,
        });

        set({
          variationSession: {
            id: crypto.randomUUID(),
            prompt: params.prompt,
            trackId: params.trackId,
            variations,
            activeVariationIndex: 0,
            status: 'generating',
            params: { ...params, variationCount: count },
            createdAt: Date.now(),
          },
        });
      },

      updateVariation: (index, updates) => set((s) => {
        if (!s.variationSession) return s;
        const variations = s.variationSession.variations.map((v) =>
          v.index === index ? { ...v, ...updates } : v,
        );
        // Check if all variations are terminal (done, error, or cancelled)
        const allTerminal = variations.every(
          (v) => v.status === 'done' || v.status === 'error' || v.status === 'cancelled',
        );
        return {
          variationSession: {
            ...s.variationSession,
            variations,
            status: allTerminal ? 'done' : s.variationSession.status,
          },
        };
      }),

      setActiveVariation: (index) => set((s) => {
        if (!s.variationSession) return s;
        const max = s.variationSession.variations.length - 1;
        return {
          variationSession: {
            ...s.variationSession,
            activeVariationIndex: Math.max(0, Math.min(max, index)),
          },
        };
      }),

      clearVariationSession: () => set({ variationSession: null }),

      cancelVariationSession: () => set((s) => {
        if (!s.variationSession) return s;
        const variations = s.variationSession.variations.map((v) =>
          v.status === 'pending' || v.status === 'generating' || v.status === 'processing'
            ? { ...v, status: 'cancelled' as const }
            : v,
        );
        return {
          variationSession: {
            ...s.variationSession,
            variations,
            status: 'cancelled',
          },
        };
      }),
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
