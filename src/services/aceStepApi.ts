import type {
  LegoTaskParams,
  ApiEnvelope,
  ReleaseTaskResponse,
  TaskResultEntry,
  ModelsListResponse,
  StatsResponse,
  InitModelRequest,
  InitModelResponse,
} from '../types/api';
import { downsampleWavBlob } from '../utils/audioDownsample';

const BACKEND_URL_KEY = 'ace-step-daw-backend-url';

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
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBase()}/health`);
    return res.ok;
  } catch {
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
  return {
    models: Array.isArray(data?.models) ? data.models : [],
    default_model: data?.default_model ?? null,
    lm_models: Array.isArray(data?.lm_models) ? data.lm_models : [],
    loaded_lm_model: data?.loaded_lm_model ?? null,
    llm_initialized: Boolean(data?.llm_initialized),
  };
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

export async function releaseLegoTask(
  srcAudioBlob: Blob,
  params: LegoTaskParams,
): Promise<ReleaseTaskResponse> {
  const base = getApiBase();

  const usePath = Boolean(params.src_audio_path);

  console.log(
    `[aceStepApi] releaseLegoTask: ${usePath ? `src_audio_path=${params.src_audio_path}` : `src_audio blob size=${srcAudioBlob.size}`}`,
    `task_type=${params.task_type}`,
    `audio_duration=${params.audio_duration}`,
    `repainting_start=${params.repainting_start}`,
    `repainting_end=${params.repainting_end}`,
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
        console.warn(`[aceStepApi] releaseLegoTask retry ${attempt}/${RELEASE_TASK_MAX_RETRIES}`);
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

      console.error(
        `[aceStepApi] releaseLegoTask attempt ${attempt} failed:`,
        lastError.message,
      );

      if (!isRetryable || attempt === RELEASE_TASK_MAX_RETRIES) break;

      const delay = Math.min(2000 * attempt, 6000);
      await new Promise((r) => setTimeout(r, delay));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error('releaseLegoTask failed after retries');
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
        console.warn(`[aceStepApi] downloadAudio retry ${attempt}/${DOWNLOAD_AUDIO_MAX_RETRIES}`);
      }
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`downloadAudio failed: ${res.status} ${res.statusText}`);
      return await res.blob();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[aceStepApi] downloadAudio attempt ${attempt} failed:`, lastError.message);

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
