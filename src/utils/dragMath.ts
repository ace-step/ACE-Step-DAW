/**
 * dragMath.ts — Pure functions for drag/drop calculations.
 * Extracted so AI agents can unit test drag logic without DOM interaction.
 */
import { snapToGrid } from './time';

/** Minimum clip duration in seconds */
export const MIN_CLIP_DURATION = 0.5;

/**
 * Calculate new clip position after a horizontal move drag.
 */
export function calcClipMove(
  origStart: number,
  deltaPx: number,
  pixelsPerSecond: number,
  bpm: number,
  totalDuration: number,
  snap: boolean = true,
): number {
  const deltaSec = deltaPx / pixelsPerSecond;
  const raw = origStart + deltaSec;
  const snapped = snap ? snapToGrid(raw, bpm, 1) : raw;
  return Math.max(0, Math.min(snapped, totalDuration - MIN_CLIP_DURATION));
}

/**
 * Calculate new clip duration after a right-edge resize.
 */
export function calcClipResizeRight(
  origDuration: number,
  deltaPx: number,
  pixelsPerSecond: number,
  bpm: number,
  clipStart: number,
  totalDuration: number,
  snap: boolean = true,
): number {
  const deltaSec = deltaPx / pixelsPerSecond;
  const raw = origDuration + deltaSec;
  const snapped = snap ? snapToGrid(raw, bpm, 1) : raw;
  const clamped = Math.max(MIN_CLIP_DURATION, snapped);
  return Math.min(clamped, totalDuration - clipStart);
}

/**
 * Calculate new start + duration after a left-edge resize.
 */
export function calcClipResizeLeft(
  origStart: number,
  origDuration: number,
  deltaPx: number,
  pixelsPerSecond: number,
  bpm: number,
  origAudioOffset: number = 0,
  snap: boolean = true,
): { startTime: number; duration: number; audioOffset: number } {
  const deltaSec = deltaPx / pixelsPerSecond;
  const raw = origStart + deltaSec;
  const newStart = snap ? snapToGrid(raw, bpm, 1) : raw;
  const clampedStart = Math.max(0, newStart);
  const newDuration = origDuration + (origStart - clampedStart);
  const newAudioOffset = Math.max(0, origAudioOffset + (clampedStart - origStart));

  if (newDuration < MIN_CLIP_DURATION) {
    return { startTime: origStart, duration: origDuration, audioOffset: origAudioOffset };
  }

  return { startTime: clampedStart, duration: newDuration, audioOffset: newAudioOffset };
}

/**
 * Convert pixel X to time (seconds) on the timeline.
 */
export function pxToTime(px: number, pixelsPerSecond: number): number {
  return px / pixelsPerSecond;
}

/**
 * Convert time (seconds) to pixel X on the timeline.
 */
export function timeToPx(time: number, pixelsPerSecond: number): number {
  return time * pixelsPerSecond;
}

/**
 * Find the closest track lane element at a given Y coordinate.
 * Returns the track ID from `data-track-id` attribute, or null.
 */
export function findClosestTrackId(
  lanes: Array<{ trackId: string; top: number; bottom: number }>,
  clientY: number,
): string | null {
  for (const lane of lanes) {
    if (clientY >= lane.top && clientY <= lane.bottom) {
      return lane.trackId;
    }
  }
  return null;
}
