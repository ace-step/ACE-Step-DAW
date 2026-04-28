import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSessionStore } from '../sessionStore';
import { resolveFollowAction } from '../../utils/followActionResolver';
import type { SessionScene } from '../../types/project';

describe('Follow action chains with probability weights', () => {
  beforeEach(() => {
    useSessionStore.getState().initSession(['track-1', 'track-2'], 6);
  });

  describe('Extended follow action types', () => {
    it('supports "first" follow action', () => {
      const sceneId = useSessionStore.getState().scenes[3].id;
      useSessionStore.getState().setSceneFollowAction(sceneId, 'first', 4);
      const scene = useSessionStore.getState().scenes.find((s) => s.id === sceneId);
      expect(scene?.followAction).toBe('first');
      expect(scene?.followActionTime).toBe(4);
    });

    it('supports "last" follow action', () => {
      const sceneId = useSessionStore.getState().scenes[0].id;
      useSessionStore.getState().setSceneFollowAction(sceneId, 'last', 2);
      const scene = useSessionStore.getState().scenes.find((s) => s.id === sceneId);
      expect(scene?.followAction).toBe('last');
      expect(scene?.followActionTime).toBe(2);
    });

    it('supports "again" follow action', () => {
      const sceneId = useSessionStore.getState().scenes[1].id;
      useSessionStore.getState().setSceneFollowAction(sceneId, 'again', 4);
      const scene = useSessionStore.getState().scenes.find((s) => s.id === sceneId);
      expect(scene?.followAction).toBe('again');
    });

    it('supports "any" follow action', () => {
      const sceneId = useSessionStore.getState().scenes[2].id;
      useSessionStore.getState().setSceneFollowAction(sceneId, 'any', 8);
      const scene = useSessionStore.getState().scenes.find((s) => s.id === sceneId);
      expect(scene?.followAction).toBe('any');
    });
  });

  describe('Dual follow action with probability', () => {
    it('sets follow action config with actionA, actionB, and chanceA', () => {
      const sceneId = useSessionStore.getState().scenes[0].id;
      useSessionStore.getState().setFollowActionConfig(sceneId, {
        actionA: 'next',
        actionB: 'random',
        chanceA: 0.8,
      });
      const scene = useSessionStore.getState().scenes.find((s) => s.id === sceneId);
      expect(scene?.followActionConfig).toEqual({
        actionA: 'next',
        actionB: 'random',
        chanceA: 0.8,
      });
    });

    it('clamps chanceA to 0-1 range', () => {
      const sceneId = useSessionStore.getState().scenes[0].id;
      useSessionStore.getState().setFollowActionConfig(sceneId, {
        actionA: 'next',
        actionB: 'stop',
        chanceA: 1.5,
      });
      const scene = useSessionStore.getState().scenes.find((s) => s.id === sceneId);
      expect(scene?.followActionConfig?.chanceA).toBe(1);

      useSessionStore.getState().setFollowActionConfig(sceneId, {
        actionA: 'next',
        actionB: 'stop',
        chanceA: -0.5,
      });
      const scene2 = useSessionStore.getState().scenes.find((s) => s.id === sceneId);
      expect(scene2?.followActionConfig?.chanceA).toBe(0);
    });

    it('clearFollowActionConfig removes the config', () => {
      const sceneId = useSessionStore.getState().scenes[0].id;
      useSessionStore.getState().setFollowActionConfig(sceneId, {
        actionA: 'next',
        actionB: 'random',
        chanceA: 0.5,
      });
      expect(useSessionStore.getState().scenes.find((s) => s.id === sceneId)?.followActionConfig).toBeDefined();
      useSessionStore.getState().clearFollowActionConfig(sceneId);
      expect(useSessionStore.getState().scenes.find((s) => s.id === sceneId)?.followActionConfig).toBeUndefined();
    });

    it('ignores unknown scene id for setFollowActionConfig', () => {
      const before = useSessionStore.getState().scenes;
      useSessionStore.getState().setFollowActionConfig('nonexistent', {
        actionA: 'next',
        actionB: 'stop',
        chanceA: 0.5,
      });
      expect(useSessionStore.getState().scenes).toEqual(before);
    });
  });
});

