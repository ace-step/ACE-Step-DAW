import type { Track } from '../types/project';

export interface ClipLayoutItem {
  trackIndex: number;
  startNorm: number;
  widthNorm: number;
  color: string;
}

/**
 * Build a normalized clip layout from tracks for thumbnail rendering.
 * Each clip is mapped to a 0-1 coordinate space based on totalDuration.
 */
export function buildClipLayout(tracks: Track[], totalDuration: number): ClipLayoutItem[] {
  if (totalDuration <= 0 || tracks.length === 0) return [];

  const items: ClipLayoutItem[] = [];

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    for (const clip of track.clips) {
      const startNorm = Math.max(0, clip.startTime / totalDuration);
      const widthNorm = Math.min(1 - startNorm, clip.duration / totalDuration);
      items.push({
        trackIndex: i,
        startNorm,
        widthNorm,
        color: track.color,
      });
    }
  }

  return items;
}
