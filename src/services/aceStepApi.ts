import type {
  LegoTaskParams,
  Text2MusicTaskParams,
  CoverTaskParams,
  RepaintTaskParams,
  StemSeparationTaskParams,
  AiMixTaskParams,
  MidiGenerationTaskParams,
  ChordGenerationTaskParams,
  AiTaskParams,
  ApiEnvelope,
  ReleaseTaskResponse,
  TaskResultEntry,
  ModelsListResponse,
  StatsResponse,
  InitModelRequest,
  InitModelResponse,
  ModelCategory,
  CreateSampleRequest,
  CreateSampleResponse,
  TrainModelRequest,
  TrainModelResponse,
  TrainingJobStatusResponse,
  UploadTrainingTrackResponse,
  VerificationPhraseResponse,
  VoiceVerificationResponse,
} from '../types/api';

/** @deprecated Use AiTaskParams instead */
export type AceStepTaskParams =
  | LegoTaskParams
  | Text2MusicTaskParams
  | CoverTaskParams
  | RepaintTaskParams
  | StemSeparationTaskParams
  | AiMixTaskParams
  | MidiGenerationTaskParams
  | ChordGenerationTaskParams;

export type { AiTaskParams };
import { downsampleWavBlob } from '../utils/audioDownsample';
import { createDebugLogger } from '../utils/debugLogger';

const BACKEND_URL_KEY = 'ace-step-daw-backend-url';
const HEALTH_CHECK_MIN_RETRY_DELAY_MS = 30_000;
const HEALTH_CHECK_MAX_RETRY_DELAY_MS = 5 * 60 * 1000;

const HEALTH_CHECK_MAX_CONSECUTIVE_FAILURES = 5;

let healthCheckRetryDelayMs = 0;
let healthCheckBlockedUntil = 0;
let healthCheckConsecutiveFailures = 0;
let healthCheckStopped = false;
const logger = createDebugLogger('ace-step:api');

function resetHealthCheckBackoff() {
  healthCheckRetryDelayMs = 0;
  healthCheckBlockedUntil = 0;
  healthCheckConsecutiveFailures = 0;
  healthCheckStopped = false;
}

function scheduleNextHealthCheckRetry(now: number) {
  healthCheckConsecutiveFailures++;
  if (healthCheckConsecutiveFailures >= HEALTH_CHECK_MAX_CONSECUTIVE_FAILURES) {
    healthCheckStopped = true;
    logger.info(`Health check stopped after ${healthCheckConsecutiveFailures} consecutive failures`);
    return;
  }
  healthCheckRetryDelayMs = healthCheckRetryDelayMs > 0
    ? Math.min(healthCheckRetryDelayMs * 2, HEALTH_CHECK_MAX_RETRY_DELAY_MS)
    : HEALTH_CHECK_MIN_RETRY_DELAY_MS;
  healthCheckBlockedUntil = now + healthCheckRetryDelayMs;
}

/**
 * Resolve the API base URL.
 * - If the user configured a direct backend URL in settings, use it.
 * - Otherwise fall back to `/api` which goes through the Vite dev proxy.
 */
function getApiBase(): string {
  const custom = localStorage.getItem(BACKEND_URL_KEY);
  if (custom && custom.trim()) {
    return custom.trim().replace(/\/+$/, '');
  }
  return '/api';
}

export function getBackendUrl(): string {
  return localStorage.getItem(BACKEND_URL_KEY) || '';
}

export function setBackendUrl(url: string): void {
  if (url.trim()) {
    localStorage.setItem(BACKEND_URL_KEY, url.trim());
  } else {
    localStorage.removeItem(BACKEND_URL_KEY);
  }
  resetHealthCheckBackoff();
}

/** Whether health polling has been permanently stopped due to repeated failures. */
export function isHealthCheckStopped(): boolean {
  return healthCheckStopped;
}

export async function healthCheck(): Promise<boolean> {
  if (healthCheckStopped) {
    return false;
  }
  const now = Date.now();
  if (healthCheckBlockedUntil > now) {
    return false;
  }

  try {
    const res = await fetch(`${getApiBase()}/health`);
    if (res.ok) {
      resetHealthCheckBackoff();
      return true;
    }

    scheduleNextHealthCheckRetry(now);
    return false;
  } catch {
    scheduleNextHealthCheckRetry(now);
    return false;
  }
}

