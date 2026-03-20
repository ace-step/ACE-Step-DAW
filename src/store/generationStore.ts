import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { DEFAULT_BPM, DEFAULT_DURATION, DEFAULT_KEY_SCALE, MAX_BPM, MAX_DURATION, MIN_BPM, MIN_DURATION } from '../constants/defaults';
import type { GenerationPreset } from '../constants/generationPresets';
import { useProjectStore } from './projectStore';
import {
  applyPromptAutocompleteSuggestion as applyPromptAutocompleteSuggestionToPrompt,
  getPromptAutocompleteSuggestions as getPromptAutocompleteSuggestionsForPrompt,
  type AppliedPromptAutocompleteSuggestion,
  type PromptAutocompleteSuggestion,
} from '../utils/promptAutocomplete';

export interface GenerationJob {
  id: string;
  clipId: string;
  trackName: string;
  status: 'queued' | 'generating' | 'processing' | 'done' | 'error';
  progress: string;
  stage?: string | null;
  progressPercent?: number | null;
  etaSeconds?: number | null;
  etaConfidence?: 'none' | 'low' | 'medium' | 'high';
  startedAt?: number;
  completedAt?: number;
  lastUpdatedAt?: number;
  actionableMessage?: string;
  error?: string;
}

export interface GenerationJobProgressInput {
  status: GenerationJob['status'];
  progress: string;
  stage?: string | null;
  progressPercent?: number | null;
  error?: string;
  now?: number;
}

function normalizeStageLabel(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function inferStageLabel(status: GenerationJob['status'], progress: string): string | null {
  const trimmed = progress.trim();
  if (trimmed) {
    const withoutPercent = trimmed.replace(/\s*\d{1,3}(?:\.\d+)?%\s*$/u, '').trim();
    if (withoutPercent && withoutPercent !== trimmed) return withoutPercent.replace(/[.:\-–]+$/u, '').trim();
    if (/submitt/i.test(trimmed)) return 'Submitting request';
    if (/download/i.test(trimmed)) return 'Downloading audio';
    if (/queue/i.test(trimmed)) return 'Queued';
  }

  switch (status) {
    case 'queued':
      return 'Queued';
    case 'generating':
      return 'Generating audio';
    case 'processing':
      return 'Processing audio';
    case 'done':
      return 'Complete';
    case 'error':
      return 'Generation failed';
    default:
      return null;
  }
}

function normalizeProgressPercent(
  progressPercent: number | null | undefined,
  progress: string,
): number | null {
  const parsed = typeof progressPercent === 'number' && Number.isFinite(progressPercent)
    ? progressPercent
    : Number(progress.match(/(\d{1,3}(?:\.\d+)?)%/u)?.[1] ?? Number.NaN);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(100, parsed));
}

function buildActionableGenerationMessage(status: GenerationJob['status'], error?: string): string | undefined {
  if (status !== 'error') return undefined;
  const message = error?.trim();
  if (!message) {
    return 'Generation failed. Retry the request. If it keeps failing, verify the backend is healthy.';
  }
  const lower = message.toLowerCase();
  if (lower.includes('timed out')) {
    return 'Generation timed out while waiting for the backend. Retry the request or check the backend status before trying again.';
  }
  if (lower.includes('failed to fetch') || lower.includes('network') || lower.includes('abort')) {
    return 'Generation lost connection to the backend. Check the backend URL or health, then retry.';
  }
  return `${message} Retry the request. If it keeps failing, try a shorter duration or check the backend logs.`;
}

