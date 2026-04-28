/**
 * Scene detection utilities for video scoring.
 * Phase 7 of the video track epic (#1144).
 *
 * Design: "Analyze once, filter many times."
 * The scene analysis computes frame difference scores for all sampled frames.
 * Filtering by sensitivity is a pure, instant operation on the cached results.
 */

/** Raw analysis result — computed once by the worker. */
export interface SceneAnalysisResult {
  /** Per-frame difference scores: { time, score }. */
  frameDiffs: Array<{ time: number; score: number }>;
  /** Maximum score observed (for normalizing the sensitivity slider). */
  maxScore: number;
}

/**
 * Marker type defaults for scene detection.
 */
export const SCENE_MARKER_COLOR = '#3b82f6'; // blue
export const SCENE_MARKER_TYPE = 'scene' as const;

/**
 * Filter scene cuts from analysis results using a sensitivity threshold.
 *
 * @param result - Pre-computed frame difference analysis
 * @param sensitivity - 0 (no cuts) to 1 (all cuts). Higher = more sensitive.
 * @returns Array of timestamps where scene changes were detected.
 */
export function filterSceneCuts(
  result: SceneAnalysisResult,
  sensitivity: number,
): number[] {
  if (!result.frameDiffs.length || result.maxScore <= 0) return [];
  const clampedSensitivity = Math.max(0, Math.min(1, sensitivity));
  // threshold decreases as sensitivity increases
  const threshold = result.maxScore * (1 - clampedSensitivity);
  return result.frameDiffs
    .filter((d) => d.score > threshold)
    .map((d) => d.time);
}

/**
 * Convert detected cut timestamps to scene range markers.
 * Each scene spans from one cut to the next.
 *
 * @param cutTimes - Sorted array of cut timestamps
 * @param videoDuration - Total video duration for the final scene
 * @returns Array of { startTime, endTime } ranges
 */
export function cutsToSceneRanges(
  cutTimes: number[],
  videoDuration: number,
): Array<{ startTime: number; endTime: number }> {
  if (cutTimes.length === 0) return [];
  const sorted = [...cutTimes].sort((a, b) => a - b);
  const ranges: Array<{ startTime: number; endTime: number }> = [];

  // First scene: 0 → first cut
  if (sorted[0] > 0) {
    ranges.push({ startTime: 0, endTime: sorted[0] });
  }

  // Middle scenes: cut[i] → cut[i+1]
  for (let i = 0; i < sorted.length - 1; i++) {
    ranges.push({ startTime: sorted[i], endTime: sorted[i + 1] });
  }

  // Final scene: last cut → end
  const last = sorted[sorted.length - 1];
  if (last < videoDuration) {
    ranges.push({ startTime: last, endTime: videoDuration });
  }

  return ranges;
}

/**
 * Compute the pixel difference score between two RGBA ImageData buffers.
 * Compares the R channel only (assumes grayscale-converted or near-grayscale input).
 * Used by the scene detection worker.
 *
 * @param prev - RGBA pixel data (4 bytes per pixel) of the previous frame
 * @param curr - RGBA pixel data (4 bytes per pixel) of the current frame
 * @param width - Frame width in pixels
 * @param height - Frame height in pixels
 * @returns Normalized score (0–1), where 1 = completely different frames.
 */
export function computeFrameDiffScore(
  prev: Uint8ClampedArray,
  curr: Uint8ClampedArray,
  width: number,
  height: number,
): number {
  const pixelCount = width * height;
  if (pixelCount === 0) return 0;

  const expectedLength = pixelCount * 4;
  const comparedLength = Math.min(prev.length, curr.length, expectedLength);
  if (comparedLength < 4) return 0;

  let totalDiff = 0;
  for (let i = 0; i < comparedLength; i += 4) {
    totalDiff += Math.abs(prev[i] - curr[i]);
  }

  const comparedPixelCount = comparedLength / 4;
  return totalDiff / (255 * comparedPixelCount);
}

/**
 * Find the nearest marker time to a given position.
 * Used for "jump to next/previous marker" navigation.
 */
export function findNearestMarker(
  markerTimes: number[],
  currentTime: number,
  direction: 'next' | 'previous',
): number | null {
  if (markerTimes.length === 0) return null;
  const sorted = [...markerTimes].sort((a, b) => a - b);
  const epsilon = 0.001; // avoid floating point issues

  if (direction === 'next') {
    const next = sorted.find((t) => t > currentTime + epsilon);
    return next ?? null;
  }

  // Previous: find the last marker before current time
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i] < currentTime - epsilon) {
      return sorted[i];
    }
  }
  return null;
}
