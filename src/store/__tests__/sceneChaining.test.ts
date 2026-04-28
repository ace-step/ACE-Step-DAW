import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';
import { useTransportStore } from '../transportStore';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('Scene chaining: auto-advance through scenes', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject({ bpm: 120 }); // 1 beat = 0.5s
    useProjectStore.getState().addTrack('audio');
    useTransportStore.setState({ isPlaying: true, currentTime: 0 });
  });

  function getSession() {
    return useProjectStore.getState().project!.session!;
  }

  function getScenes() {
    return getSession().scenes;
  }

  function getPendingLaunches() {
    return getSession().pendingLaunches;
  }

  it('scheduleSceneFollowAction queues next scene when follow action is "next"', () => {
    const scenes = getScenes();
    const scene0 = scenes[0];
    useProjectStore.getState().setSessionSceneFollowAction(scene0.id, 'next', 4);

    // Schedule follow action for scene 0 at time 0
    useProjectStore.getState().scheduleSceneFollowAction(scene0.id, 0);

    const pending = getPendingLaunches();
    // Should have a pending launch for the next scene
    const sceneFollowLaunch = pending.find((p) => p.type === 'scene-follow-action');
    expect(sceneFollowLaunch).toBeDefined();
    expect(sceneFollowLaunch!.sceneId).toBe(scenes[1].id);
    // 4 bars at 120 BPM, 4/4 time = 4 beats per bar, 0.5s per beat = 8s
    expect(sceneFollowLaunch!.executeAt).toBe(8);
  });

  it('scheduleSceneFollowAction does nothing when follow action is "none"', () => {
    const scenes = getScenes();
    useProjectStore.getState().setSessionSceneFollowAction(scenes[0].id, 'none');
    useProjectStore.getState().scheduleSceneFollowAction(scenes[0].id, 0);
    expect(getPendingLaunches()).toHaveLength(0);
  });

  it('scheduleSceneFollowAction does nothing when no follow action set', () => {
    const scenes = getScenes();
    useProjectStore.getState().scheduleSceneFollowAction(scenes[0].id, 0);
    expect(getPendingLaunches()).toHaveLength(0);
  });

  it('scheduleSceneFollowAction resolves "first" to scene index 0', () => {
    const scenes = getScenes();
    useProjectStore.getState().setSessionSceneFollowAction(scenes[3].id, 'first', 2);
    useProjectStore.getState().scheduleSceneFollowAction(scenes[3].id, 0);

    const pending = getPendingLaunches();
    expect(pending[0].sceneId).toBe(scenes[0].id);
  });

  it('scheduleSceneFollowAction resolves "last" to last scene', () => {
    const scenes = getScenes();
    useProjectStore.getState().setSessionSceneFollowAction(scenes[0].id, 'last', 2);
    useProjectStore.getState().scheduleSceneFollowAction(scenes[0].id, 0);

    const pending = getPendingLaunches();
    expect(pending[0].sceneId).toBe(scenes[scenes.length - 1].id);
  });

  it('scheduleSceneFollowAction resolves "again" to same scene', () => {
    const scenes = getScenes();
    useProjectStore.getState().setSessionSceneFollowAction(scenes[2].id, 'again', 2);
    useProjectStore.getState().scheduleSceneFollowAction(scenes[2].id, 0);

    const pending = getPendingLaunches();
    expect(pending[0].sceneId).toBe(scenes[2].id);
  });

  it('scheduleSceneFollowAction "stop" queues stop-all', () => {
    const scenes = getScenes();
    useProjectStore.getState().setSessionSceneFollowAction(scenes[0].id, 'stop', 4);
    useProjectStore.getState().scheduleSceneFollowAction(scenes[0].id, 0);

    const pending = getPendingLaunches();
    expect(pending[0].type).toBe('scene-follow-action');
    expect(pending[0].sceneId).toBeUndefined();
  });

  it('followActionConfig takes precedence over followAction (chanceA=1)', () => {
    const scenes = getScenes();
    // Set legacy follow action to 'stop'
    useProjectStore.getState().setSessionSceneFollowAction(scenes[0].id, 'stop', 4);
    // Set dual config to 'first' with 100%
    useProjectStore.getState().setSessionSceneFollowActionConfig(scenes[0].id, {
      actionA: 'first',
      actionB: 'last',
      chanceA: 1,
    });

    useProjectStore.getState().scheduleSceneFollowAction(scenes[0].id, 0);

    const pending = getPendingLaunches();
    // Should resolve to 'first' (scene 0), not 'stop'
    expect(pending[0].type).toBe('scene-follow-action');
    expect(pending[0].sceneId).toBe(scenes[0].id);
  });

  it('respects followActionsEnabled global toggle', () => {
    const scenes = getScenes();
    useProjectStore.getState().setSessionSceneFollowAction(scenes[0].id, 'next', 4);
    useProjectStore.getState().setSessionFollowActionsEnabled(false);
    useProjectStore.getState().scheduleSceneFollowAction(scenes[0].id, 0);

    expect(getPendingLaunches()).toHaveLength(0);
  });

  it('wraps "next" from last scene to first', () => {
    const scenes = getScenes();
    const lastScene = scenes[scenes.length - 1];
    useProjectStore.getState().setSessionSceneFollowAction(lastScene.id, 'next', 2);
    useProjectStore.getState().scheduleSceneFollowAction(lastScene.id, 0);

    const pending = getPendingLaunches();
    expect(pending[0].sceneId).toBe(scenes[0].id);
  });
});
