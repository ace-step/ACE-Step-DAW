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
 *
 * Uses the rounded integer FPS consistently for all arithmetic
 * to avoid drift with non-integer rates like 29.97 or 23.976.
 */
export function formatTimecode(timeSeconds: number, frameRate: number): string {
  const pad2 = (n: number) => n.toString().padStart(2, '0');
  const fps = Math.round(frameRate);
  if (!Number.isFinite(fps) || fps <= 0) {
    return '00:00:00:00';
  }

  const totalFrames = Math.floor(Math.abs(timeSeconds) * fps);
  const ff = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
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
 * Clamps to source file end in frame units to ensure frame-alignment.
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

  // Clamp in frame units so the result stays frame-aligned
  if (frameRate <= 0) {
    const clampedEnd = Math.min(snapped, maxEnd);
    if (clampedEnd <= currentStartTime + minDuration) return null;
    return { duration: clampedEnd - currentStartTime };
  }

  const snappedFrame = Math.round(snapped * frameRate);
  const maxEndFrame = Math.floor(maxEnd * frameRate);
  const clampedEndFrame = Math.min(snappedFrame, maxEndFrame);
  const clampedEnd = clampedEndFrame / frameRate;

  if (clampedEnd <= currentStartTime + minDuration) return null;
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
