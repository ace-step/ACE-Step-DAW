import { loadAudioBlobByKey, saveAudioBlob } from './audioFileManager';
import { getAudioEngine } from '../hooks/useAudioEngine';
import { audioBufferToWavBlob } from '../utils/wav';
import { computeWaveformPeaks } from '../utils/waveformPeaks';
import {
  CLIP_WAVEFORM_PEAK_COUNT,
  getClipAudibleStartTime,
  getClipSourceSpan,
} from '../utils/clipAudio';
import type { Clip } from '../types/project';

/** -0.1 dBFS as linear amplitude: 10^(-0.1/20) ≈ 0.98855 */
const NORMALIZE_TARGET_PEAK = Math.pow(10, -0.1 / 20);

export interface ClipProcessingResult {
  audioKey: string;
  waveformPeaks: number[];
  audioDuration: number;
}

/** Minimal AudioBuffer-compatible shape for processing functions. */
interface AudioBufferLike {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  readonly duration: number;
  getChannelData(channel: number): Float32Array;
}

/** Create a lightweight AudioBuffer-compatible object from channel data. */
function createBuffer(
  channels: Float32Array[],
  sampleRate: number,
): AudioBufferLike {
  const length = channels[0]?.length ?? 0;
  return {
    numberOfChannels: channels.length,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: (ch: number) => channels[ch],
  };
}

function getClipAudioKey(clip: Clip): string | null {
  return clip.isolatedAudioKey ?? clip.cumulativeMixKey ?? null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Extract the source window that is currently audible for a clip.
 *
 * Isolated audio is clip-relative and honors audioOffset/timeStretchRate.
 * Cumulative audio is project-relative, matching the transport fallback path.
 */
export function extractClipAudioSegment(source: AudioBufferLike, clip: Clip): AudioBufferLike {
  const sourceDuration = source.duration;
  const isIsolatedSource = !!clip.isolatedAudioKey;
  const clipWithSourceDuration = {
    ...clip,
    audioDuration: clip.audioDuration ?? sourceDuration,
  };

  const startSeconds = isIsolatedSource
    ? clamp(clip.audioOffset ?? 0, 0, sourceDuration)
    : clamp(
        getClipAudibleStartTime(clipWithSourceDuration) + Math.max(0, clip.audioOffset ?? 0),
        0,
        sourceDuration,
      );
  const spanSeconds = getClipSourceSpan(clipWithSourceDuration);
  const endSeconds = clamp(startSeconds + Math.max(0, spanSeconds), startSeconds, sourceDuration);

  const startSample = clamp(Math.floor(startSeconds * source.sampleRate), 0, source.length);
  const endSample = clamp(Math.ceil(endSeconds * source.sampleRate), startSample, source.length);
  const length = endSample - startSample;
  if (length <= 0) {
    throw new Error(`Clip '${clip.id}' has no audible audio segment`);
  }

  if (startSample === 0 && endSample === source.length) {
    return source;
  }

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < source.numberOfChannels; ch++) {
    const srcData = source.getChannelData(ch);
    channels.push(srcData.slice(startSample, endSample));
  }
  return createBuffer(channels, source.sampleRate);
}

async function loadClipAudioBuffer(clip: Clip): Promise<AudioBuffer> {
  const audioKey = getClipAudioKey(clip);
  if (!audioKey) {
    throw new Error(`Clip '${clip.id}' has no audio data`);
  }
  const blob = await loadAudioBlobByKey(audioKey);
  if (!blob) {
    throw new Error(`Audio blob not found for key '${audioKey}'`);
  }
  const engine = getAudioEngine();
  return engine.decodeAudioData(blob);
}

async function saveProcessedBuffer(
  projectId: string,
  clipId: string,
  buffer: AudioBufferLike,
): Promise<ClipProcessingResult> {
  const wavBlob = audioBufferToWavBlob(buffer as AudioBuffer);
  const audioKey = await saveAudioBlob(projectId, clipId, 'isolated', wavBlob);
  const waveformPeaks = computeWaveformPeaks(buffer as AudioBuffer, CLIP_WAVEFORM_PEAK_COUNT);
  return { audioKey, waveformPeaks, audioDuration: buffer.duration };
}

