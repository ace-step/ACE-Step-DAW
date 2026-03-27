import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore } from '../sessionStore';

describe('Scene properties and follow actions', () => {
  beforeEach(() => {
    useSessionStore.getState().initSession(['track-1', 'track-2'], 4);
  });

  describe('updateSceneProperties', () => {
    it('sets tempo override on a scene', () => {
      const sceneId = useSessionStore.getState().scenes[0].id;
      useSessionStore.getState().updateSceneProperties(sceneId, { tempo: 140 });
      const scene = useSessionStore.getState().scenes.find((s) => s.id === sceneId);
      expect(scene?.tempo).toBe(140);
    });

    it('sets time signature override on a scene', () => {
      const sceneId = useSessionStore.getState().scenes[1].id;
      useSessionStore.getState().updateSceneProperties(sceneId, { timeSignature: [3, 4] });
      const scene = useSessionStore.getState().scenes.find((s) => s.id === sceneId);
      expect(scene?.timeSignature).toEqual([3, 4]);
    });

    it('sets multiple properties at once', () => {
      const sceneId = useSessionStore.getState().scenes[0].id;
      useSessionStore.getState().updateSceneProperties(sceneId, { tempo: 160, timeSignature: [6, 8] });
      const scene = useSessionStore.getState().scenes.find((s) => s.id === sceneId);
      expect(scene?.tempo).toBe(160);
      expect(scene?.timeSignature).toEqual([6, 8]);
    });

    it('clears a property when set to undefined', () => {
      const sceneId = useSessionStore.getState().scenes[0].id;
      useSessionStore.getState().updateSceneProperties(sceneId, { tempo: 120 });
      expect(useSessionStore.getState().scenes.find((s) => s.id === sceneId)?.tempo).toBe(120);
      useSessionStore.getState().updateSceneProperties(sceneId, { tempo: undefined });
      expect(useSessionStore.getState().scenes.find((s) => s.id === sceneId)?.tempo).toBeUndefined();
    });

    it('does not modify other scenes', () => {
      const scenes = useSessionStore.getState().scenes;
      useSessionStore.getState().updateSceneProperties(scenes[0].id, { tempo: 200 });
      const updated = useSessionStore.getState().scenes;
      expect(updated.find((s) => s.id === scenes[0].id)?.tempo).toBe(200);
      expect(updated.find((s) => s.id === scenes[1].id)?.tempo).toBeUndefined();
    });

    it('ignores unknown scene id', () => {
      const before = useSessionStore.getState().scenes;
      useSessionStore.getState().updateSceneProperties('nonexistent-id', { tempo: 100 });
      expect(useSessionStore.getState().scenes).toEqual(before);
    });
  });

  describe('setSceneFollowAction', () => {
    it('sets follow action type and bars', () => {
      const sceneId = useSessionStore.getState().scenes[0].id;
      useSessionStore.getState().setSceneFollowAction(sceneId, 'next', 4);
      const scene = useSessionStore.getState().scenes.find((s) => s.id === sceneId);
      expect(scene?.followAction).toBe('next');
      expect(scene?.followActionTime).toBe(4);
    });

    it('sets follow action to stop', () => {
      const sceneId = useSessionStore.getState().scenes[2].id;
      useSessionStore.getState().setSceneFollowAction(sceneId, 'stop', 2);
      const scene = useSessionStore.getState().scenes.find((s) => s.id === sceneId);
      expect(scene?.followAction).toBe('stop');
      expect(scene?.followActionTime).toBe(2);
    });

    it('sets follow action to none and clears followActionTime', () => {
      const sceneId = useSessionStore.getState().scenes[0].id;
      useSessionStore.getState().setSceneFollowAction(sceneId, 'next', 4);
      useSessionStore.getState().setSceneFollowAction(sceneId, 'none');
      const scene = useSessionStore.getState().scenes.find((s) => s.id === sceneId);
      expect(scene?.followAction).toBe('none');
      expect(scene?.followActionTime).toBeUndefined();
    });

    it('sets random follow action', () => {
      const sceneId = useSessionStore.getState().scenes[1].id;
      useSessionStore.getState().setSceneFollowAction(sceneId, 'random', 8);
      const scene = useSessionStore.getState().scenes.find((s) => s.id === sceneId);
      expect(scene?.followAction).toBe('random');
      expect(scene?.followActionTime).toBe(8);
    });

    it('sets previous follow action', () => {
      const sceneId = useSessionStore.getState().scenes[3].id;
      useSessionStore.getState().setSceneFollowAction(sceneId, 'previous', 1);
      const scene = useSessionStore.getState().scenes.find((s) => s.id === sceneId);
      expect(scene?.followAction).toBe('previous');
      expect(scene?.followActionTime).toBe(1);
    });
  });

  describe('scene properties persist through addScene', () => {
    it('new scenes have no tempo/timeSignature/followAction by default', () => {
      useSessionStore.getState().addScene(['track-1', 'track-2']);
      const scenes = useSessionStore.getState().scenes;
      const lastScene = scenes[scenes.length - 1];
      expect(lastScene.tempo).toBeUndefined();
      expect(lastScene.timeSignature).toBeUndefined();
      expect(lastScene.followAction).toBeUndefined();
      expect(lastScene.followActionTime).toBeUndefined();
    });
  });
});
