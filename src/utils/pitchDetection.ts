/**
 * YIN pitch detection algorithm for monophonic audio.
 * Based on: de Cheveigné, A., & Kawahara, H. (2002).
 * "YIN, a fundamental frequency estimator for speech and music."
 */

export interface PitchFrame {
  /** Time in seconds from the start of the buffer */
  time: number;
  /** Detected frequency in Hz, or null if no pitch detected */
  frequency: number | null;
  /** Confidence 0–1 (lower = more confident in YIN; inverted here so higher = better) */
  confidence: number;
}

export interface DetectedNote {
  /** MIDI pitch number (0–127) */
  pitch: number;
  /** Start time in seconds */
  startTime: number;
  /** Duration in seconds */
  duration: number;
  /** Average confidence across the note's frames */
  confidence: number;
}

export interface PitchDetectionOptions {
  /** Minimum frequency to detect in Hz (default 80) */
  minFrequency?: number;
  /** Maximum frequency to detect in Hz (default 1000) */
  maxFrequency?: number;
  /** YIN threshold for pitch detection (default 0.15, lower = stricter) */
  threshold?: number;
  /** Hop size in samples between analysis frames (default sampleRate/100) */
  hopSize?: number;
  /** Minimum note duration in seconds to keep (default 0.05) */
  minNoteDuration?: number;
}

/**
 * Compute the YIN difference function for a given buffer segment.
 */
function yinDifference(buffer: Float32Array, start: number, windowSize: number): Float32Array {
  const diff = new Float32Array(windowSize);
  diff[0] = 0;
  for (let tau = 1; tau < windowSize; tau++) {
    let sum = 0;
    for (let j = 0; j < windowSize; j++) {
      const d = buffer[start + j] - buffer[start + j + tau];
      sum += d * d;
    }
    diff[tau] = sum;
  }
  return diff;
}

/**
 * Cumulative mean normalized difference function (step 3 of YIN).
 */
function cumulativeMeanNormalized(diff: Float32Array): Float32Array {
  const result = new Float32Array(diff.length);
  result[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < diff.length; tau++) {
    runningSum += diff[tau];
    result[tau] = runningSum === 0 ? 1 : (diff[tau] * tau) / runningSum;
  }
  return result;
}

/**
 * Find the first dip below threshold in the CMNDF (step 4 of YIN).
 * Returns the tau (lag) value, or -1 if no pitch found.
 */
function absoluteThreshold(cmndf: Float32Array, threshold: number, minTau: number, maxTau: number): number {
  const upper = Math.min(maxTau, cmndf.length);
  // Find first tau where cmndf dips below threshold
  for (let tau = minTau; tau < upper; tau++) {
    if (cmndf[tau] < threshold) {
      // Find local minimum after dip
      while (tau + 1 < upper && cmndf[tau + 1] < cmndf[tau]) {
        tau++;
      }
      return tau;
    }
  }
  return -1;
}

/**
 * Parabolic interpolation around the estimated tau for sub-sample accuracy.
 */
function parabolicInterpolation(cmndf: Float32Array, tau: number): number {
  if (tau <= 0 || tau >= cmndf.length - 1) return tau;
  const s0 = cmndf[tau - 1];
  const s1 = cmndf[tau];
  const s2 = cmndf[tau + 1];
  const adjustment = (s2 - s0) / (2 * (2 * s1 - s2 - s0));
  if (isFinite(adjustment)) return tau + adjustment;
  return tau;
}

// Re-export the canonical implementation from pitch.ts so there is
// exactly one place that defines Hz → MIDI conversion. The
// pitch-detection module historically had its own copy with
// slightly different edge-case behavior (no NaN guard for
// non-finite/non-positive input). Consolidating under one export
// avoids the future "which helper did I import?" mistake codex
// flagged on PR #1723.
import { frequencyToMidi } from './pitch';
export { frequencyToMidi };

/**
 * Detect pitch frames from a mono audio buffer using the YIN algorithm.
 */
export function detectPitchFrames(
  samples: Float32Array,
  sampleRate: number,
  options: PitchDetectionOptions = {},
): PitchFrame[] {
  const {
    minFrequency = 80,
    maxFrequency = 1000,
    threshold = 0.15,
    hopSize = Math.floor(sampleRate / 100),
  } = options;

  const maxTau = Math.floor(sampleRate / minFrequency);
  const minTau = Math.floor(sampleRate / maxFrequency);
  const windowSize = maxTau;

  const frames: PitchFrame[] = [];
  const maxStart = samples.length - 2 * windowSize;

  for (let start = 0; start < maxStart; start += hopSize) {
    const diff = yinDifference(samples, start, windowSize);
    const cmndf = cumulativeMeanNormalized(diff);
    const tau = absoluteThreshold(cmndf, threshold, minTau, maxTau);

    if (tau === -1) {
      frames.push({ time: start / sampleRate, frequency: null, confidence: 0 });
    } else {
      const refinedTau = parabolicInterpolation(cmndf, tau);
      const frequency = sampleRate / refinedTau;
      const confidence = 1 - cmndf[tau];
      frames.push({ time: start / sampleRate, frequency, confidence });
    }
  }

  return frames;
}

/**
 * Group consecutive pitch frames into discrete MIDI notes.
 * Adjacent frames with the same MIDI pitch are merged into a single note.
 */
export function framesToNotes(
  frames: PitchFrame[],
  options: PitchDetectionOptions = {},
): DetectedNote[] {
  const { minNoteDuration = 0.05 } = options;
  if (frames.length === 0) return [];

  const notes: DetectedNote[] = [];
  let currentPitch: number | null = null;
  let noteStart = 0;
  let confidenceSum = 0;
  let frameCount = 0;

  for (const frame of frames) {
    const midi = frame.frequency != null ? Math.round(frequencyToMidi(frame.frequency)) : null;
    const validMidi = midi != null && midi >= 0 && midi <= 127 ? midi : null;

    if (validMidi === currentPitch && currentPitch !== null) {
      // Continue current note
      confidenceSum += frame.confidence;
      frameCount++;
    } else {
      // Close previous note
      if (currentPitch !== null && frameCount > 0) {
        const duration = frame.time - noteStart;
        if (duration >= minNoteDuration) {
          notes.push({
            pitch: currentPitch,
            startTime: noteStart,
            duration,
            confidence: confidenceSum / frameCount,
          });
        }
      }
      // Start new note (or silence)
      currentPitch = validMidi;
      noteStart = frame.time;
      confidenceSum = frame.confidence;
      frameCount = validMidi !== null ? 1 : 0;
    }
  }

  // Close final note
  if (currentPitch !== null && frameCount > 0) {
    const lastFrame = frames[frames.length - 1];
    const hopDuration = frames.length > 1 ? frames[1].time - frames[0].time : 0;
    const duration = lastFrame.time + hopDuration - noteStart;
    if (duration >= minNoteDuration) {
      notes.push({
        pitch: currentPitch,
        startTime: noteStart,
        duration,
        confidence: confidenceSum / frameCount,
      });
    }
  }

  return notes;
}
