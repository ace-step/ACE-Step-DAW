/**
 * AI Mixing Service (#738)
 *
 * Bridges the AI Mix store with the backend GRAFX API:
 * - Submits multi-track audio for AI analysis
 * - Polls for parameter-level mix results
 * - Maps results to DAW mixer format
 */
import { getBackendUrl } from './aceStepApi';
import type { AiMixTaskParams, AiMixResult } from '../types/api';
import { useAiMixStore } from '../store/aiMixStore';
import { createDebugLogger } from '../utils/debugLogger';

const logger = createDebugLogger('ace-step:ai-mix');

function getApiBase(): string {
  const custom = getBackendUrl();
  if (custom && custom.trim()) {
    return custom.trim().replace(/\/+$/, '');
  }
  return '/api';
}

const AI_MIX_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_ATTEMPTS = 60;

interface AiMixSubmitResponse {
  task_id: string;
}

interface AiMixResultResponse {
  status: 'pending' | 'processing' | 'completed' | 'error';
  result?: AiMixResult;
  error?: string;
}

/**
 * Submit an AI mix analysis task to the backend.
 */
export async function submitAiMix(params: AiMixTaskParams): Promise<string> {
  const base = getApiBase();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_MIX_TIMEOUT_MS);

  try {
    const res = await fetch(`${base}/v1/ai-mix/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI mix request failed: ${res.status} - ${text}`);
    }

    const data: AiMixSubmitResponse = await res.json();
    return data.task_id;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Poll for AI mix results.
 */
export async function pollAiMixResult(taskId: string): Promise<AiMixResult> {
  const base = getApiBase();

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const res = await fetch(`${base}/v1/ai-mix/result/${taskId}`);

    if (!res.ok) {
      throw new Error(`Failed to poll AI mix result: ${res.status}`);
    }

    const data: AiMixResultResponse = await res.json();

    if (data.status === 'completed' && data.result) {
      return data.result;
    }

    if (data.status === 'error') {
      throw new Error(data.error ?? 'AI mix analysis failed on the server');
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error('AI mix analysis timed out');
}

/**
 * Run the full AI mix workflow:
 * 1. Submit analysis request to backend
 * 2. Poll for results
 * 3. Update store with AI-suggested parameters
 */
export async function analyzeAiMix(options?: {
  mode?: AiMixTaskParams['mode'];
  textPrompt?: string;
  targetLufs?: number;
  model?: string;
}): Promise<void> {
  const store = useAiMixStore.getState();
  store.startAnalysis();

  try {
    const params: AiMixTaskParams = {
      task_type: 'ai_mix',
      mode: options?.mode ?? store.mode,
      text_prompt: options?.textPrompt ?? (store.textPrompt || undefined),
      target_lufs: options?.targetLufs ?? store.targetLufs,
      model: options?.model ?? 'grafx',
    };

    logger.info('Submitting AI mix analysis:', params.mode);

    const taskId = await submitAiMix(params);
    logger.info('AI mix task submitted:', taskId);

    const result = await pollAiMixResult(taskId);
    logger.info(`AI mix complete: ${Object.keys(result.tracks).length} tracks`);

    store.setSuggestion(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('AI mix analysis failed:', message);
    store.setError(message);
  }
}

/**
 * Format a dB value for display.
 */
export function formatDb(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)} dB`;
}

/**
 * Format a pan value (-1 to 1) for display.
 */
export function formatPan(value: number): string {
  if (Math.abs(value) < 0.01) return 'C';
  const pct = Math.round(Math.abs(value) * 100);
  return value < 0 ? `${pct}L` : `${pct}R`;
}
