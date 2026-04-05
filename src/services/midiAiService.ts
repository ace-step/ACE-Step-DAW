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

// ─── High-Level Orchestration ───────────────────────────────────────────────

/**
 * Run the full MIDI AI generation workflow:
 * 1. Serialize context notes
 * 2. Submit to backend
 * 3. Poll for results
 * 4. Deserialize and update store with variations
 */
export async function generateMidiAi(
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
): Promise<void> {
  const store = useMidiAiStore.getState();
  store.startGeneration();

  try {
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

    logger.info('Submitting MIDI generation:', params.mode);

    const taskId = await submitMidiGeneration(params);
    logger.info('MIDI generation task submitted:', taskId);

    const results = await pollMidiResult(taskId);
    logger.info(`MIDI generation complete: ${results.length} results`);

    const variations: MidiAiVariation[] = results.map((result, i) => ({
      id: `variation-${Date.now()}-${i}`,
      notes: deserializeMidiResult(result.midi_data),
      score: result.score,
      model: result.model,
    }));

    store.setVariations(variations);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('MIDI generation failed:', message);
    store.setError(message);
  }
}