/**
 * Reverse the audio data of a buffer, producing a new buffer.
 */
export function reverseAudioBuffer(source: AudioBufferLike): AudioBufferLike {
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < source.numberOfChannels; ch++) {
    const srcData = source.getChannelData(ch);
    const dstData = new Float32Array(srcData.length);
    for (let i = 0; i < srcData.length; i++) {
      dstData[i] = srcData[srcData.length - 1 - i];
    }
    channels.push(dstData);
  }
  return createBuffer(channels, source.sampleRate);
}

/**
 * Normalize audio to a target peak amplitude (0.0–1.0).
 * Returns source unchanged if already at target or silent.
 */
export function normalizeAudioBuffer(
  source: AudioBufferLike,
  targetPeak: number = NORMALIZE_TARGET_PEAK,
): AudioBufferLike {
  let peak = 0;
  for (let ch = 0; ch < source.numberOfChannels; ch++) {
    const data = source.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      peak = Math.max(peak, Math.abs(data[i]));
    }
  }

  if (peak <= 0 || Math.abs(peak - targetPeak) < 0.001) {
    return source;
  }

  const gain = targetPeak / peak;
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < source.numberOfChannels; ch++) {
    const srcData = source.getChannelData(ch);
    const dstData = new Float32Array(srcData.length);
    for (let i = 0; i < srcData.length; i++) {
      dstData[i] = srcData[i] * gain;
    }
    channels.push(dstData);
  }
  return createBuffer(channels, source.sampleRate);
}

/**
 * Apply a gain multiplier to audio (non-destructive amplitude change).
 * gain: linear multiplier (e.g. 0.5 = -6dB, 2.0 = +6dB).
 * Output is hard-clipped to [-1, 1].
 */
export function applyGainToAudioBuffer(
  source: AudioBufferLike,
  gain: number,
): AudioBufferLike {
  if (gain === 1) return source;

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < source.numberOfChannels; ch++) {
    const srcData = source.getChannelData(ch);
    const dstData = new Float32Array(srcData.length);
    for (let i = 0; i < srcData.length; i++) {
      dstData[i] = Math.max(-1, Math.min(1, srcData[i] * gain));
    }
    channels.push(dstData);
  }
  return createBuffer(channels, source.sampleRate);
}

/**
 * Reverse a clip's audio and save the result.
 */
export async function reverseClipAudio(
  projectId: string,
  clip: Clip,
): Promise<ClipProcessingResult> {
  const buffer = await loadClipAudioBuffer(clip);
  const segment = extractClipAudioSegment(buffer, clip);
  const reversed = reverseAudioBuffer(segment);
  return saveProcessedBuffer(projectId, clip.id, reversed);
}

/**
 * Normalize a clip's audio to target peak and save the result.
 */
export async function normalizeClipAudio(
  projectId: string,
  clip: Clip,
  targetPeak: number = NORMALIZE_TARGET_PEAK,
): Promise<ClipProcessingResult> {
  const buffer = await loadClipAudioBuffer(clip);
  const segment = extractClipAudioSegment(buffer, clip);
  const normalized = normalizeAudioBuffer(segment, targetPeak);
  return saveProcessedBuffer(projectId, clip.id, normalized);
}

/**
 * Apply a gain adjustment (in dB) to a clip's audio and save the result.
 */
export async function adjustClipGain(
  projectId: string,
  clip: Clip,
  gainDb: number,
): Promise<ClipProcessingResult> {
  const linearGain = Math.pow(10, gainDb / 20);
  const buffer = await loadClipAudioBuffer(clip);
  const segment = extractClipAudioSegment(buffer, clip);
  const gained = applyGainToAudioBuffer(segment, linearGain);
  return saveProcessedBuffer(projectId, clip.id, gained);
}
