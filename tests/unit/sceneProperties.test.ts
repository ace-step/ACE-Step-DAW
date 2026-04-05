import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';

function initProject() {
  useProjectStore.getState().createProject({
    name: 'Test',
    bpm: 120,
    timeSignature: 4,
  });
  // Create a scene so tests have something to work with
  useProjectStore.getState().createSessionScene('Scene 1');
}

function getScenes() {
  return useProjectStore.getState().project?.session?.scenes ?? [];
}

describe('Scene Properties (#1033)', () => {
  beforeEach(() => {
    initProject();
  });

  describe('scene creation', () => {
    it('creates scenes with session initialization', () => {
      const scenes = getScenes();
      expect(scenes.length).toBeGreaterThan(0);
      expect(scenes[0]).toHaveProperty('id');
      expect(scenes[0]).toHaveProperty('name');
      expect(scenes[0]).toHaveProperty('index');
    });
  });

  describe('updateSessionSceneProperties', () => {
    it('sets tempo override on a scene', () => {
      const scenes = getScenes();
      expect(scenes.length).toBeGreaterThan(0);
      const sceneId = scenes[0].id;

      useProjectStore.getState().updateSessionSceneProperties(sceneId, { tempo: 140 });
      const updated = getScenes().find((s) => s.id === sceneId);
      expect(updated?.tempo).toBe(140);
    });

    it('sets time signature override on a scene', () => {
      const scenes = getScenes();
      expect(scenes.length).toBeGreaterThan(0);
      const sceneId = scenes[0].id;

      useProjectStore.getState().updateSessionSceneProperties(sceneId, { timeSignature: [3, 4] });
      const updated = getScenes().find((s) => s.id === sceneId);
      expect(updated?.timeSignature).toEqual([3, 4]);
    });

    it('clears tempo override when set to undefined', () => {
      const scenes = getScenes();
      expect(scenes.length).toBeGreaterThan(0);
      const sceneId = scenes[0].id;

      useProjectStore.getState().updateSessionSceneProperties(sceneId, { tempo: 140 });
      useProjectStore.getState().updateSessionSceneProperties(sceneId, { tempo: undefined });
      const updated = getScenes().find((s) => s.id === sceneId);
      expect(updated?.tempo).toBeUndefined();
    });

    it('clears time signature override when set to undefined', () => {
      const scenes = getScenes();
      expect(scenes.length).toBeGreaterThan(0);
      const sceneId = scenes[0].id;

      useProjectStore.getState().updateSessionSceneProperties(sceneId, { timeSignature: [6, 8] });
      useProjectStore.getState().updateSessionSceneProperties(sceneId, { timeSignature: undefined });
      const updated = getScenes().find((s) => s.id === sceneId);
      expect(updated?.timeSignature).toBeUndefined();
    });

    it('sets color on a scene', () => {
      const scenes = getScenes();
      expect(scenes.length).toBeGreaterThan(0);
      const sceneId = scenes[0].id;

      useProjectStore.getState().updateSessionSceneProperties(sceneId, { color: '#ff6b6b' });
      const updated = getScenes().find((s) => s.id === sceneId);
      expect(updated?.color).toBe('#ff6b6b');
    });

    it('clears color when set to undefined', () => {
      const scenes = getScenes();
      expect(scenes.length).toBeGreaterThan(0);
      const sceneId = scenes[0].id;

      useProjectStore.getState().updateSessionSceneProperties(sceneId, { color: '#ff6b6b' });
      useProjectStore.getState().updateSessionSceneProperties(sceneId, { color: undefined });
      const updated = getScenes().find((s) => s.id === sceneId);
      expect(updated?.color).toBeUndefined();
    });

    it('updates multiple properties at once', () => {
      const scenes = getScenes();
      expect(scenes.length).toBeGreaterThan(0);
      const sceneId = scenes[0].id;

      useProjectStore.getState().updateSessionSceneProperties(sceneId, {
        color: '#4dabf7',
        tempo: 90,
        timeSignature: [7, 8],
      });
      const updated = getScenes().find((s) => s.id === sceneId);
      expect(updated?.color).toBe('#4dabf7');
      expect(updated?.tempo).toBe(90);
      expect(updated?.timeSignature).toEqual([7, 8]);
    });

    it('does nothing for non-existent scene ID', () => {
      const before = structuredClone(getScenes());
      useProjectStore.getState().updateSessionSceneProperties('non-existent', { tempo: 200 });
      expect(getScenes()).toEqual(before);
    });

    it('preserves other scenes when updating one', () => {
      useProjectStore.getState().createSessionScene('Scene 2');
      const scenes = getScenes();
      expect(scenes.length).toBeGreaterThanOrEqual(2);

      useProjectStore.getState().updateSessionSceneProperties(scenes[0].id, { tempo: 100 });
      const updated = getScenes();
      expect(updated[0]?.tempo).toBe(100);
      expect(updated[1]?.tempo).toBeUndefined();
    });
  });

  describe('setSessionSceneFollowAction', () => {
    it('sets follow action on a scene', () => {
      const scenes = getScenes();
      expect(scenes.length).toBeGreaterThan(0);
      const sceneId = scenes[0].id;

      useProjectStore.getState().setSessionSceneFollowAction(sceneId, 'next', 4);
      const updated = getScenes().find((s) => s.id === sceneId);
      expect(updated?.followAction).toBe('next');
      expect(updated?.followActionTime).toBe(4);
    });

    it('clears follow action with none', () => {
      const scenes = getScenes();
      expect(scenes.length).toBeGreaterThan(0);
      const sceneId = scenes[0].id;

      useProjectStore.getState().setSessionSceneFollowAction(sceneId, 'next', 4);
      useProjectStore.getState().setSessionSceneFollowAction(sceneId, 'none');
      const updated = getScenes().find((s) => s.id === sceneId);
      expect(updated?.followAction).toBe('none');
    });
  });
});
