import type {
  SessionClipSlot,
  SessionScene,
  FollowActionConfig,
  FollowActionType,
} from '../types/project';

/**
 * Detect clip groups — consecutive occupied slots on the same track,
 * ordered by scene index. Empty slots act as group boundaries.
 */
export function detectClipGroups(
  slots: SessionClipSlot[],
  scenes: SessionScene[],
  trackId: string,
): SessionClipSlot[][] {
  // Build a map from sceneId -> scene index for ordering
  const sceneIndexMap = new Map(scenes.map((s) => [s.id, s.index]));

  // Filter to the target track and sort by scene index
  const trackSlots = slots
    .filter((s) => s.trackId === trackId)
    .sort((a, b) => (sceneIndexMap.get(a.sceneId) ?? 0) - (sceneIndexMap.get(b.sceneId) ?? 0));

  const groups: SessionClipSlot[][] = [];
  let currentGroup: SessionClipSlot[] = [];

  for (const slot of trackSlots) {
    if (slot.clipId !== null) {
      currentGroup.push(slot);
    } else {
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup = [];
      }
    }
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

/**
 * Resolve a follow action type to the target clip slot.
 * Returns null for 'stop' action (meaning stop playback).
 */
export function resolveFollowAction(
  action: FollowActionType,
  currentSlot: SessionClipSlot,
  group: SessionClipSlot[],
): SessionClipSlot | null {
  const currentIndex = group.findIndex((s) => s.id === currentSlot.id);
  if (currentIndex === -1) return null;

  switch (action) {
    case 'stop':
      return null;

    case 'again':
      return currentSlot;

    case 'next': {
      const nextIndex = (currentIndex + 1) % group.length;
      return group[nextIndex];
    }

    case 'previous': {
      const prevIndex = (currentIndex - 1 + group.length) % group.length;
      return group[prevIndex];
    }

    case 'first':
      return group[0];

    case 'last':
      return group[group.length - 1];

    case 'any': {
      const randomIndex = Math.floor(Math.random() * group.length);
      return group[randomIndex];
    }

    case 'other': {
      if (group.length <= 1) {
        // Fallback: only one clip, play again
        return currentSlot;
      }
      const others = group.filter((s) => s.id !== currentSlot.id);
      const randomIndex = Math.floor(Math.random() * others.length);
      return others[randomIndex];
    }

    default:
      return null;
  }
}

/**
 * Roll between action A and action B based on the configured probability.
 * Returns action A with probability chanceA, action B otherwise.
 */
export function rollFollowAction(config: FollowActionConfig): FollowActionType {
  return Math.random() < config.chanceA ? config.actionA : config.actionB;
}