export function deriveGenerationJobProgress(
  previous: GenerationJob | undefined,
  input: GenerationJobProgressInput,
): Partial<GenerationJob> {
  const now = input.now ?? Date.now();
  const normalizedPercent = normalizeProgressPercent(input.progressPercent, input.progress);
  const previousPercent = previous?.progressPercent ?? null;
  const monotonicPercent = normalizedPercent == null
    ? previousPercent
    : Math.max(previousPercent ?? 0, normalizedPercent);
  const startedAt = previous?.startedAt ?? now;
  const stage = normalizeStageLabel(input.stage) ?? inferStageLabel(input.status, input.progress);

  let etaSeconds: number | null = null;
  let etaConfidence: GenerationJob['etaConfidence'] = 'none';

  if ((input.status === 'generating' || input.status === 'processing') && monotonicPercent != null && monotonicPercent > 0 && monotonicPercent < 100) {
    const elapsedSeconds = Math.max(0, (now - startedAt) / 1000);
    if (elapsedSeconds >= 4 && monotonicPercent >= 8) {
      const remainingSeconds = (elapsedSeconds * (100 - monotonicPercent)) / monotonicPercent;
      if (Number.isFinite(remainingSeconds)) {
        etaConfidence = monotonicPercent >= 35 && elapsedSeconds >= 10
          ? 'high'
          : monotonicPercent >= 15 && elapsedSeconds >= 6
            ? 'medium'
            : 'low';
        etaSeconds = etaConfidence === 'low' ? null : Math.max(1, Math.round(remainingSeconds));
      }
    }
  }

  if (input.status === 'done') {
    etaSeconds = 0;
    etaConfidence = 'high';
  }

  if (input.status === 'error') {
    etaSeconds = null;
    etaConfidence = 'none';
  }

  return {
    progress: input.progress,
    stage,
    progressPercent: input.status === 'done' ? 100 : monotonicPercent,
    etaSeconds,
    etaConfidence,
    startedAt,
    lastUpdatedAt: now,
    completedAt: input.status === 'done' ? now : previous?.completedAt,
    actionableMessage: buildActionableGenerationMessage(input.status, input.error),
    error: input.error,
  };
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
  jobId?: string;
  taskId?: string;
  resultAudioPath?: string;
  seed?: string;
  startedAt?: number;
  completedAt?: number;
  /** Current generation stage from the backend */
  stage?: string;
  /** Progress percentage (0–100) from the backend */
  progressPercent?: number;
  /** Estimated seconds remaining */
  etaSeconds?: number;
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

export interface SubmittedGenerationRequest {
  prompt: string;
  trackId: string;
  bpm: number;
  keyScale: string;
  duration: number;
  temperature: number;
  variationCount: number;
  styleTags: string[];
  lyrics?: string;
  globalCaption: string;
  presetId?: string;
  submittedAt: number;
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

function normalizeVariationSessionParams(
  params: VariationSessionParams,
  fallbackPresetId: string | null = null,
): VariationSessionParams {
  return {
    ...params,
    prompt: params.prompt.trim(),
    variationCount: clampVariationCount(params.variationCount),
    bpm: clampBpm(params.bpm),
    duration: clampLengthSeconds(params.duration),
    guidanceScale: clampTemperature(params.guidanceScale),
    temperature: clampTemperature(params.temperature ?? params.guidanceScale),
    styleTags: normalizeStyleTags(params.styleTags ?? []),
    lyrics: params.lyrics?.trim() || undefined,
    globalCaption: params.globalCaption?.trim() || undefined,
    presetId: params.presetId ?? fallbackPresetId ?? undefined,
  };
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
  lastSubmittedRequest: SubmittedGenerationRequest | null;

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
  getPromptAutocompleteSuggestions: (prompt?: string, caretIndex?: number, limit?: number) => PromptAutocompleteSuggestion[];
  applyPromptAutocompleteSuggestion: (suggestion: string, caretIndex?: number) => AppliedPromptAutocompleteSuggestion | null;
  getGenerationValidationError: () => string | null;
  canSubmitGeneration: () => boolean;
  submitGenerationRequest: (context?: { globalCaption?: string | null }) => VariationSessionParams | null;

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
      lastSubmittedRequest: null,

      addJob: (job) => set((s) => ({
        jobs: [
          ...s.jobs,
          {
            ...job,
            stage: job.stage ?? inferStageLabel(job.status, job.progress),
            progressPercent: normalizeProgressPercent(job.progressPercent, job.progress),
            etaSeconds: job.etaSeconds ?? null,
            etaConfidence: job.etaConfidence ?? 'none',
            startedAt: job.startedAt ?? Date.now(),
            lastUpdatedAt: job.lastUpdatedAt ?? Date.now(),
            actionableMessage: job.actionableMessage,
            error: job.error,
            completedAt: job.completedAt,
          },
        ],
      })),

      updateJob: (jobId, updates) =>
        set((s) => ({
          jobs: s.jobs.map((j) => {
            if (j.id !== jobId) return j;
            // Prevent progress from jumping backward
            const safeUpdates = { ...updates };
            if (
              safeUpdates.progressPercent != null &&
              j.progressPercent != null &&
              safeUpdates.progressPercent < j.progressPercent
            ) {
              safeUpdates.progressPercent = j.progressPercent;
            }
            const merged = { ...j, ...safeUpdates };
            return {
              ...merged,
              ...deriveGenerationJobProgress(j, {
                status: merged.status,
                progress: merged.progress,
                stage: merged.stage,
                progressPercent: merged.progressPercent,
                error: merged.error,
                now: merged.lastUpdatedAt,
              }),
            };
          }),
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

      getPromptAutocompleteSuggestions: (prompt, caretIndex, limit) => {
        const currentPrompt = prompt ?? get().generationForm.prompt;
        return getPromptAutocompleteSuggestionsForPrompt(currentPrompt, caretIndex, limit);
      },

      applyPromptAutocompleteSuggestion: (suggestion, caretIndex) => {
        const currentPrompt = get().generationForm.prompt;
        const result = applyPromptAutocompleteSuggestionToPrompt(currentPrompt, suggestion, caretIndex);
        if (!result) return null;
        get().setGenerationPrompt(result.prompt);
        return result;
      },

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

      submitGenerationRequest: (context) => {
        const { generationForm } = get();
        const error = get().getGenerationValidationError();
        if (error) {
          get().setGenerationRequestError(error);
          return null;
        }

        const params = normalizeVariationSessionParams({
          prompt: generationForm.prompt.trim(),
          trackId: generationForm.selectedTrackId,
          variationCount: generationForm.variationCount,
          bpm: generationForm.bpm,
          keyScale: generationForm.keyScale,
          duration: generationForm.lengthSeconds,
          guidanceScale: generationForm.temperature,
          temperature: generationForm.temperature,
          styleTags: generationForm.styleTags,
          lyrics: generationForm.lyrics.trim() || undefined,
          globalCaption: context?.globalCaption?.trim() || undefined,
          presetId: generationForm.presetId ?? undefined,
        }, generationForm.presetId);

        set({
          lastSubmittedRequest: {
            prompt: params.prompt,
            trackId: params.trackId,
            bpm: params.bpm,
            keyScale: params.keyScale,
            duration: params.duration,
            temperature: params.temperature ?? params.guidanceScale,
            variationCount: params.variationCount,
            styleTags: params.styleTags ?? [],
            lyrics: params.lyrics,
            globalCaption: params.globalCaption ?? '',
            presetId: params.presetId,
            submittedAt: Date.now(),
          },
        });
        get().setGenerationRequestError(null);
        get().startVariationSession(params);
        return params;
      },

      startVariationSession: (params) => {
        const normalizedParams = normalizeVariationSessionParams(params, get().generationForm.presetId);
        const count = normalizedParams.variationCount;
        const variations: Variation[] = Array.from({ length: count }, (_, i) => ({
          index: i,
          status: 'pending' as const,
          clipId: null,
          progress: '',
        }));

        // Add to prompt history
        get().addPromptToHistory(normalizedParams.prompt, {
          bpm: normalizedParams.bpm,
          keyScale: normalizedParams.keyScale,
        });

        set({
          variationSession: {
            id: crypto.randomUUID(),
            prompt: normalizedParams.prompt,
            trackId: normalizedParams.trackId,
            variations,
            activeVariationIndex: 0,
            status: 'generating',
            params: normalizedParams,
            createdAt: Date.now(),
          },
          generationForm: {
            ...get().generationForm,
            prompt: normalizedParams.prompt,
            selectedTrackId: normalizedParams.trackId,
            variationCount: count,
            bpm: normalizedParams.bpm,
            keyScale: normalizedParams.keyScale,
            lengthSeconds: normalizedParams.duration,
            temperature: normalizedParams.temperature ?? normalizedParams.guidanceScale,
            styleTags: normalizedParams.styleTags ?? [],
            lyrics: normalizedParams.lyrics ?? '',
            presetId: normalizedParams.presetId ?? get().generationForm.presetId,
            requestError: null,
          },
        });
      },

      updateVariation: (index, updates) => set((s) => {
        if (!s.variationSession) return s;
        const currentVariation = s.variationSession.variations.find((variation) => variation.index === index);
        const variations = s.variationSession.variations.map((v) =>
          v.index === index
            ? {
                ...v,
                ...updates,
                progressPercent: updates.progressPercent !== undefined
                  ? Math.max(v.progressPercent ?? 0, updates.progressPercent)
                  : v.progressPercent,
              }
            : v,
        );
        // Check if all variations are terminal (done, error, or cancelled)
        const allTerminal = variations.every(
          (v) => v.status === 'done' || v.status === 'error' || v.status === 'cancelled',
        );
        const activeVariation = variations[s.variationSession.activeVariationIndex];
        const nextActiveVariationIndex =
          updates.status === 'done'
          && currentVariation
          && activeVariation
          && activeVariation.status !== 'done'
            ? index
            : s.variationSession.activeVariationIndex;
        return {
          variationSession: {
            ...s.variationSession,
            variations,
            activeVariationIndex: nextActiveVariationIndex,
            status:
              s.variationSession.status === 'cancelled'
                ? s.variationSession.status
                : (allTerminal ? 'done' : s.variationSession.status),
          },
        };
      }),

      setActiveVariation: (index) => {
        const s = get();
        if (!s.variationSession) return;
        const max = s.variationSession.variations.length - 1;
        const clamped = Math.max(0, Math.min(max, index));

        set({
          variationSession: {
            ...s.variationSession,
            activeVariationIndex: clamped,
          },
        });

        // Mute/unmute variation clips in the project store
        const projState = useProjectStore.getState();
        if (!projState.project) return;

        for (const variation of s.variationSession.variations) {
          if (!variation.clipId) continue;
          const shouldMute = variation.index !== clamped;
          projState.updateClip(variation.clipId, { muted: shouldMute });
        }
      },

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
