import type { SessionScene, SceneFollowActionType } from '../types/project';

/**
 * Resolve a single follow action type to a target scene index.
 * Returns null for 'none', -1 for 'stop', or the target scene index.
 */
function resolveActionType(
  actionType: SceneFollowActionType,
  currentScene: SessionScene,
  scenes: SessionScene[],
): number | null {
  if (scenes.length === 0) return null;

  switch (actionType) {
    case 'none':
      return null;
    case 'stop':
      return -1;
    case 'next':
      return (currentScene.index + 1) % scenes.length;
    case 'previous':
      return (currentScene.index - 1 + scenes.length) % scenes.length;
    case 'first':
      return 0;
    case 'last':
      return scenes.length - 1;
    case 'again':
      return currentScene.index;
    case 'any':
      return Math.floor(Math.random() * scenes.length);
    case 'random': {
      if (scenes.length <= 1) return currentScene.index;
      const others = scenes.filter((s) => s.index !== currentScene.index);
      return others[Math.floor(Math.random() * others.length)].index;
    }
    default:
      return null;
  }
}

/**
 * Resolve the follow action for a scene, considering dual follow action config
 * with probability weighting. Returns:
 * - null: no action / do nothing
 * - -1: stop playback
 * - >= 0: target scene index to launch
 */
export function resolveFollowAction(
  scene: SessionScene,
  scenes: SessionScene[],
): number | null {
  if (scenes.length === 0) return null;

  // Dual follow action config takes precedence
  if (scene.followActionConfig) {
    const { actionA, actionB, chanceA } = scene.followActionConfig;
    const chosen = Math.random() < chanceA ? actionA : actionB;
    return resolveActionType(chosen, scene, scenes);
  }

  // Legacy single follow action
  if (!scene.followAction || scene.followAction === 'none') return null;
  return resolveActionType(scene.followAction, scene, scenes);
}
