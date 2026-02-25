import type {
  LegoTaskParams,
  ApiEnvelope,
  ReleaseTaskResponse,
  TaskResultEntry,
  ModelsListResponse,
  StatsResponse,
} from '../types/api';

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
  const res = await fetch(`${base}/v1/models`);
  if (!res.ok) throw new Error(`listModels failed: ${res.status}`);
  const json = await res.json();
  const data = (json as ApiEnvelope<ModelsListResponse>).data;
  return {
    models: Array.isArray(data?.models) ? data.models : [],
    default_model: data?.default_model ?? null,
  };
}

export async function getStats(): Promise<StatsResponse> {
  const base = getApiBase();
  const res = await fetch(`${base}/v1/stats`);
  if (!res.ok) throw new Error(`getStats failed: ${res.status}`);
  const envelope: ApiEnvelope<StatsResponse> = await res.json();
  return envelope.data;
}

export async function releaseLegoTask(
  srcAudioBlob: Blob,
  params: LegoTaskParams,
): Promise<ReleaseTaskResponse> {
  const base = getApiBase();
  const formData = new FormData();

  formData.append('src_audio', srcAudioBlob, 'src_audio.wav');

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    formData.append(key, String(value));
  }

  const res = await fetch(`${base}/release_task`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`releaseLegoTask failed: ${res.status} - ${text}`);
  }

  const envelope: ApiEnvelope<ReleaseTaskResponse> = await res.json();
  return envelope.data;
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

export async function downloadAudio(audioPath: string): Promise<Blob> {
  const base = getApiBase();
  // The file field from query_result is typically a URL like
  // "/v1/audio?path=%2FUsers%2F..." — use it directly.
  // Or it may be a bare filesystem path — construct the URL ourselves.
  let url: string;
  if (audioPath.startsWith('/v1/')) {
    url = `${base}${audioPath}`;
  } else {
    url = `${base}/v1/audio?path=${encodeURIComponent(audioPath)}`;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`downloadAudio failed: ${res.status} ${res.statusText}`);
  return res.blob();
}
