import { describe, it, expect } from 'vitest';
import {
  resolveSceneFollowAction,
} from '../../src/utils/followActions';
import type { SessionScene, SceneFollowActionType } from '../../src/types/project';

function makeScene(index: number, overrides: Partial<SessionScene> = {}): SessionScene {
  return { id: `scene-${index}`, name: `Scene ${index + 1}`, index, ...overrides };
}

describe('resolveSceneFollowAction', () => {
  const scenes = [makeScene(0), makeScene(1), makeScene(2), makeScene(3)];

  it('"next" resolves to the next scene by index', () => {
    const result = resolveSceneFollowAction('next', scenes[1], scenes);
    expect(result?.id).toBe('scene-2');
  });

  it('"next" returns null when at the last scene (no wrap)', () => {
    const result = resolveSceneFollowAction('next', scenes[3], scenes);
    expect(result).toBeNull();
  });

  it('"previous" resolves to the previous scene by index', () => {
    const result = resolveSceneFollowAction('previous', scenes[2], scenes);
    expect(result?.id).toBe('scene-1');
  });

  it('"previous" returns null when at the first scene (no wrap)', () => {
    const result = resolveSceneFollowAction('previous', scenes[0], scenes);
    expect(result).toBeNull();
  });

  it('"random" resolves to some scene in the list', () => {
    const result = resolveSceneFollowAction('random', scenes[0], scenes);
    expect(result === null || scenes.some((s) => s.id === result?.id)).toBe(true);
  });

  it('"random" picks different scenes over many runs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const result = resolveSceneFollowAction('random', scenes[0], scenes);
      if (result) ids.add(result.id);
    }
    // With 4 scenes, we should see at least 2 different picks over 100 iterations
    expect(ids.size).toBeGreaterThanOrEqual(2);
  });

  it('"stop" resolves to null (stop playback)', () => {
    const result = resolveSceneFollowAction('stop', scenes[1], scenes);
    expect(result).toBeNull();
  });

  it('"none" resolves to null (no follow action)', () => {
    const result = resolveSceneFollowAction('none', scenes[1], scenes);
    expect(result).toBeNull();
  });

  it('returns null for empty scenes list', () => {
    const scene = makeScene(0);
    const result = resolveSceneFollowAction('next', scene, []);
    expect(result).toBeNull();
  });

  it('returns null when current scene is not in the list', () => {
    const orphan = makeScene(99);
    const result = resolveSceneFollowAction('next', orphan, scenes);
    expect(result).toBeNull();
  });

  it('handles single-scene list correctly for "next"', () => {
    const single = [makeScene(0)];
    const result = resolveSceneFollowAction('next', single[0], single);
    expect(result).toBeNull();
  });

  it('handles single-scene list correctly for "random"', () => {
    const single = [makeScene(0)];
    const result = resolveSceneFollowAction('random', single[0], single);
    // Only one scene, so random should return it
    expect(result?.id).toBe('scene-0');
  });
});