describe('resolveFollowAction', () => {
  function makeScenes(count: number): SessionScene[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `scene-${i}`,
      name: `Scene ${i + 1}`,
      index: i,
    }));
  }

  it('returns null for "none" action', () => {
    const scenes = makeScenes(4);
    scenes[0].followAction = 'none';
    expect(resolveFollowAction(scenes[0], scenes)).toBeNull();
  });

  it('returns null when followAction is undefined', () => {
    const scenes = makeScenes(4);
    expect(resolveFollowAction(scenes[0], scenes)).toBeNull();
  });

  it('resolves "next" to the next scene index', () => {
    const scenes = makeScenes(4);
    scenes[1].followAction = 'next';
    expect(resolveFollowAction(scenes[1], scenes)).toBe(2);
  });

  it('wraps "next" from last scene to first', () => {
    const scenes = makeScenes(4);
    scenes[3].followAction = 'next';
    expect(resolveFollowAction(scenes[3], scenes)).toBe(0);
  });

  it('resolves "previous" to the previous scene index', () => {
    const scenes = makeScenes(4);
    scenes[2].followAction = 'previous';
    expect(resolveFollowAction(scenes[2], scenes)).toBe(1);
  });

  it('wraps "previous" from first scene to last', () => {
    const scenes = makeScenes(4);
    scenes[0].followAction = 'previous';
    expect(resolveFollowAction(scenes[0], scenes)).toBe(3);
  });

  it('resolves "first" to index 0', () => {
    const scenes = makeScenes(4);
    scenes[2].followAction = 'first';
    expect(resolveFollowAction(scenes[2], scenes)).toBe(0);
  });

  it('resolves "last" to the last scene index', () => {
    const scenes = makeScenes(4);
    scenes[0].followAction = 'last';
    expect(resolveFollowAction(scenes[0], scenes)).toBe(3);
  });

  it('resolves "again" to the same scene index', () => {
    const scenes = makeScenes(4);
    scenes[1].followAction = 'again';
    expect(resolveFollowAction(scenes[1], scenes)).toBe(1);
  });

  it('resolves "any" to a valid scene index', () => {
    const scenes = makeScenes(4);
    scenes[0].followAction = 'any';
    const result = resolveFollowAction(scenes[0], scenes);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(4);
  });

  it('resolves "random" to a different scene index (when possible)', () => {
    const scenes = makeScenes(4);
    scenes[0].followAction = 'random';
    // Run multiple times - "random" should pick other scenes
    const results = new Set<number>();
    for (let i = 0; i < 100; i++) {
      const r = resolveFollowAction(scenes[0], scenes);
      if (r !== null) results.add(r);
    }
    // Should never include current scene for "random"
    expect(results.has(0)).toBe(false);
    expect(results.size).toBeGreaterThan(0);
  });

  it('resolves "random" to same scene when only 1 scene exists', () => {
    const scenes = makeScenes(1);
    scenes[0].followAction = 'random';
    expect(resolveFollowAction(scenes[0], scenes)).toBe(0);
  });

  it('resolves "stop" to -1 (sentinel for stop)', () => {
    const scenes = makeScenes(4);
    scenes[1].followAction = 'stop';
    expect(resolveFollowAction(scenes[1], scenes)).toBe(-1);
  });

  it('returns null for empty scenes array', () => {
    const scene: SessionScene = { id: 'x', name: 'X', index: 0, followAction: 'next' };
    expect(resolveFollowAction(scene, [])).toBeNull();
  });

  describe('dual follow action with probability', () => {
    it('respects chanceA = 1 (always actionA)', () => {
      const scenes = makeScenes(4);
      scenes[0].followActionConfig = { actionA: 'next', actionB: 'last', chanceA: 1 };
      // With chanceA=1, should always pick next (index 1)
      for (let i = 0; i < 20; i++) {
        expect(resolveFollowAction(scenes[0], scenes)).toBe(1);
      }
    });

    it('respects chanceA = 0 (always actionB)', () => {
      const scenes = makeScenes(4);
      scenes[0].followActionConfig = { actionA: 'next', actionB: 'last', chanceA: 0 };
      // With chanceA=0, should always pick last (index 3)
      for (let i = 0; i < 20; i++) {
        expect(resolveFollowAction(scenes[0], scenes)).toBe(3);
      }
    });

    it('followActionConfig takes precedence over followAction', () => {
      const scenes = makeScenes(4);
      scenes[0].followAction = 'stop'; // would return -1
      scenes[0].followActionConfig = { actionA: 'first', actionB: 'first', chanceA: 1 };
      expect(resolveFollowAction(scenes[0], scenes)).toBe(0);
    });

    it('handles mixed probability (produces both outcomes over many runs)', () => {
      const scenes = makeScenes(4);
      scenes[1].followActionConfig = { actionA: 'next', actionB: 'first', chanceA: 0.5 };
      const results = new Set<number>();
      for (let i = 0; i < 200; i++) {
        const r = resolveFollowAction(scenes[1], scenes);
        if (r !== null) results.add(r);
      }
      // next = 2, first = 0
      expect(results.has(2)).toBe(true);
      expect(results.has(0)).toBe(true);
    });
  });
});
