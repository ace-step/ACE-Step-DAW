export interface SessionSlotProgress {
  /** Position within current loop, 0–1 */
  progress: number;
  /** Current loop number (1-indexed: 1 = first loop) */
  loopCount: number;
}

/**
 * Compute loop progress and count for a session clip that launched at a given time.
 *
 * @param currentTime  – transport current time in seconds
 * @param launchedAt   – transport time when the clip was launched
 * @param clipDuration – duration of one loop iteration in seconds
 */
export function getSessionSlotProgress(
  currentTime: number,
  launchedAt: number,
  clipDuration: number,
): SessionSlotProgress {
  if (clipDuration <= 0) return { progress: 0, loopCount: 1 };
  const elapsed = Math.max(0, currentTime - launchedAt);
  const loopCount = Math.floor(elapsed / clipDuration) + 1;
  const progress = (elapsed % clipDuration) / clipDuration;
  return { progress, loopCount };
}
