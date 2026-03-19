import type { Track } from '../types/project';

/**
 * Build a flat, ordered list of visible tracks that respects the group hierarchy.
 *
 * - Top-level tracks (no parentId) are emitted in sort order.
 * - For each group track, its direct children follow immediately (if not collapsed).
 * - Children of collapsed groups are omitted entirely.
 *
 * @param tracks  All project tracks (unsorted).
 * @returns       Ordered array of visible tracks, each annotated with its nesting depth (0 or 1).
 */
export function buildVisibleTracks(tracks: Track[]): { track: Track; depth: number }[] {
  const sorted = [...tracks].sort((a, b) => a.order - b.order);
  const result: { track: Track; depth: number }[] = [];

  for (const track of sorted) {
    if (track.parentId) continue; // child tracks are emitted by their parent

    result.push({ track, depth: 0 });

    if (track.isGroup && !track.collapsed) {
      const children = sorted.filter((t) => t.parentId === track.id);
      for (const child of children) {
        result.push({ track: child, depth: 1 });
      }
    }
  }

  return result;
}
