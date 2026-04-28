import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../projectStore';
import { useCollaborationStore } from '../collaborationStore';
import type { Clip, GrooveTemplate, Project, Track } from '../../types/project';

function makeGroove(overrides: Partial<GrooveTemplate> = {}): GrooveTemplate {
  return {
    id: overrides.id ?? 'groove-1',
    name: overrides.name ?? 'Swing',
    timingOffsets: [0.05, 0, 0, 0],
    velocityPattern: [1, 1, 1, 1],
    gridBeats: 0.25,
    lengthBeats: 1,
    createdAt: 1,
    ...overrides,
  };
}

function makeMidiClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: overrides.id ?? 'clip-1',
    trackId: overrides.trackId ?? 'track-1',
    startTime: 0,
    duration: 4,
    prompt: '',
    lyrics: '',
    generationStatus: 'ready',
    generationJobId: null,
    cumulativeMixKey: null,
    isolatedAudioKey: null,
    waveformPeaks: null,
    midiData: {
      grid: '1/16',
      notes: [
        { id: 'note-1', pitch: 60, startBeat: 0, durationBeats: 0.25, velocity: 80 },
      ],
    },
    ...overrides,
  };
}

function setupProject() {
  const clip = makeMidiClip();
  const track: Track = {
    id: 'track-1',
    trackName: 'keyboard',
    trackType: 'pianoRoll',
    displayName: 'Keys',
    color: '#3b82f6',
    order: 1,
    volume: 0.8,
    muted: false,
    soloed: false,
    clips: [clip],
    effects: [],
    effectsEnabled: true,
  } as Track;

  useProjectStore.setState({
    project: {
      id: 'project-1',
      name: 'Viewer Project',
      tracks: [track],
      bpm: 120,
      keyScale: 'C major',
      timeSignature: 4,
      timeSignatureDenominator: 4,
      totalDuration: 4,
      markers: [],
      tempoMap: [],
      timeSignatureMap: [],
      groovePool: [makeGroove()],
    } as unknown as Project,
  });
}

describe('groove pool viewer mode guards', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useCollaborationStore.getState().reset();
    setupProject();
  });

  it('prevents groove pool mutations while in viewer mode', () => {
    useCollaborationStore.getState().setViewerMode(true);

    expect(
      useProjectStore.getState().extractGrooveFromClip('clip-1', 'Extracted', {
        gridBeats: 0.25,
        lengthBeats: 1,
      }),
    ).toBeUndefined();
    useProjectStore.getState().applyGrooveToClip('clip-1', ['note-1'], 'groove-1', { strength: 100 });
    useProjectStore.getState().addGrooveTemplate(makeGroove({ id: 'groove-2', name: 'Added' }));
    useProjectStore.getState().renameGrooveTemplate('groove-1', 'Renamed');
    useProjectStore.getState().deleteGrooveTemplate('groove-1');

    const project = useProjectStore.getState().project!;
    expect(project.groovePool).toEqual([makeGroove()]);
    expect(project.tracks[0].clips[0].midiData?.notes[0].startBeat).toBe(0);
  });
});
