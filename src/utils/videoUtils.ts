/**
 * Video editing utilities — frame snapping, timecode formatting.
 * Phase 6 of the video track epic (#1144).
 */

/**
 * Snap a time value to the nearest frame boundary.
 */
export function snapToFrame(timeSeconds: number, frameRate: number): number {
  if (frameRate <= 0) return timeSeconds;
  const frameDuration = 1 / frameRate;
  return Math.round(timeSeconds / frameDuration) * frameDuration;
}

/**
 * Format a time in seconds as timecode: HH:MM:SS:FF
 */
export function formatTimecode(timeSeconds: number, frameRate: number): string {
  const totalFrames = Math.floor(Math.abs(timeSeconds) * frameRate);
  const fps = Math.round(frameRate);
  const ff = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  const pad2 = (n: number) => n.toString().padStart(2, '0');
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}:${pad2(ff)}`;
}

/**
 * Compute new clip values after trimming the left (start) edge.
 * Adjusts both startTime and sourceOffset so the visual position matches
 * the source file position.
 */
export function computeLeftTrim(
  currentStartTime: number,
  currentDuration: number,
  currentSourceOffset: number,
  newStartTime: number,
  frameRate: number,
  fileDuration: number,
): { startTime: number; duration: number; sourceOffset: number } | null {
  const snapped = snapToFrame(newStartTime, frameRate);
  const clipEnd = currentStartTime + currentDuration;
  // Can't trim past the right edge (minimum 1 frame)
  const minDuration = 1 / (frameRate > 0 ? frameRate : 30);
  if (snapped >= clipEnd - minDuration) return null;
  // Can't move start before the source file start
  const delta = snapped - currentStartTime;
  const newSourceOffset = currentSourceOffset + delta;
  if (newSourceOffset < 0) return null;

  return {
    startTime: snapped,
    duration: clipEnd - snapped,
    sourceOffset: newSourceOffset,
  };
}

/**
 * Compute new clip values after trimming the right (end) edge.
 * Adjusts only duration; sourceOffset stays the same.
 */
export function computeRightTrim(
  currentStartTime: number,
  currentSourceOffset: number,
  newEndTime: number,
  frameRate: number,
  fileDuration: number,
): { duration: number } | null {
  const snapped = snapToFrame(newEndTime, frameRate);
  const minDuration = 1 / (frameRate > 0 ? frameRate : 30);
  if (snapped <= currentStartTime + minDuration) return null;
  // Can't extend beyond source file end
  const maxEnd = currentStartTime + (fileDuration - currentSourceOffset);
  const clampedEnd = Math.min(snapped, maxEnd);
  return { duration: clampedEnd - currentStartTime };
}

/**
 * Compute the two clips resulting from splitting a video clip at a time point.
 * Both clips reference the same source file with adjusted sourceOffset/duration.
 */
export function computeVideoSplit(
  clipStartTime: number,
  clipDuration: number,
  sourceOffset: number,
  splitTime: number,
  frameRate: number,
): { left: { duration: number }; right: { startTime: number; duration: number; sourceOffset: number } } | null {
  const snapped = snapToFrame(splitTime, frameRate);
  const clipEnd = clipStartTime + clipDuration;
  const minDuration = 1 / (frameRate > 0 ? frameRate : 30);
  // Split must be inside the clip
  if (snapped <= clipStartTime + minDuration || snapped >= clipEnd - minDuration) return null;

  const leftDuration = snapped - clipStartTime;
  const rightDuration = clipEnd - snapped;
  const rightSourceOffset = sourceOffset + leftDuration;

  return {
    left: { duration: leftDuration },
    right: { startTime: snapped, duration: rightDuration, sourceOffset: rightSourceOffset },
  };
}
