import type { Track, SessionClipSlot, SessionScene } from '../types/project';

/**
 * Gather context from adjacent clip slots to build a prompt for AI fill.
 * Looks at clips in the same track (before and after the target scene),
 * and clips in the same scene (across other tracks).
 */
export function gatherAiFillContext(
  track: Track,
  sceneIndex: number,
  scenes: SessionScene[],
  slots: SessionClipSlot[],
  allTracks: Track[],
): {
  prompt: string;
  adjacentClipIds: string[];
} {
  const adjacentClipIds: string[] = [];
  const prompts: string[] = [];

  // Look at adjacent clips on the same track (by scene index)
  const trackSlots = slots
    .filter((s) => s.trackId === track.id && s.clipId !== null)
    .map((s) => ({
      slot: s,
      sceneIdx: scenes.findIndex((sc) => sc.id === s.sceneId),
      clip: track.clips.find((c) => c.id === s.clipId),
    }))
    .filter((item) => item.clip && item.sceneIdx >= 0)
    .sort((a, b) => Math.abs(a.sceneIdx - sceneIndex) - Math.abs(b.sceneIdx - sceneIndex));

  // Take up to 3 nearest clips from the same track
  for (const item of trackSlots.slice(0, 3)) {
    if (!item.clip) continue;
    adjacentClipIds.push(item.clip.id);
    if (item.clip.prompt?.trim()) prompts.push(item.clip.prompt.trim());
  }

  // Also look at clips in the same scene on other tracks
  const targetSceneId = scenes[sceneIndex]?.id;
  if (targetSceneId) {
    const sameSceneSlots = slots
      .filter((s) => s.sceneId === targetSceneId && s.trackId !== track.id && s.clipId !== null);
    for (const s of sameSceneSlots.slice(0, 2)) {
      const otherTrack = allTracks.find((t) => t.id === s.trackId);
      const clip = otherTrack?.clips.find((c) => c.id === s.clipId);
      if (clip) {
        adjacentClipIds.push(clip.id);
        if (clip.prompt?.trim()) prompts.push(clip.prompt.trim());
      }
    }
  }

  // Build a composite prompt from adjacent clips
  const uniquePrompts = [...new Set(prompts)];
  let prompt = '';
  if (uniquePrompts.length > 0) {
    prompt = uniquePrompts[0];
  }
  if (!prompt.trim()) {
    prompt = `${track.displayName} clip for scene ${sceneIndex + 1}`;
  }

  return {
    prompt: prompt.trim(),
    adjacentClipIds,
  };
}
