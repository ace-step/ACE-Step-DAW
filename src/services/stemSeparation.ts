import { v4 as uuidv4 } from 'uuid';
import { useGenerationStore } from '../store/generationStore';
import { getAudioEngine } from '../hooks/useAudioEngine';
import { toastError, toastInfo, toastSuccess } from '../hooks/useToast';
import { computeWaveformPeaks } from '../utils/waveformPeaks';
import { CLIP_WAVEFORM_PEAK_COUNT } from '../utils/clipAudio';
import { audioBufferToWavBlob } from '../utils/wav';
import { POLL_INTERVAL_MS, MAX_POLL_DURATION_MS } from '../constants/defaults';
import { TRACK_CATALOG } from '../constants/tracks';
import type { StemCount, StemSeparationEngine } from '../types/api';
import type { TrackName } from '../types/project';
import * as api from './aceStepApi';

export interface PreparedSeparatedStem {
  key: string;
  trackName: TrackName;
  displayName: string;
  color: string;
  audioBlob: Blob;
  waveformPeaks: number[];
  audioDuration: number;
}

interface RawStemResult {
  key: string;
  file: string;
}

const STEM_ORDER: Record<StemCount, string[]> = {
  2: ['vocals', 'instrumental'],
  4: ['vocals', 'drums', 'bass', 'other'],
  6: ['vocals', 'drums', 'bass', 'guitar', 'piano', 'other'],
};

const STEM_META: Record<string, { trackName: TrackName; displayName: string; color: string }> = {
  vocals: {
    trackName: 'vocals',
    displayName: 'Vocals',
    color: TRACK_CATALOG.vocals.color,
  },
  drums: {
    trackName: 'drums',
    displayName: 'Drums',
    color: TRACK_CATALOG.drums.color,
  },
  bass: {
    trackName: 'bass',
    displayName: 'Bass',
    color: TRACK_CATALOG.bass.color,
  },
  guitar: {
    trackName: 'guitar',
    displayName: 'Guitar',
    color: TRACK_CATALOG.guitar.color,
  },
  piano: {
    trackName: 'keyboard',
    displayName: 'Piano',
    color: '#34d399',
  },
  instrumental: {
    trackName: 'custom',
    displayName: 'Instrumental',
    color: '#60a5fa',
  },
  other: {
    trackName: 'custom',
    displayName: 'Other',
    color: '#94a3b8',
  },
};

function normalizeStemKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function extractRawStemResults(payload: unknown): RawStemResult[] {
  if (Array.isArray(payload)) {
    return payload.flatMap((entry) => extractRawStemResults(entry));
  }

  if (!isRecord(payload)) {
    return [];
  }

  if (Array.isArray(payload.stems)) {
    return extractRawStemResults(payload.stems);
  }

  if (isRecord(payload.stems)) {
    return Object.entries(payload.stems).flatMap(([key, value]) => {
      if (typeof value === 'string') {
        return [{ key: normalizeStemKey(key), file: value }];
      }
      return [];
    });
  }

  const rawFile = payload.file ?? payload.path ?? payload.audio_path ?? payload.url;
  const rawKey = payload.stem ?? payload.stem_name ?? payload.name ?? payload.track_name ?? payload.label;
  if (typeof rawFile === 'string' && typeof rawKey === 'string') {
    return [{ key: normalizeStemKey(rawKey), file: rawFile }];
  }

  return Object.entries(payload).flatMap(([key, value]) => {
    if (typeof value === 'string') {
      return [{ key: normalizeStemKey(key), file: value }];
    }
    return [];
  });
}

function parseStemResults(result: string, stemCount: StemCount): RawStemResult[] {
  const parsed = JSON.parse(result) as unknown;
  const extracted = extractRawStemResults(parsed);
  const order = STEM_ORDER[stemCount];

  const uniqueByKey = new Map<string, RawStemResult>();
  for (const item of extracted) {
    if (!order.includes(item.key) || uniqueByKey.has(item.key)) continue;
    uniqueByKey.set(item.key, item);
  }

  const ordered = order
    .map((key) => uniqueByKey.get(key))
    .filter((item): item is RawStemResult => Boolean(item));

  if (ordered.length !== order.length) {
    throw new Error(`Stem separation returned ${ordered.length}/${order.length} expected stems`);
  }

  return ordered;
}

function prepareStemLabel(stemKey: string) {
  return STEM_META[stemKey] ?? {
    trackName: 'custom' as TrackName,
    displayName: stemKey.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase()),
    color: TRACK_CATALOG.custom.color,
  };
}

export async function separateClipAudioToStems(options: {
  clipId: string;
  sourceBlob: Blob;
  stemCount: StemCount;
  sourceLabel: string;
  engine?: StemSeparationEngine;
}): Promise<PreparedSeparatedStem[]> {
  const { clipId, sourceBlob, stemCount, sourceLabel, engine: separationEngine } = options;
  const genStore = useGenerationStore.getState();
  if (!genStore.tryAcquireGenerationLock()) {
    throw new Error('Another generation job is already running');
  }

  const jobId = uuidv4();
  toastInfo('Stem separation started');
  genStore.addJob({
    id: jobId,
    clipId,
    trackName: sourceLabel,
    status: 'queued',
    progress: `Queued ${stemCount}-stem separation`,
  });

  try {
    genStore.updateJob(jobId, { status: 'generating', progress: 'Submitting stem separation...' });
    const releaseResp = await api.releaseStemSeparationTask(sourceBlob, {
      task_type: 'stem_separation',
      stem_count: stemCount,
      audio_format: 'wav',
      ...(separationEngine && separationEngine !== 'auto' ? { engine: separationEngine } : {}),
    });

    const startedAt = Date.now();
    let rawResults: RawStemResult[] | null = null;

    while (Date.now() - startedAt < MAX_POLL_DURATION_MS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const entries = await api.queryResult([releaseResp.task_id]);
      const entry = entries[0];
      if (!entry) continue;

      genStore.updateJob(jobId, {
        status: entry.status === 0 ? 'generating' : 'processing',
        progress: entry.progress_text || 'Separating stems...',
      });

      if (entry.status === 1) {
        rawResults = parseStemResults(entry.result, stemCount);
        break;
      }

      if (entry.status === 2) {
        throw new Error(`Stem separation failed: ${entry.result}`);
      }
    }

    if (!rawResults) {
      throw new Error('Stem separation timed out');
    }

    genStore.updateJob(jobId, { status: 'processing', progress: 'Downloading stems...' });

    const engine = getAudioEngine();
    const prepared = await Promise.all(
      rawResults.map(async ({ key, file }) => {
        const blob = await api.downloadAudio(file);
        const buffer = await engine.decodeAudioData(blob);
        const label = prepareStemLabel(key);
        return {
          key,
          trackName: label.trackName,
          displayName: label.displayName,
          color: label.color,
          audioBlob: audioBufferToWavBlob(buffer),
          waveformPeaks: computeWaveformPeaks(buffer, CLIP_WAVEFORM_PEAK_COUNT),
          audioDuration: buffer.duration,
        };
      }),
    );

    genStore.updateJob(jobId, { status: 'done', progress: 'Done' });
    toastSuccess('Stem separation completed');
    return prepared;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stem separation failed';
    genStore.updateJob(jobId, { status: 'error', progress: message, error: message });
    toastError(message);
    throw error;
  } finally {
    useGenerationStore.getState().setIsGenerating(false);
  }
}
