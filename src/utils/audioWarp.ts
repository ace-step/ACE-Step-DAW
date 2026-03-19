/**
 * Audio warping utilities — BPM detection, tempo matching, and warp segment computation.
 * Provides algorithms for time-stretching imported audio to match project tempo.
 */

import type { AudioWarpMarker } from '../types/project';
import { detectTransients } from './audioQuantize';

/** A segment of audio to be played back at a specific rate for warp marker application. */
export interface WarpSegment {
  /** Start position in the source buffer (seconds). */
  sourceStart: number;
  /** End position in the source buffer (seconds). */
  sourceEnd: number;
  /** Start position on the timeline (seconds). */
  targetStart: number;
  /** End position on the timeline (seconds). */
  targetEnd: number;
  /** Playback rate for this segment (source duration / target duration). */
  playbackRate: number;
}

/**
 * Detect the BPM of audio from its peak data using inter-onset interval analysis.
 *
 * @param peaks - Raw audio samples (Float32Array)
 * @param sampleRate - Sample rate of the audio
 * @returns Estimated BPM, or null if detection fails
 */
export function detectBpm(peaks: Float32Array, sampleRate: number): number | null {
  if (peaks.length < sampleRate * 0.5) return null; // need at least 0.5s

  const transients = detectTransients(peaks, sampleRate, {
    sensitivity: 0.08,
    minGapMs: 100, // at least 100ms between onsets (~600 BPM max)
  });

  if (transients.length < 2) return null;

  // Compute inter-onset intervals
  const intervals: number[] = [];
  for (let i = 1; i < transients.length; i++) {
    intervals.push(transients[i] - transients[i - 1]);
  }

  // Cluster intervals into tempo candidates using histogram approach
  // BPM range: 60-200 → interval range: 0.3s - 1.0s
  const minInterval = 60 / 200; // 0.3s
  const maxInterval = 60 / 60;  // 1.0s

  // Filter to valid range (including multiples/subdivisions)
  const validIntervals = intervals.filter(
    (i) => i >= minInterval * 0.5 && i <= maxInterval * 2,
  );

  if (validIntervals.length === 0) return null;

  // Find the most common interval using a simple histogram
  const binSize = 0.02; // 20ms bins
  const bins = new Map<number, number>();
  for (const interval of validIntervals) {
    const bin = Math.round(interval / binSize);
    bins.set(bin, (bins.get(bin) ?? 0) + 1);
  }

  // Find the bin with the most hits
  let bestBin = 0;
  let bestCount = 0;
  for (const [bin, count] of bins) {
    if (count > bestCount) {
      bestCount = count;
      bestBin = bin;
    }
  }

  const dominantInterval = bestBin * binSize;
  if (dominantInterval <= 0) return null;

  let bpm = 60 / dominantInterval;

  // Normalize to 60-200 range
  while (bpm > 200) bpm /= 2;
  while (bpm < 60) bpm *= 2;

  return Math.round(bpm);
}

/**
 * Compute the playback rate needed to match source BPM to target BPM.
 *
 * @param sourceBpm - Original tempo of the audio
 * @param targetBpm - Desired tempo (usually project BPM)
 * @returns Playback rate multiplier (e.g., 1.2 means play 20% faster)
 */
export function computeStretchRate(sourceBpm: number, targetBpm: number): number {
  if (sourceBpm <= 0 || targetBpm <= 0) return 1;
  return targetBpm / sourceBpm;
}

/**
 * Compute playback segments from warp markers for time-warped playback.
 * Each segment maps a source buffer region to a timeline region with a specific playback rate.
 *
 * The idea: warp markers define anchor points. Between consecutive anchors,
 * the audio is played at a rate that maps the source region to the target region.
 *
 * @param markers - Warp markers (sorted by originalTime)
 * @param clipDuration - Total clip duration in seconds
 * @returns Array of warp segments for scheduling
 */
export function computeWarpedSegments(
  markers: AudioWarpMarker[],
  clipDuration: number,
): WarpSegment[] {
  if (markers.length === 0) {
    return [{
      sourceStart: 0,
      sourceEnd: clipDuration,
      targetStart: 0,
      targetEnd: clipDuration,
      playbackRate: 1.0,
    }];
  }

  // Sort markers and deduplicate by originalTime
  const sorted = [...markers].sort((a, b) => a.originalTime - b.originalTime);
  const deduped: AudioWarpMarker[] = [];
  for (const m of sorted) {
    if (deduped.length === 0 || m.originalTime !== deduped[deduped.length - 1].originalTime) {
      deduped.push(m);
    }
  }

  // Build anchor points: start, each marker, end
  interface Anchor { source: number; target: number }
  const anchors: Anchor[] = [];

  // If first marker isn't at 0, add implicit start anchor
  if (deduped[0].originalTime > 0) {
    anchors.push({ source: 0, target: 0 });
  }

  for (const m of deduped) {
    anchors.push({ source: m.originalTime, target: m.quantizedTime });
  }

  // If last marker isn't at clipDuration, add implicit end anchor
  const lastAnchor = anchors[anchors.length - 1];
  if (lastAnchor.source < clipDuration) {
    // End of clip stays at clipDuration on both source and target
    anchors.push({ source: clipDuration, target: clipDuration });
  }

  // Build segments between consecutive anchors
  const segments: WarpSegment[] = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    const sourceDur = b.source - a.source;
    const targetDur = b.target - a.target;

    // Skip zero-length segments
    if (sourceDur <= 0 || targetDur <= 0) continue;

    segments.push({
      sourceStart: a.source,
      sourceEnd: b.source,
      targetStart: a.target,
      targetEnd: b.target,
      playbackRate: sourceDur / targetDur,
    });
  }

  return segments;
}
