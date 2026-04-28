import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../projectStore';
import { useCollaborationStore } from '../collaborationStore';
import type { Project, Track, TrackPreset } from '../../types/project';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: overrides.id ?? 'track-1',
    trackName: 'synth',
    trackType: 'pianoRoll',
    displayName: overrides.displayName ?? 'Synth',
    color: '#3b82f6',
    order: overrides.order ?? 1,
    volume: 0.8,
    muted: false,
    soloed: false,
    clips: [],
    effects: [],
    effectsEnabled: true,
    ...overrides,
  } as Track;
}

function makePreset(): TrackPreset {
  return {
    id: 'preset-1',
    name: 'Warm Pad',
    trackName: 'synth',
    trackType: 'pianoRoll',
    settings: { volume: 0.7 },
    effects: [],
    midiEffects: [],
    createdAt: 1,
  };
}

function setupProject() {
  useProjectStore.setState({
    project: {
      id: 'project-1',
      name: 'Viewer Project',
      tracks: [makeTrack()],
      bpm: 120,
      keyScale: 'C major',
      timeSignature: 4,
      timeSignatureDenominator: 4,
      totalDuration: 4,
      markers: [],
      tempoMap: [],
      timeSignatureMap: [],
      trackPresets: [makePreset()],
    } as unknown as Project,
  });
}

describe('track preset viewer mode guards', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useCollaborationStore.getState().reset();
    setupProject();
  });

  it('prevents track preset mutations while in viewer mode', () => {
    useCollaborationStore.getState().setViewerMode(true);

    expect(useProjectStore.getState().saveTrackPreset('track-1', 'Saved')).toBeUndefined();
    expect(useProjectStore.getState().applyTrackPreset('preset-1')).toBeUndefined();
    useProjectStore.getState().deleteTrackPreset('preset-1');

    const project = useProjectStore.getState().project!;
    expect(project.trackPresets).toEqual([makePreset()]);
    expect(project.tracks).toHaveLength(1);
  });

  it('keeps applied preset tracks sorted by insertion order', () => {
    useProjectStore.setState({
      project: {
        ...useProjectStore.getState().project!,
        tracks: [
          makeTrack({ id: 'track-1', displayName: 'One', order: 1 }),
          makeTrack({ id: 'track-3', displayName: 'Three', order: 3 }),
        ],
      } as unknown as Project,
    });

    const track = useProjectStore.getState().applyTrackPreset('preset-1', { order: 2 });

    expect(track?.order).toBe(2);
    expect(useProjectStore.getState().project!.tracks.map((candidate) => candidate.order)).toEqual([1, 2, 3]);
  });
});
