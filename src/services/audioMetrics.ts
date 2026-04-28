/**
 * Audio metrics computation for the Clip Inspector panel.
 *
 * Computes loudness (LUFS estimate), sample peak, RMS, and dynamic range
 * from an AudioBuffer. LUFS uses gated mean-square power inspired by
 * ITU-R BS.1770-4 but without K-weighting pre-filters. Peak is sample-level
 * (not interpolated true-peak). Sufficient for display purposes.
 */
import type { AudioMetrics } from '../types/clipInspector';

/** Minimal interface matching AudioBuffer for testability. */
interface AudioBufferLike {
  getChannelData(channel: number): Float32Array;
  numberOfChannels: number;
  sampleRate: number;
  length: number;
  duration: number;
}

// ─── Low-level metrics ─────────────────────────────────────────────────────

/** Sample peak in dBFS across all channels. */
export function computePeakDb(buffer: AudioBufferLike): number {
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
  }
  return peak === 0 ? -Infinity : 20 * Math.log10(peak);
}

/** RMS level in dBFS, averaged across channels. */
export function computeRmsDb(buffer: AudioBufferLike): number {
  let totalSquareSum = 0;
  let totalSamples = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      totalSquareSum += data[i] * data[i];
    }
    totalSamples += data.length;
  }
  if (totalSamples === 0) return -Infinity;
  const rms = Math.sqrt(totalSquareSum / totalSamples);
  return rms === 0 ? -Infinity : 20 * Math.log10(rms);
}

/**
 * Simplified LUFS measurement (ITU-R BS.1770-4 inspired).
 *
 * Uses 400ms gating windows and computes the mean square across all channels.
 * This is a simplified version — production LUFS would apply K-weighting filters.
 */
export function computeLufs(buffer: AudioBufferLike): number {
  const windowSamples = Math.floor(0.4 * buffer.sampleRate); // 400ms window
  if (buffer.length < windowSamples) {
    // Too short for gating — estimate LUFS from whole-buffer mean square
    let totalSquareSum = 0;
    let totalSamples = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        totalSquareSum += data[i] * data[i];
      }
      totalSamples += data.length;
    }

    if (totalSamples === 0) return -Infinity;

    const meanSquare = totalSquareSum / totalSamples;
    return meanSquare === 0 ? -Infinity : -0.691 + 10 * Math.log10(meanSquare);
  }

  const windowCount = Math.floor(buffer.length / windowSamples);
  const windowPowers: number[] = [];

  for (let w = 0; w < windowCount; w++) {
    const start = w * windowSamples;
    let sumSquares = 0;
    let count = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = start; i < start + windowSamples; i++) {
        sumSquares += data[i] * data[i];
        count++;
      }
    }
    windowPowers.push(sumSquares / count);
  }

  // Absolute gating: -70 LUFS threshold (account for -0.691 offset in power domain)
  const absoluteThreshold = Math.pow(10, (-70 + 0.691) / 10);
  const aboveThreshold = windowPowers.filter((p) => p > absoluteThreshold);

  if (aboveThreshold.length === 0) return -Infinity;

  // Relative gating: -10 dB below ungated mean
  const ungatedMean = aboveThreshold.reduce((a, b) => a + b, 0) / aboveThreshold.length;
  const relativeThreshold = ungatedMean * Math.pow(10, -10 / 10);
  const gated = aboveThreshold.filter((p) => p > relativeThreshold);

  if (gated.length === 0) return -Infinity;

  const gatedMean = gated.reduce((a, b) => a + b, 0) / gated.length;
  return -0.691 + 10 * Math.log10(gatedMean);
}

/**
 * Dynamic range estimate based on short-term RMS variation.
 *
 * Splits the buffer into 50ms windows, computes per-window RMS,
 * and returns the difference between the 95th and 10th percentile dB levels.
 */
export function computeDynamicRange(buffer: AudioBufferLike): number {
  const windowSamples = Math.floor(0.05 * buffer.sampleRate); // 50ms
  if (buffer.length < windowSamples) return 0;

  const windowCount = Math.floor(buffer.length / windowSamples);
  const windowRms: number[] = [];

  for (let w = 0; w < windowCount; w++) {
    const start = w * windowSamples;
    let sum = 0;
    let count = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = start; i < start + windowSamples; i++) {
        sum += data[i] * data[i];
        count++;
      }
    }
    const rms = Math.sqrt(sum / count);
    if (rms > 0) windowRms.push(20 * Math.log10(rms));
  }

  if (windowRms.length < 2) return 0;

  windowRms.sort((a, b) => a - b);
  const p10 = windowRms[Math.floor(windowRms.length * 0.1)];
  const p95 = windowRms[Math.floor(windowRms.length * 0.95)];
  return Math.max(0, p95 - p10);
}

// ─── Aggregate ─────────────────────────────────────────────────────────────

/** Compute all audio metrics for a buffer. */
export function computeAudioMetrics(buffer: AudioBufferLike): AudioMetrics {
  return {
    lufs: computeLufs(buffer),
    peakDb: computePeakDb(buffer),
    rmsDb: computeRmsDb(buffer),
    dynamicRangeDb: computeDynamicRange(buffer),
    durationSeconds: buffer.duration,
    sampleRate: buffer.sampleRate,
    channelCount: buffer.numberOfChannels,
  };
}

// ─── Display formatting ────────────────────────────────────────────────────

/** Format LUFS value for display. */
export function formatLufs(lufs: number): string {
  if (!Number.isFinite(lufs)) return 'Silent';
  return `${lufs.toFixed(1)} LUFS`;
}

/** Format dB level for display (with +/- sign). */
export function formatDbLevel(db: number): string {
  if (!Number.isFinite(db)) return '-∞ dB';
  const sign = db > 0 ? '+' : '';
  return `${sign}${db.toFixed(1)} dB`;
}

/** Format dB range/delta for display (no sign prefix). */
export function formatDbRange(db: number): string {
  if (!Number.isFinite(db)) return '0 dB';
  return `${db.toFixed(1)} dB`;
}
