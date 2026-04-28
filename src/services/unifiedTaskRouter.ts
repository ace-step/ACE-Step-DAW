/**
 * Unified AI Task Router (#741)
 *
 * Single entry point for routing AI tasks to the correct backend endpoint.
 * Eliminates duplicated getApiBase() across individual services and provides:
 * - Task type → endpoint mapping
 * - Task type → capability mapping (for health/availability checks)
 * - Per-provider health checks
 */
import type { ModelCapability, AiTaskType, AiTaskParams, ApiEnvelope } from '../types/api';
import { getBackendUrl } from './aceStepApi';

// ---------------------------------------------------------------------------
// API Base URL (shared — replaces duplicated getApiBase in each service)
// ---------------------------------------------------------------------------

/**
 * Resolve the API base URL. Shared across all AI service modules.
 * - If the user configured a direct backend URL in settings, use it.
 * - Otherwise fall back to `/api` which goes through the Vite dev proxy.
 */
export function getApiBaseUrl(): string {
  const custom = getBackendUrl();
  if (custom && custom.trim()) {
    return custom.trim().replace(/\/+$/, '');
  }
  return '/api';
}

// ---------------------------------------------------------------------------
// Task Type → Capability Mapping
// ---------------------------------------------------------------------------

/** Maps each task_type to its ModelCapability for routing and health checks. */
export const TASK_TYPE_TO_CAPABILITY: Record<AiTaskType, ModelCapability> = {
  lego: 'music_generation',
  text2music: 'music_generation',
  cover: 'music_generation',
  repaint: 'music_generation',
  stem_separation: 'stem_separation',
  ai_mix: 'ai_mixing',
  midi_generate: 'midi_generation',
  chord_generate: 'chord_generation',
};

// ---------------------------------------------------------------------------
// Task Type → Endpoint Mapping
// ---------------------------------------------------------------------------

/** Maps each task_type to its backend API endpoint. */
const TASK_TYPE_TO_ENDPOINT: Record<AiTaskType, string> = {
  lego: '/release_task',
  text2music: '/release_task',
  cover: '/release_task',
  repaint: '/release_task',
  stem_separation: '/release_task',
  ai_mix: '/v1/ai-mix/analyze',
  midi_generate: '/v1/midi/generate',
  chord_generate: '/v1/chords/generate',
};

/**
 * Get the backend endpoint path for a given task type.
 */
export function getEndpointForTaskType(taskType: AiTaskType): string {
  return TASK_TYPE_TO_ENDPOINT[taskType];
}

// ---------------------------------------------------------------------------
// Health Check Endpoints per Capability
// ---------------------------------------------------------------------------

const CAPABILITY_HEALTH_ENDPOINTS: Record<ModelCapability, string> = {
  music_generation: '/health',
  stem_separation: '/health',
  ai_mixing: '/v1/ai-mix/health',
  midi_generation: '/v1/midi/health',
  chord_generation: '/v1/chords/health',
  lm_reasoning: '/health',
};

// ---------------------------------------------------------------------------
// Provider Health Check
// ---------------------------------------------------------------------------

export interface ProviderHealthResult {
  capability: ModelCapability;
  status: 'healthy' | 'unavailable' | 'error';
  lastChecked: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/**
 * Thrown when a task cannot be submitted because the required provider
 * is known to be unavailable. Callers can check `capability` and show
 * targeted guidance (e.g. "Start the MIDI AI backend").
 */
export class ProviderUnavailableError extends Error {
  constructor(
    public readonly capability: ModelCapability,
    public readonly taskType: AiTaskType,
    reason?: string,
  ) {
    const msg = reason
      ? `Provider "${capability}" is unavailable for task "${taskType}": ${reason}`
      : `Provider "${capability}" is unavailable for task "${taskType}". Ensure the backend model is loaded.`;
    super(msg);
    this.name = 'ProviderUnavailableError';
  }
}

// ---------------------------------------------------------------------------
// Task types that use FormData (multipart upload with src_audio blob)
// ---------------------------------------------------------------------------

const FORMDATA_TASK_TYPES = new Set<AiTaskType>([
  'lego',
  'text2music',
  'cover',
  'repaint',
  'stem_separation',
]);

// ---------------------------------------------------------------------------
// Unified Task Submission
// ---------------------------------------------------------------------------

/**
 * Submit any AI task through a single entry point.
 * Routes to the correct endpoint based on task_type.
 *
 * - For music generation tasks (lego/text2music/cover/repaint/stem_separation):
 *   Uses FormData with optional src_audio blob.
 * - For other tasks (ai_mix/midi_generate/chord_generate):
 *   Uses JSON body.
 *
 * Returns the parsed response data (unwrapped from ApiEnvelope).
 */
export async function submitAiTask<T = unknown>(
  params: AiTaskParams,
  srcAudio?: Blob,
): Promise<T> {
  const base = getApiBaseUrl();
  const endpoint = getEndpointForTaskType(params.task_type);
  const url = `${base}${endpoint}`;

  let res: Response;

  if (FORMDATA_TASK_TYPES.has(params.task_type)) {
    // FormData submission for tasks that accept audio blobs
    const formData = new FormData();
    if (srcAudio) {
      formData.append('src_audio', srcAudio, 'src_audio.wav');
    }
    for (const [key, value] of Object.entries(params)) {
      if (value === null || value === undefined) continue;
      formData.append(key, String(value));
    }
    res = await fetch(url, { method: 'POST', body: formData });
  } else {
    // JSON submission for structured tasks
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`submitAiTask failed: ${res.status} - ${text}`);
  }

  const json = await res.json();
  // Detect envelope shape — some endpoints wrap in ApiEnvelope, others return raw
  if (json && typeof json === 'object' && 'data' in json && 'code' in json) {
    return (json as ApiEnvelope<T>).data;
  }
  return json as T;
}

// ---------------------------------------------------------------------------
// Provider Health Check
// ---------------------------------------------------------------------------

/**
 * Check health of a specific AI capability provider.
 * Falls back to the main /health endpoint if the provider-specific one fails.
 */
export async function checkProviderHealth(
  capability: ModelCapability,
): Promise<ProviderHealthResult> {
  const base = getApiBaseUrl();
  const endpoint = CAPABILITY_HEALTH_ENDPOINTS[capability];
  const now = Date.now();

  try {
    const res = await fetch(`${base}${endpoint}`);
    if (res.ok) {
      return { capability, status: 'healthy', lastChecked: now };
    }

    // If provider-specific endpoint failed, try main health as fallback
    if (endpoint !== '/health') {
      const fallbackRes = await fetch(`${base}/health`);
      if (fallbackRes.ok) {
        // Backend is alive but this specific provider may not be available
        return {
          capability,
          status: 'unavailable',
          lastChecked: now,
          error: `Provider endpoint returned ${res.status}`,
        };
      }
    }

    return {
      capability,
      status: 'unavailable',
      lastChecked: now,
      error: `Health check failed: ${res.status} ${res.statusText}`,
    };
  } catch (err) {
    return {
      capability,
      status: 'error',
      lastChecked: now,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