export async function listModels(): Promise<ModelsListResponse> {
  const base = getApiBase();
  let res = await fetch(`${base}/v1/model_inventory`);
  if (!res.ok) {
    // Backward compatibility: older backends only provide /v1/models.
    res = await fetch(`${base}/v1/models`);
  }
  if (!res.ok) throw new Error(`listModels failed: ${res.status}`);
  const json = await res.json();
  const envelopeData = (json as ApiEnvelope<ModelsListResponse>).data;
  const openRouterData = Array.isArray((json as { data?: unknown[] })?.data)
    ? (json as { data: Array<{ id?: string }> }).data
    : null;

  if (openRouterData && !envelopeData?.models) {
    const names = openRouterData
      .map((m) => (m.id || '').trim())
      .filter(Boolean);
    const uniqueNames = Array.from(new Set(names));
    return {
      models: uniqueNames.map((name, index) => ({
        name,
        is_default: index === 0,
        is_loaded: true,
      })),
      default_model: uniqueNames[0] ?? null,
      lm_models: [],
      loaded_lm_model: null,
      llm_initialized: false,
    };
  }

  const data = envelopeData;
  const result: ModelsListResponse = {
    models: Array.isArray(data?.models) ? data.models : [],
    default_model: data?.default_model ?? null,
    lm_models: Array.isArray(data?.lm_models) ? data.lm_models : [],
    loaded_lm_model: data?.loaded_lm_model ?? null,
    llm_initialized: Boolean(data?.llm_initialized),
  };
  _cachedInventory = result;
  return result;
}

let _cachedInventory: ModelsListResponse | null = null;

/**
 * Check whether the model inventory has been fetched from the server.
 */
export function isModelInventoryLoaded(): boolean {
  return _cachedInventory !== null;
}

/**
 * Check whether any model is currently loaded on the server.
 */
export function isModelReady(): boolean {
  if (!_cachedInventory) return false;
  return _cachedInventory.models.some((m) => m.is_loaded);
}

/**
 * Check whether the currently loaded (or default) model supports a given task type.
 * Uses the cached model inventory from the last `listModels()` call.
 * Returns false if no inventory is cached or no model is loaded — callers should
 * show appropriate guidance instead of silently enabling unsupported actions.
 */
export function modelSupportsTaskType(taskType: string): boolean {
  if (!_cachedInventory) return false;
  const loaded = _cachedInventory.models.find((m) => m.is_loaded);
  if (!loaded) return false;
  // If model has no task type metadata, assume it supports everything (backward compat)
  if (!loaded.supported_task_types || loaded.supported_task_types.length === 0) return true;
  return loaded.supported_task_types.includes(taskType);
}

/**
 * Infer a model's category from its metadata.
 * Priority: explicit `category` field → heuristic from `supported_task_types`.
 */
export function inferModelCategory(model: { category?: ModelCategory; supported_task_types?: string[]; name?: string }): ModelCategory {
  if (model.category) return model.category;
  // Name heuristic is checked before task types: base models all return both
  // text2music and lego in supported_task_types, so the name is the only
  // reliable signal to distinguish a dedicated lego model from a text2music one.
  if (model.name?.toLowerCase().includes('lego')) return 'lego';
  if (model.supported_task_types?.includes('lego') && !model.supported_task_types?.includes('text2music')) return 'lego';
  return 'text2music';
}

/** Return the cached model inventory, if available. */
export function getCachedInventory(): ModelsListResponse | null {
  return _cachedInventory;
}

/**
 * Simple mode "Create Sample" — sends a short description to the LM
 * which infers full song metadata (caption, lyrics, BPM, key, duration, etc.).
 */
export async function createSample(req: CreateSampleRequest): Promise<CreateSampleResponse> {
  const base = getApiBase();
  const res = await fetch(`${base}/v1/create_sample`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`createSample failed: ${res.status} - ${text}`);
  }
  const envelope: ApiEnvelope<CreateSampleResponse> = await res.json();
  return envelope.data;
}

