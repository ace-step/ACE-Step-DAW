import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('Scene follow action config (dual A/B with probability)', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    // Add a track so session initialization works
    useProjectStore.getState().addTrack('audio');
  });

  function getScene(sceneId: string) {
    return useProjectStore.getState().project!.session!.scenes.find((s) => s.id === sceneId);
  }

  function firstSceneId(): string {
    return useProjectStore.getState().project!.session!.scenes[0].id;
  }

  describe('setSessionSceneFollowActionConfig', () => {
    it('sets a dual follow action config on a scene', () => {
      const id = firstSceneId();
      useProjectStore.getState().setSessionSceneFollowActionConfig(id, {
        actionA: 'next',
        actionB: 'random',
        chanceA: 0.7,
      });
      const scene = getScene(id);
      expect(scene?.followActionConfig).toEqual({
        actionA: 'next',
        actionB: 'random',
        chanceA: 0.7,
      });
    });

    it('clamps chanceA to 0-1 range', () => {
      const id = firstSceneId();
      useProjectStore.getState().setSessionSceneFollowActionConfig(id, {
        actionA: 'next',
        actionB: 'stop',
        chanceA: 1.5,
      });
      expect(getScene(id)?.followActionConfig?.chanceA).toBe(1);

      useProjectStore.getState().setSessionSceneFollowActionConfig(id, {
        actionA: 'next',
        actionB: 'stop',
        chanceA: -0.3,
      });
      expect(getScene(id)?.followActionConfig?.chanceA).toBe(0);
    });

    it('ignores unknown scene id', () => {
      const before = useProjectStore.getState().project!.session!.scenes;
      useProjectStore.getState().setSessionSceneFollowActionConfig('nonexistent', {
        actionA: 'next',
        actionB: 'stop',
        chanceA: 0.5,
      });
      expect(useProjectStore.getState().project!.session!.scenes).toEqual(before);
    });

    it('does not affect other scenes', () => {
      const scenes = useProjectStore.getState().project!.session!.scenes;
      const id0 = scenes[0].id;
      const id1 = scenes[1].id;
      useProjectStore.getState().setSessionSceneFollowActionConfig(id0, {
        actionA: 'first',
        actionB: 'last',
        chanceA: 0.5,
      });
      expect(getScene(id0)?.followActionConfig).toBeDefined();
      expect(getScene(id1)?.followActionConfig).toBeUndefined();
    });
  });

  describe('clearSessionSceneFollowActionConfig', () => {
    it('removes the follow action config', () => {
      const id = firstSceneId();
      useProjectStore.getState().setSessionSceneFollowActionConfig(id, {
        actionA: 'next',
        actionB: 'random',
        chanceA: 0.5,
      });
      expect(getScene(id)?.followActionConfig).toBeDefined();
      useProjectStore.getState().clearSessionSceneFollowActionConfig(id);
      expect(getScene(id)?.followActionConfig).toBeUndefined();
    });
  });

  describe('extended SceneFollowActionType', () => {
    it('supports first, last, again, any in scene follow action', () => {
      const id = firstSceneId();
      for (const action of ['first', 'last', 'again', 'any'] as const) {
        useProjectStore.getState().setSessionSceneFollowAction(id, action, 4);
        expect(getScene(id)?.followAction).toBe(action);
      }
    });
  });
});
