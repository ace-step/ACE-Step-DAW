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
    tracks: [
      {
        id: 'track-1',
        trackName: 'vocals',
        displayName: 'Vocals',
        color: '#ff0000',
        order: 0,
        volume: 0.8,
        muted: false,
        soloed: false,
        clips: [],
      },
    ],
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

describe('split stereo pan', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
  });

  it('setPanMode switches a track between stereo and dual-mono', () => {
    const store = useProjectStore.getState();
    store.setProject(makeProject());

    store.setPanMode('track-1', 'dual-mono');
    expect(useProjectStore.getState().project!.tracks[0].panMode).toBe('dual-mono');

    store.setPanMode('track-1', 'stereo');
    expect(useProjectStore.getState().project!.tracks[0].panMode).toBe('stereo');
  });

  it('setDualMonoPan sets left/right pan and clamps to [-1, 1]', () => {
    const store = useProjectStore.getState();
    store.setProject(makeProject());

    store.setDualMonoPan('track-1', -0.5, 0.75);
    const track1 = useProjectStore.getState().project!.tracks[0];
    expect(track1.panLeft).toBe(-0.5);
    expect(track1.panRight).toBe(0.75);

    // Values outside [-1, 1] should be clamped
    store.setDualMonoPan('track-1', -2, 3);
    const track2 = useProjectStore.getState().project!.tracks[0];
    expect(track2.panLeft).toBe(-1);
    expect(track2.panRight).toBe(1);
  });
});