/** Fetch a random pre-loaded example (custom mode). */
export interface RandomSampleResponse {
  think?: boolean;
  caption?: string;
  lyrics?: string;
  bpm?: number;
  duration?: number;
  keyscale?: string;
  language?: string;
  timesignature?: string;
}

export async function createRandomSample(sampleType: 'simple_mode' | 'custom_mode' = 'custom_mode'): Promise<RandomSampleResponse> {
  const base = getApiBase();
  const res = await fetch(`${base}/create_random_sample`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sample_type: sampleType }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`createRandomSample failed: ${res.status} - ${text}`);
  }
  const envelope: ApiEnvelope<RandomSampleResponse> = await res.json();
  return envelope.data;
}

/** Format/enhance input — LM refines prompt, lyrics, and infers metadata. */
export interface FormatInputRequest {
  prompt: string;
  lyrics: string;
  language?: string;
  bpm?: number;
  duration?: number;
  key_scale?: string;
  time_signature?: string;
}

export interface FormatInputResponse {
  caption: string;
  lyrics: string;
  bpm?: number;
  key_scale?: string;
  time_signature?: string;
  duration?: number;
  vocal_language?: string;
}

export async function formatInput(req: FormatInputRequest): Promise<FormatInputResponse> {
  const base = getApiBase();
  const paramObj: Record<string, unknown> = {};
  if (req.language) paramObj.language = req.language;
  if (req.bpm) paramObj.bpm = req.bpm;
  if (req.duration) paramObj.duration = req.duration;
  if (req.key_scale) paramObj.key = req.key_scale;
  if (req.time_signature) paramObj.time_signature = req.time_signature;

  const res = await fetch(`${base}/format_input`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: req.prompt,
      lyrics: req.lyrics,
      param_obj: JSON.stringify(paramObj),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`formatInput failed: ${res.status} - ${text}`);
  }
  const envelope: ApiEnvelope<FormatInputResponse> = await res.json();
  return envelope.data;
}

