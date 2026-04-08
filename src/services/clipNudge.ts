import { useProjectStore } from '../store/projectStore';
import { useUIStore } from '../store/uiStore';
import { getBeatDuration } from '../utils/time';

/**
 * Nudge all selected clips left or right by one beat step.
 * Uses beginDrag/batchMoveClips/endDrag for undo support.
 */
export function nudgeSelectedClips(direction: 'left' | 'right'): void {
  const project = useProjectStore.getState().project;
  if (!project) return;

  const selectedClipIds = useUIStore.getState().selectedClipIds;
  if (selectedClipIds.size === 0) return;

  const beatDuration = getBeatDuration(project.bpm);
  const offset = direction === 'right' ? beatDuration : -beatDuration;

  const store = useProjectStore.getState();
  store.beginDrag({ label: `Nudge clips ${direction}` });
  store.batchMoveClips(Array.from(selectedClipIds), offset);
  store.endDrag();
}

/**
 * Move all selected clips to the adjacent track (up or down).
 * Clips that are already at the boundary (first/last track) are not moved.
 * Preserves each clip's startTime.
 */
export function nudgeSelectedClipsToTrack(direction: 'up' | 'down'): void {
  const project = useProjectStore.getState().project;
  if (!project) return;

  const selectedClipIds = useUIStore.getState().selectedClipIds;
  if (selectedClipIds.size === 0) return;

  // Sort tracks by order to determine adjacency (return tracks are separate in project.returnTracks)
  const sortedTracks = [...project.tracks]
    .sort((a, b) => a.order - b.order);

  if (sortedTracks.length < 2) return;

  // Build lookup: trackId -> index in sorted order
  const trackIndexMap = new Map(sortedTracks.map((t, i) => [t.id, i]));

  // Find all selected clips and their current tracks
  const clipsToMove: { clipId: string; currentTrackId: string; currentTrackIndex: number }[] = [];
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (selectedClipIds.has(clip.id)) {
        const idx = trackIndexMap.get(track.id);
        if (idx !== undefined) {
          clipsToMove.push({ clipId: clip.id, currentTrackId: track.id, currentTrackIndex: idx });
        }
      }
    }
  }

  if (clipsToMove.length === 0) return;

  // Check if ALL clips can move in the desired direction
  const targetOffset = direction === 'up' ? -1 : 1;
  const canMoveAll = clipsToMove.every((c) => {
    const targetIndex = c.currentTrackIndex + targetOffset;
    return targetIndex >= 0 && targetIndex < sortedTracks.length;
  });

  if (!canMoveAll) return;

  // Move each clip to its target track
  const store = useProjectStore.getState();
  for (const c of clipsToMove) {
    const targetTrack = sortedTracks[c.currentTrackIndex + targetOffset];
    store.moveClipToTrack(c.clipId, targetTrack.id);
  }
}
