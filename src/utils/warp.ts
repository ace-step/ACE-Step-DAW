/**
 * Audio warping / time-stretching utilities.
 *
 * Calculates playback rates for tempo-matching imported clips to the project BPM.
 */

/**
 * Calculate the playback rate needed to match a source BPM to a target BPM.
 * Returns 1.0 when either BPM is missing or zero.
 */
export function calcTempoMatchRate(sourceBpm: number, targetBpm: number): number {
  if (!sourceBpm || sourceBpm <= 0 || !targetBpm || targetBpm <= 0) return 1;
  return targetBpm / sourceBpm;
}

/**
 * Get the effective playback rate for a clip, considering explicit timeStretchRate
 * and sourceBpm-based tempo matching.
 *
 * Priority:
 * 1. Explicit `timeStretchRate` if set (user override)
 * 2. Auto-calculated from `sourceBpm` → `projectBpm` if sourceBpm is set
 * 3. 1.0 (no stretching)
 */
export function getEffectivePlaybackRate(
  clip: { timeStretchRate?: number; sourceBpm?: number },
  projectBpm: number,
): number {
  if (clip.timeStretchRate != null && clip.timeStretchRate > 0) {
    return clip.timeStretchRate;
  }
  if (clip.sourceBpm && clip.sourceBpm > 0) {
    return calcTempoMatchRate(clip.sourceBpm, projectBpm);
  }
  return 1;
}

/**
 * Calculate the stretched duration of a clip given its original duration and playback rate.
 * Duration shrinks when rate > 1 (faster), grows when rate < 1 (slower).
 */
export function getStretchedDuration(originalDuration: number, playbackRate: number): number {
  if (playbackRate <= 0) return originalDuration;
  return originalDuration / playbackRate;
}