export async function initModel(req: InitModelRequest): Promise<InitModelResponse> {
  const base = getApiBase();
  const res = await fetch(`${base}/v1/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`initModel failed: ${res.status} - ${text}`);
  }
  const envelope: ApiEnvelope<InitModelResponse> = await res.json();
  return envelope.data;
}

export async function getStats(): Promise<StatsResponse> {
  const base = getApiBase();
  const res = await fetch(`${base}/v1/stats`);
  if (!res.ok) throw new Error(`getStats failed: ${res.status}`);
  const envelope: ApiEnvelope<StatsResponse> = await res.json();
  return envelope.data;
}

const RELEASE_TASK_TIMEOUT_MS = 3 * 60 * 1000;
const RELEASE_TASK_MAX_RETRIES = 3;

interface ApiRequestOptions {
  signal?: AbortSignal;
  referenceAudioBlob?: Blob;
}

function getUploadFileName(blob: Blob, fallbackBaseName: string): string {
  if (typeof File !== 'undefined' && blob instanceof File && blob.name.trim()) {
    return blob.name;
  }

  const extensionByType: Record<string, string> = {
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/flac': 'flac',
    'audio/x-flac': 'flac',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
  };
  const mimeType = blob.type.toLowerCase().split(';', 1)[0].trim();
  const extension = extensionByType[mimeType] ?? 'bin';
  return `${fallbackBaseName}.${extension}`;
}

async function releaseTask(
  srcAudioBlob: Blob,
  params: AceStepTaskParams,
  options?: ApiRequestOptions,
): Promise<ReleaseTaskResponse> {
  const base = getApiBase();

  const taskParams = params as Partial<LegoTaskParams>;
  const usePath = Boolean(taskParams.src_audio_path);

  logger.debug(
    `[aceStepApi] releaseTask: ${usePath ? `src_audio_path=${taskParams.src_audio_path}` : `src_audio blob size=${srcAudioBlob.size}`}`,
    `task_type=${params.task_type}`,
    'audio_duration' in params ? `audio_duration=${params.audio_duration}` : 'audio_duration=n/a',
    'repainting_start' in taskParams ? `repainting_start=${taskParams.repainting_start}` : 'repainting_start=n/a',
    'repainting_end' in taskParams ? `repainting_end=${taskParams.repainting_end}` : 'repainting_end=n/a',
  );

  // Only downsample and upload the blob when no server-side path is provided.
  const uploadBlob = usePath ? null : await downsampleWavBlob(srcAudioBlob);

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= RELEASE_TASK_MAX_RETRIES; attempt++) {
    const formData = new FormData();
    if (uploadBlob) {
      formData.append('src_audio', uploadBlob, 'src_audio.wav');
    }
    if (options?.referenceAudioBlob) {
      formData.append(
        'reference_audio',
        options.referenceAudioBlob,
        getUploadFileName(options.referenceAudioBlob, 'reference_audio'),
      );
    }
    for (const [key, value] of Object.entries(params)) {
      if (value === null || value === undefined) continue;
      formData.append(key, String(value));
    }

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    options?.signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), RELEASE_TASK_TIMEOUT_MS);

    try {
      if (options?.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      if (attempt > 1) {
        logger.warn(`releaseLegoTask retry ${attempt}/${RELEASE_TASK_MAX_RETRIES}`);
      }

      const res = await fetch(`${base}/release_task`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`releaseLegoTask failed: ${res.status} - ${text}`);
      }

      const envelope: ApiEnvelope<ReleaseTaskResponse> = await res.json();
      return envelope.data;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (options?.signal?.aborted) {
        throw lastError;
      }

      const isRetryable =
        lastError.name === 'AbortError' ||
        lastError.name === 'TypeError' ||
        lastError.message.includes('Failed to fetch') ||
        lastError.message.includes('network');

      logger.error(`releaseLegoTask attempt ${attempt} failed:`, lastError.message);

      if (!isRetryable || attempt === RELEASE_TASK_MAX_RETRIES) break;

      const delay = Math.min(2000 * attempt, 6000);
      await new Promise((r) => setTimeout(r, delay));
    } finally {
      clearTimeout(timer);
      options?.signal?.removeEventListener('abort', onAbort);
    }
  }

  throw lastError ?? new Error('releaseTask failed after retries');
}

export async function releaseLegoTask(
  srcAudioBlob: Blob,
  params: LegoTaskParams | Text2MusicTaskParams | CoverTaskParams | RepaintTaskParams,
  options?: ApiRequestOptions,
): Promise<ReleaseTaskResponse> {
  return releaseTask(srcAudioBlob, params, options);
}

export async function releaseStemSeparationTask(
  srcAudioBlob: Blob,
  params: StemSeparationTaskParams,
  options?: ApiRequestOptions,
): Promise<ReleaseTaskResponse> {
  return releaseTask(srcAudioBlob, params, options);
}

export async function queryResult(taskIds: string[], options?: ApiRequestOptions): Promise<TaskResultEntry[]> {
  const base = getApiBase();
  const res = await fetch(`${base}/query_result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id_list: taskIds }),
    signal: options?.signal,
  });

  if (!res.ok) throw new Error(`queryResult failed: ${res.status}`);
  const envelope: ApiEnvelope<TaskResultEntry[]> = await res.json();
  return envelope.data;
}

const DOWNLOAD_AUDIO_TIMEOUT_MS = 3 * 60 * 1000;
const DOWNLOAD_AUDIO_MAX_RETRIES = 3;

export async function downloadAudio(audioPath: string, options?: ApiRequestOptions): Promise<Blob> {
  const base = getApiBase();
  let url: string;
  if (audioPath.startsWith('/v1/')) {
    url = `${base}${audioPath}`;
  } else {
    url = `${base}/v1/audio?path=${encodeURIComponent(audioPath)}`;
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= DOWNLOAD_AUDIO_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    options?.signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_AUDIO_TIMEOUT_MS);

    try {
      if (options?.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      if (attempt > 1) {
        logger.warn(`downloadAudio retry ${attempt}/${DOWNLOAD_AUDIO_MAX_RETRIES}`);
      }
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`downloadAudio failed: ${res.status} ${res.statusText}`);
      return await res.blob();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (options?.signal?.aborted) {
        throw lastError;
      }

      logger.error(`downloadAudio attempt ${attempt} failed:`, lastError.message);

      const isRetryable =
        lastError.name === 'AbortError' ||
        lastError.name === 'TypeError' ||
        lastError.message.includes('Failed to fetch');

      if (!isRetryable || attempt === DOWNLOAD_AUDIO_MAX_RETRIES) break;

      const delay = Math.min(2000 * attempt, 6000);
      await new Promise((r) => setTimeout(r, delay));
    } finally {
      clearTimeout(timer);
      options?.signal?.removeEventListener('abort', onAbort);
    }
  }

  throw lastError ?? new Error('downloadAudio failed after retries');
}

