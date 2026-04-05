/**
 * MIDI AI Generation Service (#739)
 *
 * Bridges the MIDI AI store with the backend API:
 * - Serializes clip notes to the API format
 * - Submits generation requests
 * - Polls for results
 * - Deserializes generated MIDI back to MidiNote[]
 */
import { getBackendUrl } from './aceStepApi';
import type { MidiGenerationTaskParams, MidiGenerationResultItem } from '../types/api';
import type { MidiNote } from '../types/project';
import { useMidiAiStore } from '../store/midiAiStore';
import type { MidiAiVariation } from '../store/midiAiStore';
import { createDebugLogger } from '../utils/debugLogger';

const logger = createDebugLogger('ace-step:midi-ai');

/** Resolve API base URL, matching the pattern in aceStepApi.ts */
function getApiBase(): string {
  const custom = getBackendUrl();
  if (custom && custom.trim()) {
    return custom.trim().replace(/\/+$/, '');
  }
  return '/api';
}

// ─── MIDI Serialization Helpers ────────────────────────────────────────────

/**
 * Convert DAW MidiNote[] to a simple JSON-based MIDI representation.
 * Base64-encoded for the API.
 */
export function serializeNotesToMidiContext(notes: MidiNote[], bpm: number): string {
  const payload = {
    format: 'ace-step-midi-v1',
    bpm,
    notes: notes.map((n) => ({
      pitch: n.pitch,
      start_beat: n.startBeat,
      duration_beats: n.durationBeats,
      velocity: n.velocity,
    })),
  };
  return btoa(JSON.stringify(payload));
}

/**
 * Convert base64-encoded MIDI result back to MidiNote[].
 */
export function deserializeMidiResult(base64Data: string): MidiNote[] {
  try {
    const json = atob(base64Data);
    const data = JSON.parse(json) as {
      notes?: Array<{
        pitch: number;
        start_beat: number;
        duration_beats: number;
        velocity: number;
      }>;
    };

    if (!data.notes || !Array.isArray(data.notes)) return [];

    return data.notes.map((n, i) => ({
      id: `ai-gen-${Date.now()}-${i}`,
      pitch: n.pitch,
      startBeat: n.start_beat,
      durationBeats: n.duration_beats,
      velocity: n.velocity,
    }));
  } catch (e) {
    logger.error('Failed to deserialize MIDI result:', e);
    return [];
  }
}

// ─── API Interaction ────────────────────────────────────────────────────────

const MIDI_GENERATE_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1_000;
const MAX_POLL_ATTEMPTS = 60;

interface MidiGenerateResponse {
  task_id: string;
}

interface MidiResultResponse {
  status: 'pending' | 'processing' | 'completed' | 'error';
  results?: MidiGenerationResultItem[];
  error?: string;
}

/**
 * Submit a MIDI generation task to the backend.
 */
