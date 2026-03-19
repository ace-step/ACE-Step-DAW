import type { Clip } from '../types/project';

/** A computed crossfade region between two overlapping clips on the same track. */
export interface CrossfadeRegion {
  /** ID of the outgoing (earlier) clip. */
  clipAId: string;
  /** ID of the incoming (later) clip. */
  clipBId: string;
  /** Start time of the overlap in seconds. */
  startTime: number;
  /** End time of the overlap in seconds. */
  endTime: number;
  /** Duration of the crossfade in seconds. */
  duration: number;
}

type CrossfadeCurve = 'linear' | 'equal-power';

/**
 * Compute crossfade regions from a list of clips on the same track.
 * Returns all pairwise overlaps sorted by start time.
 */
export function computeCrossfadeRegions(
  clips: Pick<Clip, 'id' | 'startTime' | 'duration'>[],
): CrossfadeRegion[] {
  if (clips.length < 2) return [];

  const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
  const regions: CrossfadeRegion[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const aEnd = a.startTime + a.duration;
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      if (b.startTime >= aEnd) break; // no overlap possible with further clips
      const overlapStart = b.startTime;
      const overlapEnd = Math.min(aEnd, b.startTime + b.duration);
      if (overlapEnd > overlapStart) {
        regions.push({
          clipAId: a.id,
          clipBId: b.id,
          startTime: overlapStart,
          endTime: overlapEnd,
          duration: overlapEnd - overlapStart,
        });
      }
    }
  }

  return regions;
}

/**
 * Get the gain value at a specific time within a crossfade region.
 * @param regionStart - Start of the crossfade region
 * @param regionEnd - End of the crossfade region
 * @param time - Current time to evaluate
 * @param direction - 'in' for incoming clip (0→1), 'out' for outgoing clip (1→0)
 * @param curve - Crossfade curve type
 */
export function getCrossfadeGainAtTime(
  regionStart: number,
  regionEnd: number,
  time: number,
  direction: 'in' | 'out',
  curve: CrossfadeCurve = 'linear',
): number {
  const duration = regionEnd - regionStart;
  if (duration <= 0) return direction === 'in' ? 1 : 0;

  const progress = Math.max(0, Math.min(1, (time - regionStart) / duration));

  if (curve === 'equal-power') {
    if (direction === 'in') {
      return Math.sin((progress * Math.PI) / 2);
    }
    return Math.cos((progress * Math.PI) / 2);
  }

  // linear
  return direction === 'in' ? progress : 1 - progress;
}
