import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { DEFAULT_BPM, DEFAULT_DURATION, DEFAULT_KEY_SCALE, DEFAULT_GENERATION, MAX_BPM, MAX_DURATION, MIN_BPM, MIN_DURATION } from '../constants/defaults';
import type { GenerationPreset } from '../constants/generationPresets';
import { useProjectStore } from './projectStore';
import { classifyGenerationError, type GenerationErrorCategory } from '../services/generationErrorClassifier';
import { loadAudioBlobByKey } from '../services/audioFileManager';
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
  errorCategory?: GenerationErrorCategory;
  error?: string;
  taskId?: string;
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

function buildClassifiedError(status: GenerationJob['status'], error?: string): { actionableMessage?: string; errorCategory?: GenerationErrorCategory } {
  if (status !== 'error') return {};
  const classified = classifyGenerationError(error);
  return {
    actionableMessage: classified.suggestion,
    errorCategory: classified.category,
  };
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
    ...buildClassifiedError(input.status, input.error),
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

export type GenerationHistoryStatus = GenerationJob['status'] | VariationStatus;

export interface GenerationHistoryRecord {
  id: string;
  clipId: string | null;
  trackId: string | null;
  trackName: string;
  prompt: string;
  model: string;
  duration: number;
  status: GenerationHistoryStatus;
  createdAt: number;
  updatedAt: number;
  startedAt?: number | null;
  completedAt?: number | null;
  taskId?: string;
  audioKey?: string | null;
  audioDuration?: number | null;
  error?: string;
}

export interface GenerationHistoryFilter {
  model?: string;
  search?: string;
  timeRange?: 'all' | '24h' | '7d' | '30d';
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
  /** Model used for this variation (cross-model comparison) */
  modelName?: string;
  /** LM model used for this variation */
  lmModelName?: string;
  /** Per-variation inference steps override */
  inferenceSteps?: number;
  /** Per-variation guidance scale override */
  guidanceScale?: number;
}

export interface ModelOverride {
  modelName: string;
  inferenceSteps?: number;
  guidanceScale?: number;
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
  inferenceSteps?: number;
  shift?: number;
  thinking?: boolean;
  seed?: string;
  useRandomSeed?: boolean;
  /** Comparison mode: 'cross-model' enables per-variation model switching */
  comparisonMode?: 'same-model' | 'cross-model';
  /** Per-variation model overrides for cross-model comparison */
  modelOverrides?: ModelOverride[];
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
  negativePrompt: string;
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
  inferenceSteps: number;
  guidanceScale: number;
  shift: number;
  thinking: boolean;
  seed: string;
  useRandomSeed: boolean;
  compareModelsEnabled: boolean;
  compareModelOverrides: ModelOverride[];
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

function clampInferenceSteps(value: number) {
  return Math.max(1, Math.min(200, Math.round(value)));
}

function clampGuidanceScale(value: number) {
  return Math.max(0, Math.min(20, Number(value.toFixed(1))));
}

function clampShift(value: number) {
  return Math.max(0, Math.min(10, Number(value.toFixed(1))));
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
    guidanceScale: params.guidanceScale != null ? clampGuidanceScale(params.guidanceScale) : clampTemperature(params.temperature ?? 0.7),
    temperature: clampTemperature(params.temperature ?? params.guidanceScale),
    styleTags: normalizeStyleTags(params.styleTags ?? []),
    lyrics: params.lyrics?.trim() || undefined,
    globalCaption: params.globalCaption?.trim() || undefined,
    presetId: params.presetId ?? fallbackPresetId ?? undefined,
    inferenceSteps: params.inferenceSteps != null ? clampInferenceSteps(params.inferenceSteps) : undefined,
    shift: params.shift != null ? clampShift(params.shift) : undefined,
    thinking: params.thinking,
    seed: params.seed,
    useRandomSeed: params.useRandomSeed,
    comparisonMode: params.comparisonMode,
    modelOverrides: params.modelOverrides,
  };
}

export function createDefaultGenerationFormState(): GenerationFormState {
  return {
    prompt: '',
    negativePrompt: '',
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
    inferenceSteps: DEFAULT_GENERATION.inferenceSteps,
    guidanceScale: DEFAULT_GENERATION.guidanceScale,
    shift: DEFAULT_GENERATION.shift,
    thinking: DEFAULT_GENERATION.thinking,
    seed: '',
    useRandomSeed: true,
    compareModelsEnabled: false,
    compareModelOverrides: [],
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

/** Draft state for the multi-track (Stems) generation form.
 *  Stored in the generation store so it survives component unmount/remount
 *  when switching between Mix and Stems tabs. */
export interface StemsFormDraft {
  globalCaption: string;
  rows: StemsFormDraftRow[];
  sharedSeed: number;
  audioDuration: number;
  durationAuto: boolean;
  useRandomSeed: boolean;
}

export interface StemsFormDraftRow {
  rowId: string;
  linkedTrackId: string | null;
  trackName: string;
  localDescription: string;
  lyrics: string;
  checked: boolean;
  firstClipId: string | null;
  hasExistingAudio: boolean;
}

export interface GenerationState {
  jobs: GenerationJob[];
  isGenerating: boolean;
  promptHistory: PromptHistoryEntry[];
  generationHistory: GenerationHistoryRecord[];
  previewingHistoryId: string | null;
  variationSession: VariationSession | null;
  generationForm: GenerationFormState;
  lastSubmittedRequest: SubmittedGenerationRequest | null;
  stemsFormDraft: StemsFormDraft | null;

  addJob: (job: GenerationJob) => void;
  updateJob: (jobId: string, updates: Partial<GenerationJob>) => void;
  removeJob: (jobId: string) => void;
  clearCompletedJobs: () => void;
  setIsGenerating: (v: boolean) => void;
  /** Atomically acquire the generation lock. Returns true if acquired, false if already held. */
  tryAcquireGenerationLock: () => boolean;
  addPromptToHistory: (prompt: string, meta?: Partial<Omit<PromptHistoryEntry, 'id' | 'prompt' | 'timestamp'>>) => void;
  clearPromptHistory: () => void;
  upsertGenerationHistoryRecord: (record: Omit<GenerationHistoryRecord, 'id'> & { id?: string }) => string;
  getGenerationHistoryRecords: (filters?: GenerationHistoryFilter) => GenerationHistoryRecord[];
  previewGenerationHistory: (recordId: string) => Promise<boolean>;
  stopGenerationHistoryPreview: () => void;
  placeGenerationHistoryOnTrack: (recordId: string, trackId: string, startTime: number) => string | null;
  hydrateGenerationForm: (updates: Partial<GenerationFormState>) => void;
  resetGenerationForm: () => void;
  setGenerationPrompt: (prompt: string) => void;
  setGenerationNegativePrompt: (negativePrompt: string) => void;
  setGenerationStyleTags: (tags: string[]) => void;
  toggleGenerationStyleTag: (tag: string) => void;
  setGenerationBpm: (bpm: number) => void;
  setGenerationKeyScale: (keyScale: string) => void;
  setGenerationLengthSeconds: (lengthSeconds: number) => void;
  setGenerationTemperature: (temperature: number) => void;
  setGenerationVariationCount: (variationCount: number) => void;
  setGenerationTargetTrack: (trackId: string) => void;
  setGenerationLyrics: (lyrics: string) => void;
  setGenerationInferenceSteps: (steps: number) => void;
  setGenerationGuidanceScale: (scale: number) => void;
  setGenerationShift: (shift: number) => void;
  setGenerationThinking: (thinking: boolean) => void;
  setGenerationSeed: (seed: string) => void;
  setGenerationUseRandomSeed: (useRandom: boolean) => void;
  setGenerationRequestError: (message: string | null) => void;
  applyGenerationPreset: (preset: GenerationPreset) => void;
  getPromptAutocompleteSuggestions: (prompt?: string, caretIndex?: number, limit?: number) => PromptAutocompleteSuggestion[];
  applyPromptAutocompleteSuggestion: (suggestion: string, caretIndex?: number) => AppliedPromptAutocompleteSuggestion | null;
  getGenerationValidationError: () => string | null;
  canSubmitGeneration: () => boolean;
  submitGenerationRequest: (context?: { globalCaption?: string | null }) => VariationSessionParams | null;

  setStemsFormDraft: (draft: StemsFormDraft) => void;
  clearStemsFormDraft: () => void;

  setCompareModelsEnabled: (enabled: boolean) => void;
  setCompareModelOverrides: (overrides: ModelOverride[]) => void;

  startVariationSession: (params: VariationSessionParams) => void;
  updateVariation: (index: number, updates: Partial<Omit<Variation, 'index'>>) => void;
  setActiveVariation: (index: number) => void;
  clearVariationSession: () => void;
  cancelVariationSession: () => void;
}

let activeHistoryPreviewAudio: HTMLAudioElement | null = null;
let activeHistoryPreviewUrl: string | null = null;

function stopActiveHistoryPreview() {
  activeHistoryPreviewAudio?.pause();
  activeHistoryPreviewAudio = null;
  if (activeHistoryPreviewUrl) {
    URL.revokeObjectURL(activeHistoryPreviewUrl);
    activeHistoryPreviewUrl = null;
  }
}

function matchesGenerationHistoryTimeRange(
  updatedAt: number,
  timeRange: GenerationHistoryFilter['timeRange'],
): boolean {
  if (!timeRange || timeRange === 'all') return true;
  const maxAgeMs = timeRange === '24h'
    ? 24 * 60 * 60 * 1000
    : timeRange === '7d'
      ? 7 * 24 * 60 * 60 * 1000
      : 30 * 24 * 60 * 60 * 1000;
  return (Date.now() - updatedAt) <= maxAgeMs;
}

function normalizeGenerationHistorySearch(search?: string): string[] {
  return search
    ?.toLowerCase()
    .split(/\s+/u)
    .map((token) => token.trim())
    .filter(Boolean)
    ?? [];
}

export const useGenerationStore = create<GenerationState>()(
  persist(
    (set, get) => ({
      jobs: [],
      isGenerating: false,
      promptHistory: [],
      generationHistory: [],
      previewingHistoryId: null,
      variationSession: null,
      generationForm: createDefaultGenerationFormState(),
      lastSubmittedRequest: null,
      stemsFormDraft: null,

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
      tryAcquireGenerationLock: () => {
        const state = get();
        if (state.isGenerating) return false;
        set({ isGenerating: true });
        return true;
      },

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

      upsertGenerationHistoryRecord: (record) => {
        const recordId = record.id ?? crypto.randomUUID();
        set((state) => {
          const existing = state.generationHistory.find((entry) => (
            (record.clipId && entry.clipId === record.clipId)
            || entry.id === recordId
          ));
          const nextRecord: GenerationHistoryRecord = existing
            ? {
                ...existing,
                ...record,
                id: existing.id,
                createdAt: existing.createdAt,
                updatedAt: record.updatedAt ?? Date.now(),
              }
            : {
                ...record,
                id: recordId,
                clipId: record.clipId ?? null,
                trackId: record.trackId ?? null,
                trackName: record.trackName,
                prompt: record.prompt,
                model: record.model,
                duration: record.duration,
                status: record.status,
                createdAt: record.createdAt,
                updatedAt: record.updatedAt ?? record.createdAt,
                startedAt: record.startedAt ?? null,
                completedAt: record.completedAt ?? null,
                taskId: record.taskId,
                audioKey: record.audioKey ?? null,
                audioDuration: record.audioDuration ?? null,
                error: record.error,
              };
          const nextHistory = existing
            ? state.generationHistory.map((entry) => (entry.id === existing.id ? nextRecord : entry))
            : [nextRecord, ...state.generationHistory];

          nextHistory.sort((a, b) => b.updatedAt - a.updatedAt);
          return { generationHistory: nextHistory };
        });
        return get().generationHistory.find((entry) => entry.clipId === record.clipId || entry.id === recordId)?.id ?? recordId;
      },

      getGenerationHistoryRecords: (filters = {}) => {
        const searchTokens = normalizeGenerationHistorySearch(filters.search);
        return get().generationHistory.filter((entry) => {
          if (filters.model && filters.model !== 'all' && entry.model !== filters.model) return false;
          if (!matchesGenerationHistoryTimeRange(entry.updatedAt, filters.timeRange ?? 'all')) return false;
          if (searchTokens.length === 0) return true;
          const haystack = `${entry.prompt} ${entry.model} ${entry.trackName} ${entry.status}`.toLowerCase();
          return searchTokens.every((token) => haystack.includes(token));
        });
      },

      previewGenerationHistory: async (recordId) => {
        const record = get().generationHistory.find((entry) => entry.id === recordId);
        if (!record?.audioKey) return false;

        stopActiveHistoryPreview();
        const blob = await loadAudioBlobByKey(record.audioKey);
        if (!blob) return false;

        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        activeHistoryPreviewUrl = url;
        activeHistoryPreviewAudio = audio;
        audio.addEventListener('ended', () => {
          stopActiveHistoryPreview();
          set({ previewingHistoryId: null });
        }, { once: true });
        await audio.play();
        set({ previewingHistoryId: recordId });
        return true;
      },

      stopGenerationHistoryPreview: () => {
        stopActiveHistoryPreview();
        set({ previewingHistoryId: null });
      },

      placeGenerationHistoryOnTrack: (recordId, trackId, startTime) => {
        const state = get();
        const record = state.generationHistory.find((entry) => entry.id === recordId);
        const projectStore = useProjectStore.getState();
        const track = projectStore.project?.tracks.find((candidate) => candidate.id === trackId);
        if (!record?.audioKey || !track) return null;
        if (track.trackType === 'pianoRoll' || track.trackType === 'sequencer' || track.trackType === 'drumMachine') {
          return null;
        }

        const clip = projectStore.addClip(trackId, {
          startTime,
          duration: record.duration,
          prompt: record.prompt,
          globalCaption: '',
          lyrics: '',
          source: 'generated',
        });
        projectStore.updateClipStatus(clip.id, 'ready', {
          isolatedAudioKey: record.audioKey,
          audioDuration: record.audioDuration ?? record.duration,
        });
        return clip.id;
      },

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

      setGenerationNegativePrompt: (negativePrompt) => set((s) => ({
        generationForm: {
          ...s.generationForm,
          negativePrompt,
          requestError: null,
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
        generationForm: { ...s.generationForm, lyrics, requestError: null },
      })),

      setGenerationInferenceSteps: (steps) => set((s) => ({
        generationForm: { ...s.generationForm, inferenceSteps: clampInferenceSteps(steps), requestError: null },
      })),

      setGenerationGuidanceScale: (scale) => set((s) => ({
        generationForm: { ...s.generationForm, guidanceScale: clampGuidanceScale(scale), requestError: null },
      })),

      setGenerationShift: (shift) => set((s) => ({
        generationForm: { ...s.generationForm, shift: clampShift(shift), requestError: null },
      })),

      setGenerationThinking: (thinking) => set((s) => ({
        generationForm: { ...s.generationForm, thinking, requestError: null },
      })),

      setGenerationSeed: (seed) => set((s) => ({
        generationForm: { ...s.generationForm, seed, requestError: null },
      })),

      setGenerationUseRandomSeed: (useRandom) => set((s) => ({
        generationForm: { ...s.generationForm, useRandomSeed: useRandom, requestError: null },
      })),

      setStemsFormDraft: (draft) => set({ stemsFormDraft: draft }),
      clearStemsFormDraft: () => set({ stemsFormDraft: null }),

      setCompareModelsEnabled: (enabled) => set((s) => ({
        generationForm: { ...s.generationForm, compareModelsEnabled: enabled, requestError: null },
      })),

      setCompareModelOverrides: (overrides) => set((s) => ({
        generationForm: { ...s.generationForm, compareModelOverrides: overrides, requestError: null },
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
          guidanceScale: generationForm.guidanceScale,
          temperature: generationForm.temperature,
          styleTags: generationForm.styleTags,
          lyrics: generationForm.lyrics.trim() || undefined,
          globalCaption: context?.globalCaption?.trim() || undefined,
          presetId: generationForm.presetId ?? undefined,
          inferenceSteps: generationForm.inferenceSteps,
          shift: generationForm.shift,
          thinking: generationForm.thinking,
          seed: generationForm.useRandomSeed ? undefined : generationForm.seed || undefined,
          useRandomSeed: generationForm.useRandomSeed,
          ...(generationForm.compareModelsEnabled && generationForm.compareModelOverrides.length > 0
            ? {
                comparisonMode: 'cross-model' as const,
                modelOverrides: generationForm.compareModelOverrides,
              }
            : {}),
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
        generationHistory: state.generationHistory,
        generationForm: state.generationForm,
      }),
    },
  ),
);