export async function submitMidiGeneration(
  params: MidiGenerationTaskParams,
): Promise<string> {
  const base = getApiBase();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MIDI_GENERATE_TIMEOUT_MS);

  try {
    const res = await fetch(`${base}/v1/midi/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`MIDI generation request failed: ${res.status} - ${text}`);
    }

    const data: MidiGenerateResponse = await res.json();
    return data.task_id;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Poll for MIDI generation results.
 */
export async function pollMidiResult(taskId: string): Promise<MidiGenerationResultItem[]> {
  const base = getApiBase();

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const res = await fetch(`${base}/v1/midi/result/${taskId}`);

    if (!res.ok) {
      throw new Error(`Failed to poll MIDI result: ${res.status}`);
    }

    const data: MidiResultResponse = await res.json();

    if (data.status === 'completed' && data.results) {
      return data.results;
    }

    if (data.status === 'error') {
      throw new Error(data.error ?? 'MIDI generation failed on the server');
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error('MIDI generation timed out');
}

// ─── WebSocket Streaming ────────────────────────────────────────────────────

export interface MidiStreamToken {
  /** Type of stream event */
  type: 'token' | 'progress' | 'complete' | 'error';
  /** Partial generated note (for 'token' type) */
  note?: { pitch: number; start_beat: number; duration_beats: number; velocity: number };
  /** Progress percentage (0-100) */
  progress?: number;
  /** Completed results (for 'complete' type) */
  results?: MidiGenerationResultItem[];
  /** Error message (for 'error' type) */
  error?: string;
}

/**
 * Stream MIDI generation via WebSocket for real-time feedback.
 * Falls back to polling if WebSocket is not available.
 */
export function streamMidiGeneration(
  params: MidiGenerationTaskParams,
  onToken: (token: MidiStreamToken) => void,
): { cancel: () => void } {
  const base = getApiBase();
  const wsBase = base.replace(/^http/, 'ws');
  let cancelled = false;
  let ws: WebSocket | null = null;

  const connect = () => {
    try {
      ws = new WebSocket(`${wsBase}/v1/midi/generate/stream`);

      ws.onopen = () => {
        logger.info('WebSocket connected for MIDI streaming');
        ws?.send(JSON.stringify(params));
      };

      ws.onmessage = (event) => {
        if (cancelled) return;
        try {
          const token = JSON.parse(event.data as string) as MidiStreamToken;
          onToken(token);

          if (token.type === 'complete' || token.type === 'error') {
            ws?.close();
          }
        } catch (e) {
          logger.error('Failed to parse stream token:', e);
        }
      };

      ws.onerror = (err) => {
        logger.warn('WebSocket error, falling back to polling:', err);
        ws?.close();
        // Fall back to REST polling
        if (!cancelled) {
          void fallbackToPolling(params, onToken);
        }
      };

      ws.onclose = () => {
        ws = null;
      };
    } catch {
      // WebSocket not available, fall back to polling
      logger.info('WebSocket not available, using polling');
      if (!cancelled) {
        void fallbackToPolling(params, onToken);
      }
    }
  };

  connect();

  return {
    cancel: () => {
      cancelled = true;
      ws?.close();
    },
  };
}

async function fallbackToPolling(
  params: MidiGenerationTaskParams,
  onToken: (token: MidiStreamToken) => void,
): Promise<void> {
  try {
    const taskId = await submitMidiGeneration(params);
    onToken({ type: 'progress', progress: 10 });
    const results = await pollMidiResult(taskId);
    onToken({ type: 'complete', results });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    onToken({ type: 'error', error: message });
  }
}

// ─── High-Level Orchestration ───────────────────────────────────────────────

/**
 * Run the full MIDI AI generation workflow using WebSocket streaming
 * (with fallback to REST polling):
 * 1. Serialize context notes
 * 2. Stream/submit generation to backend
 * 3. Update store with variations on completion
 *
 * Returns a cancel function to abort in-progress generation.
 */
export function generateMidiAi(
  contextNotes: MidiNote[],
  options: {
    bpm: number;
    mode: MidiGenerationTaskParams['mode'];
    selectionStart?: number;
    selectionEnd?: number;
    lockedNoteIndices?: number[];
    temperature?: number;
    numResults?: number;
    model?: string;
    style?: string;
    key?: string;
    timeSignature?: string;
    continuationBars?: number;
    targetInstrument?: string;
  },
): { cancel: () => void } {
  const store = useMidiAiStore.getState();
  store.startGeneration();

  const contextMidi = serializeNotesToMidiContext(contextNotes, options.bpm);

  const params: MidiGenerationTaskParams = {
    task_type: 'midi_generate',
    mode: options.mode,
    context_midi: contextMidi,
    selection_start: options.selectionStart,
    selection_end: options.selectionEnd,
    locked_note_indices: options.lockedNoteIndices,
    temperature: options.temperature ?? store.temperature,
    num_results: options.numResults ?? store.numResults,
    model: options.model ?? store.model,
    style: options.style ?? (store.style || undefined),
    key: options.key,
    time_signature: options.timeSignature,
    bpm: options.bpm,
    continuation_bars: options.continuationBars,
    target_instrument: options.targetInstrument,
  };

  logger.info('Starting MIDI generation:', params.mode);

  const stream = streamMidiGeneration(params, (token) => {
    const currentStore = useMidiAiStore.getState();
    // Ignore events if panel was closed or generation reset
    if (currentStore.status !== 'generating') return;

    switch (token.type) {
      case 'progress':
        // Could update a progress indicator in the future
        logger.debug('Generation progress:', token.progress);
        break;

      case 'complete': {
        const results = token.results ?? [];
        logger.info(`MIDI generation complete: ${results.length} results`);
        const variations: MidiAiVariation[] = results.map((result, i) => ({
          id: `variation-${Date.now()}-${i}`,
          notes: deserializeMidiResult(result.midi_data),
          score: result.score,
          model: result.model,
        }));
        currentStore.setVariations(variations);
        break;
      }

      case 'error':
        logger.error('MIDI generation failed:', token.error);
        currentStore.setError(token.error ?? 'Unknown error');
        break;
    }
  });

  return stream;
}
