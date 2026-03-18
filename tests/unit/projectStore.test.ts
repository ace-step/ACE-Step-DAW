import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../../src/types/project';
import { useProjectStore } from '../../src/store/projectStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

function makeProject(): Project {
  return {
    id: 'project-1',
    name: 'Test Project',
    createdAt: 1,
    updatedAt: 1,
    bpm: 120,
    keyScale: 'C major',
    timeSignature: 4,
    totalDuration: 128,
    measures: 64,
    tracks: [],
    generationDefaults: {
      inferenceSteps: 20,
      guidanceScale: 7.5,
      shift: 0,
      thinking: false,
      model: 'test-model',
    },
    globalCaption: '',
    automationLanes: [],
    assets: [],
  };
}

describe('projectStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
  });

  describe('setProject / project getter', () => {
    it('stores the project and exposes it via the project getter', () => {
      const project = makeProject();

      useProjectStore.getState().setProject(project);

      expect(useProjectStore.getState().project).toEqual(project);
    });
  });

  describe('addTrack / removeTrack', () => {
    beforeEach(() => {
      useProjectStore.getState().createProject();
    });

    it('adds tracks and removes the requested track', () => {
      const drumsTrack = useProjectStore.getState().addTrack('drums');
      const bassTrack = useProjectStore.getState().addTrack('bass');

      let project = useProjectStore.getState().project;
      expect(project?.tracks).toHaveLength(2);
      expect(project?.tracks.map((track) => track.id)).toEqual([drumsTrack.id, bassTrack.id]);

      useProjectStore.getState().removeTrack(drumsTrack.id);

      project = useProjectStore.getState().project;
      expect(project?.tracks).toHaveLength(1);
      expect(project?.tracks[0].id).toBe(bassTrack.id);
    });
  });

  describe('addClip basics', () => {
    beforeEach(() => {
      useProjectStore.getState().createProject();
    });

    it('adds a clip to the target track with the expected default metadata', () => {
      const track = useProjectStore.getState().addTrack('drums');

      const clip = useProjectStore.getState().addClip(track.id, {
        startTime: 4,
        duration: 8,
        prompt: 'steady kick groove',
        lyrics: '',
        source: 'generated',
      });

      const storedTrack = useProjectStore.getState().project?.tracks[0];
      expect(storedTrack?.clips).toHaveLength(1);
      expect(storedTrack?.clips[0]).toMatchObject({
        id: clip.id,
        trackId: track.id,
        startTime: 4,
        duration: 8,
        prompt: 'steady kick groove',
        lyrics: '',
        source: 'generated',
        generationStatus: 'empty',
        generationJobId: null,
        cumulativeMixKey: null,
        isolatedAudioKey: null,
        waveformPeaks: null,
      });
    });
  });

  describe('automation lane operations', () => {
    const parameter = { type: 'mixer', param: 'volume' } as const;

    beforeEach(() => {
      useProjectStore.getState().createProject();
    });

    it('adds automation points into a sorted lane', () => {
      const track = useProjectStore.getState().addTrack('drums');

      useProjectStore.getState().addAutomationPoint(track.id, parameter, { time: 2, value: 0.3 });
      useProjectStore.getState().addAutomationPoint(track.id, parameter, { time: 1, value: 0.8 });

      expect(useProjectStore.getState().project?.automationLanes).toEqual([
        expect.objectContaining({
          trackId: track.id,
          parameter,
          points: [
            { time: 1, value: 0.8 },
            { time: 2, value: 0.3 },
          ],
        }),
      ]);
    });

    it('removes a single automation point by index', () => {
      const track = useProjectStore.getState().addTrack('drums');

      useProjectStore.getState().addAutomationPoint(track.id, parameter, { time: 1, value: 0.2 });
      useProjectStore.getState().addAutomationPoint(track.id, parameter, { time: 2, value: 0.7 });
      useProjectStore.getState().removeAutomationPoint(track.id, parameter, 0);

      expect(useProjectStore.getState().project?.automationLanes).toEqual([
        expect.objectContaining({
          trackId: track.id,
          parameter,
          points: [{ time: 2, value: 0.7 }],
        }),
      ]);
    });

    it('clears only the targeted automation lane', () => {
      const track = useProjectStore.getState().addTrack('drums');
      const panParameter = { type: 'mixer', param: 'pan' } as const;

      useProjectStore.getState().addAutomationPoint(track.id, parameter, { time: 1, value: 0.2 });
      useProjectStore.getState().addAutomationPoint(track.id, panParameter, { time: 1, value: 0.5 });
      useProjectStore.getState().clearAutomationLane(track.id, parameter);

      expect(useProjectStore.getState().project?.automationLanes).toEqual([
        expect.objectContaining({
          trackId: track.id,
          parameter: panParameter,
          points: [{ time: 1, value: 0.5 }],
        }),
      ]);
    });
  });
});
