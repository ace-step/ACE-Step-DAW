import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { DEFAULT_BPM, DEFAULT_DURATION, DEFAULT_KEY_SCALE, MAX_BPM, MAX_DURATION, MIN_BPM, MIN_DURATION } from '../constants/defaults';
import type { GenerationPreset } from '../constants/generationPresets';

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
  temperature?: number;
  styleTags?: string[];
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
const MAX_STYLE_TAGS = 6;

export interface GenerationFormState {
  prompt: string;
  styleTags: string[];
  bpm: number;
  keyScale: string;
  lengthSeconds: number;
  temperature: number;
  variationCount: number;
  selectedTrackId: string;
  lyrics: string;
  presetId: string | null;
  requestError: string | null;
}

export interface GenerationValidationInput {
  prompt: string;
  selectedTrackId: string;
  bpm: number;
  lengthSeconds: number;
  temperature: number;
  variationCount: number;
}

function clampBpm(value: number) {
  return Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(value)));
}

function clampLengthSeconds(value: number) {
  return Math.max(MIN_DURATION, Math.min(MAX_DURATION, Math.round(value)));
}

function clampTemperature(value: number) {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function clampVariationCount(value: number) {
  return Math.max(1, Math.min(4, Math.round(value)));
}

function sanitizeStyleTag(tag: string) {
  return tag.trim().replace(/\s+/g, ' ');
}

function normalizeStyleTags(tags: string[]) {
  const unique: string[] = [];
  for (const tag of tags) {
    const sanitized = sanitizeStyleTag(tag);
    if (!sanitized) continue;
    const exists = unique.some((entry) => entry.toLowerCase() === sanitized.toLowerCase());
    if (!exists) unique.push(sanitized);
    if (unique.length >= MAX_STYLE_TAGS) break;
  }
  return unique;
}

export function createDefaultGenerationFormState(): GenerationFormState {
  return {
    prompt: '',
    styleTags: [],
    bpm: DEFAULT_BPM,
    keyScale: DEFAULT_KEY_SCALE,
    lengthSeconds: DEFAULT_DURATION,
    temperature: 0.7,
    variationCount: 2,
    selectedTrackId: '',
    lyrics: '',
    presetId: null,
    requestError: null,
  };
}

export function getGenerationValidationError(input: GenerationValidationInput): string | null {
  if (!input.prompt.trim()) {
    return 'Add a prompt that describes the material you want to generate.';
  }
  if (!input.selectedTrackId) {
    return 'Choose a target track before starting generation.';
  }
  if (!Number.isFinite(input.bpm) || input.bpm < MIN_BPM || input.bpm > MAX_BPM) {
    return `Set BPM between ${MIN_BPM} and ${MAX_BPM}.`;
  }
  if (!Number.isFinite(input.lengthSeconds) || input.lengthSeconds < MIN_DURATION || input.lengthSeconds > MAX_DURATION) {
    return `Set length between ${MIN_DURATION} and ${MAX_DURATION} seconds.`;
  }
  if (!Number.isFinite(input.temperature) || input.temperature < 0 || input.temperature > 1) {
    return 'Set temperature between 0.0 and 1.0.';
  }
  if (!Number.isFinite(input.variationCount) || input.variationCount < 1 || input.variationCount > 4) {
    return 'Choose between 1 and 4 variations.';
  }
  return null;
}

export interface GenerationState {
  jobs: GenerationJob[];
  isGenerating: boolean;
  promptHistory: PromptHistoryEntry[];
  variationSession: VariationSession | null;
  generationForm: GenerationFormState;

  addJob: (job: GenerationJob) => void;
  updateJob: (jobId: string, updates: Partial<GenerationJob>) => void;
  removeJob: (jobId: string) => void;
  clearCompletedJobs: () => void;
  setIsGenerating: (v: boolean) => void;
  addPromptToHistory: (prompt: string, meta?: Partial<Omit<PromptHistoryEntry, 'id' | 'prompt' | 'timestamp'>>) => void;
  clearPromptHistory: () => void;
  hydrateGenerationForm: (updates: Partial<GenerationFormState>) => void;
  resetGenerationForm: () => void;
  setGenerationPrompt: (prompt: string) => void;
  setGenerationStyleTags: (tags: string[]) => void;
  toggleGenerationStyleTag: (tag: string) => void;
  setGenerationBpm: (bpm: number) => void;
  setGenerationKeyScale: (keyScale: string) => void;
  setGenerationLengthSeconds: (lengthSeconds: number) => void;
  setGenerationTemperature: (temperature: number) => void;
  setGenerationVariationCount: (variationCount: number) => void;
  setGenerationTargetTrack: (trackId: string) => void;
  setGenerationLyrics: (lyrics: string) => void;
  setGenerationRequestError: (message: string | null) => void;
  applyGenerationPreset: (preset: GenerationPreset) => void;
  getGenerationValidationError: () => string | null;
  canSubmitGeneration: () => boolean;

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
      generationForm: createDefaultGenerationFormState(),

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

      hydrateGenerationForm: (updates) => set((s) => ({
        generationForm: {
          ...s.generationForm,
          ...updates,
          styleTags: updates.styleTags ? normalizeStyleTags(updates.styleTags) : s.generationForm.styleTags,
          bpm: updates.bpm !== undefined ? clampBpm(updates.bpm) : s.generationForm.bpm,
          lengthSeconds: updates.lengthSeconds !== undefined ? clampLengthSeconds(updates.lengthSeconds) : s.generationForm.lengthSeconds,
          temperature: updates.temperature !== undefined ? clampTemperature(updates.temperature) : s.generationForm.temperature,
          variationCount: updates.variationCount !== undefined ? clampVariationCount(updates.variationCount) : s.generationForm.variationCount,
        },
      })),

      resetGenerationForm: () => set({ generationForm: createDefaultGenerationFormState() }),

      setGenerationPrompt: (prompt) => set((s) => ({
        generationForm: {
          ...s.generationForm,
          prompt,
          requestError: s.generationForm.requestError ? null : s.generationForm.requestError,
        },
      })),

      setGenerationStyleTags: (tags) => set((s) => ({
        generationForm: {
          ...s.generationForm,
          styleTags: normalizeStyleTags(tags),
          requestError: null,
        },
      })),

      toggleGenerationStyleTag: (tag) => set((s) => {
        const sanitized = sanitizeStyleTag(tag);
        if (!sanitized) return s;
        const exists = s.generationForm.styleTags.some((entry) => entry.toLowerCase() === sanitized.toLowerCase());
        return {
          generationForm: {
            ...s.generationForm,
            styleTags: exists
              ? s.generationForm.styleTags.filter((entry) => entry.toLowerCase() !== sanitized.toLowerCase())
              : normalizeStyleTags([...s.generationForm.styleTags, sanitized]),
            requestError: null,
          },
        };
      }),

      setGenerationBpm: (bpm) => set((s) => ({
        generationForm: {
          ...s.generationForm,
          bpm: clampBpm(bpm),
          requestError: null,
        },
      })),

      setGenerationKeyScale: (keyScale) => set((s) => ({
        generationForm: {
          ...s.generationForm,
          keyScale,
          requestError: null,
        },
      })),

      setGenerationLengthSeconds: (lengthSeconds) => set((s) => ({
        generationForm: {
          ...s.generationForm,
          lengthSeconds: clampLengthSeconds(lengthSeconds),
          requestError: null,
        },
      })),

      setGenerationTemperature: (temperature) => set((s) => ({
        generationForm: {
          ...s.generationForm,
          temperature: clampTemperature(temperature),
          requestError: null,
        },
      })),

      setGenerationVariationCount: (variationCount) => set((s) => ({
        generationForm: {
          ...s.generationForm,
          variationCount: clampVariationCount(variationCount),
          requestError: null,
        },
      })),

      setGenerationTargetTrack: (trackId) => set((s) => ({
        generationForm: {
          ...s.generationForm,
          selectedTrackId: trackId,
          requestError: null,
        },
      })),

      setGenerationLyrics: (lyrics) => set((s) => ({
        generationForm: {
          ...s.generationForm,
          lyrics,
          requestError: null,
        },
      })),

      setGenerationRequestError: (message) => set((s) => ({
        generationForm: {
          ...s.generationForm,
          requestError: message,
        },
      })),

      applyGenerationPreset: (preset) => set((s) => ({
        generationForm: {
          ...s.generationForm,
          prompt: preset.caption,
          bpm: clampBpm(preset.suggestedBpm),
          keyScale: preset.suggestedKey,
          lyrics: preset.lyricsTemplate,
          presetId: preset.id,
          styleTags: normalizeStyleTags([preset.category]),
          requestError: null,
        },
      })),

      getGenerationValidationError: () => {
        const { generationForm } = get();
        return getGenerationValidationError({
          prompt: generationForm.prompt,
          selectedTrackId: generationForm.selectedTrackId,
          bpm: generationForm.bpm,
          lengthSeconds: generationForm.lengthSeconds,
          temperature: generationForm.temperature,
          variationCount: generationForm.variationCount,
        });
      },

      canSubmitGeneration: () => {
        const state = get();
        return !state.isGenerating && !state.getGenerationValidationError();
      },

      startVariationSession: (params) => {
        const count = clampVariationCount(params.variationCount);
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
          generationForm: {
            ...get().generationForm,
            prompt: params.prompt,
            selectedTrackId: params.trackId,
            variationCount: count,
            bpm: clampBpm(params.bpm),
            keyScale: params.keyScale,
            lengthSeconds: clampLengthSeconds(params.duration),
            temperature: clampTemperature(params.temperature ?? params.guidanceScale),
            styleTags: normalizeStyleTags(params.styleTags ?? get().generationForm.styleTags),
            lyrics: params.lyrics ?? '',
            presetId: params.presetId ?? get().generationForm.presetId,
            requestError: null,
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
        generationForm: state.generationForm,
      }),
    },
  ),
);
