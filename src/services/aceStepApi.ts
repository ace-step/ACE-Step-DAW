import type {
  LegoTaskParams,
  CoverTaskParams,
  RepaintTaskParams,
  StemSeparationTaskParams,
  ApiEnvelope,
  ReleaseTaskResponse,
  TaskResultEntry,
  ModelsListResponse,
  StatsResponse,
  InitModelRequest,
  InitModelResponse,
} from '../types/api';

export type AceStepTaskParams =
  | LegoTaskParams
  | CoverTaskParams
  | RepaintTaskParams
  | StemSeparationTaskParams;
import { downsampleWavBlob } from '../utils/audioDownsample';
import { createDebugLogger } from '../utils/debugLogger';

const BACKEND_URL_KEY = 'ace-step-daw-backend-url';
const HEALTH_CHECK_MIN_RETRY_DELAY_MS = 30_000;
const HEALTH_CHECK_MAX_RETRY_DELAY_MS = 5 * 60 * 1000;

let healthCheckRetryDelayMs = 0;
let healthCheckBlockedUntil = 0;
const logger = createDebugLogger('ace-step:api');

function resetHealthCheckBackoff() {
  healthCheckRetryDelayMs = 0;
  healthCheckBlockedUntil = 0;
}

function scheduleNextHealthCheckRetry(now: number) {
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

export async function healthCheck(): Promise<boolean> {
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
 * Check whether the currently loaded (or default) model supports a given task type.
 * Uses the cached model inventory from the last `listModels()` call.
 * Returns true if the information is unavailable (optimistic fallback).
 */
export function modelSupportsTaskType(taskType: string): boolean {
  if (!_cachedInventory) return true;
  const loaded = _cachedInventory.models.find((m) => m.is_loaded);
  if (!loaded) return true;
  if (!loaded.supported_task_types || loaded.supported_task_types.length === 0) return true;
  return loaded.supported_task_types.includes(taskType);
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

async function releaseTask(
  srcAudioBlob: Blob,
  params: AceStepTaskParams,
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
    for (const [key, value] of Object.entries(params)) {
      if (value === null || value === undefined) continue;
      formData.append(key, String(value));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RELEASE_TASK_TIMEOUT_MS);

    try {
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
    }
  }

  throw lastError ?? new Error('releaseTask failed after retries');
}

export async function releaseLegoTask(
  srcAudioBlob: Blob,
  params: LegoTaskParams | CoverTaskParams | RepaintTaskParams,
): Promise<ReleaseTaskResponse> {
  return releaseTask(srcAudioBlob, params);
}

export async function releaseStemSeparationTask(
  srcAudioBlob: Blob,
  params: StemSeparationTaskParams,
): Promise<ReleaseTaskResponse> {
  return releaseTask(srcAudioBlob, params);
}

export async function queryResult(taskIds: string[]): Promise<TaskResultEntry[]> {
  const base = getApiBase();
  const res = await fetch(`${base}/query_result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id_list: taskIds }),
  });

  if (!res.ok) throw new Error(`queryResult failed: ${res.status}`);
  const envelope: ApiEnvelope<TaskResultEntry[]> = await res.json();
  return envelope.data;
}

const DOWNLOAD_AUDIO_TIMEOUT_MS = 3 * 60 * 1000;
const DOWNLOAD_AUDIO_MAX_RETRIES = 3;

export async function downloadAudio(audioPath: string): Promise<Blob> {
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
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_AUDIO_TIMEOUT_MS);

    try {
      if (attempt > 1) {
        logger.warn(`downloadAudio retry ${attempt}/${DOWNLOAD_AUDIO_MAX_RETRIES}`);
      }
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`downloadAudio failed: ${res.status} ${res.statusText}`);
      return await res.blob();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
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
    }
  }

  throw lastError ?? new Error('downloadAudio failed after retries');
}