// ---------------------------------------------------------------------------
// Custom Model Fine-Tuning API (#1089)
// ---------------------------------------------------------------------------

/** Upload a reference track for model fine-tuning */
export async function uploadTrainingTrack(file: File): Promise<UploadTrainingTrackResponse> {
  const base = getApiBase();
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${base}/v1/training/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`uploadTrainingTrack failed: ${res.status} - ${text}`);
  }
  const envelope: ApiEnvelope<UploadTrainingTrackResponse> = await res.json();
  return envelope.data;
}

/** Submit a training job to fine-tune a custom model */
export async function submitTrainingJob(req: TrainModelRequest): Promise<TrainModelResponse> {
  const base = getApiBase();
  const res = await fetch(`${base}/v1/training/train`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`submitTrainingJob failed: ${res.status} - ${text}`);
  }
  const envelope: ApiEnvelope<TrainModelResponse> = await res.json();
  return envelope.data;
}

/** Poll training job status */
export async function queryTrainingStatus(jobId: string): Promise<TrainingJobStatusResponse> {
  const base = getApiBase();
  const res = await fetch(`${base}/v1/training/status/${encodeURIComponent(jobId)}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`queryTrainingStatus failed: ${res.status} - ${text}`);
  }
  const envelope: ApiEnvelope<TrainingJobStatusResponse> = await res.json();
  return envelope.data;
}

/** Delete a custom model from the server */
export async function deleteCustomModel(modelId: string): Promise<void> {
  const base = getApiBase();
  const res = await fetch(`${base}/v1/training/models/${encodeURIComponent(modelId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`deleteCustomModel failed: ${res.status} - ${text}`);
  }
}

/** List all custom models */
export async function listCustomModels(): Promise<CustomModelListResponse> {
  const base = getApiBase();
  const res = await fetch(`${base}/v1/training/models`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`listCustomModels failed: ${res.status} - ${text}`);
  }
  const envelope: ApiEnvelope<CustomModelListResponse> = await res.json();
  return envelope.data;
}

export interface CustomModelListResponse {
  models: Array<{
    id: string;
    name: string;
    description: string;
    track_count: number;
    style_tags: string[];
    trained_at: number;
    model_path: string;
    training_job_id: string;
  }>;
}

// ---------------------------------------------------------------------------
// Voice Identity Verification API (#1096)
// ---------------------------------------------------------------------------

/** Request a random verification phrase from the backend */
export async function getVerificationPhrase(language: string = 'en'): Promise<VerificationPhraseResponse> {
  const base = getApiBase();
  const res = await fetch(`${base}/v1/voice/verification_phrase?language=${encodeURIComponent(language)}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`getVerificationPhrase failed: ${res.status} - ${text}`);
  }
  const envelope: ApiEnvelope<VerificationPhraseResponse> = await res.json();
  return envelope.data;
}

/** Submit reference audio + spoken phrase for voice identity comparison */
export async function verifyVoiceIdentity(
  referenceAudio: Blob,
  spokenPhrase: Blob,
  phraseId: string,
): Promise<VoiceVerificationResponse> {
  const base = getApiBase();
  const formData = new FormData();
  formData.append('reference_audio', referenceAudio, 'reference.wav');
  formData.append('spoken_phrase', spokenPhrase, 'spoken.wav');
  formData.append('phrase_id', phraseId);

  const res = await fetch(`${base}/v1/voice/verify`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`verifyVoiceIdentity failed: ${res.status} - ${text}`);
  }
  const envelope: ApiEnvelope<VoiceVerificationResponse> = await res.json();
  return envelope.data;
}
