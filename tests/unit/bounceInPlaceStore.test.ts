import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

const mockBounceTrackToAudioAsset = vi.fn();

vi.mock('../../src/services/bounceInPlace', () => ({
  bounceTrackToAudioAsset: (...args: unknown[]) => mockBounceTrackToAudioAsset(...args),
}));

describe('projectStore bounceInPlace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject({ name: 'Bounce Store Test' });
  });

  it('replaces the original track with a neutral sample track when replaceOriginal is true', async () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('keyboard', 'pianoRoll');
    store.addClip(track.id, {
      startTime: 1,
      duration: 2,
      prompt: '',
      globalCaption: '',
      lyrics: '',
      source: 'generated',
      starred: false,
      midiData: {
        grid: '1/16',
        notes: [{ id: 'n1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 }],
      },
    });

    mockBounceTrackToAudioAsset.mockResolvedValue({
      audioKey: 'bounce-key',
      startTime: 1,
      duration: 2,
      waveformPeaks: [0.2, 0.6],
    });

    await store.bounceInPlace(track.id, {
      includeEffects: true,
      includeAutomation: true,
      normalize: false,
      replaceOriginal: true,
    });

    const bouncedTrack = useProjectStore.getState().project!.tracks.find((candidate) => candidate.id === track.id)!;
    expect(bouncedTrack.trackType).toBe('sample');
    expect(bouncedTrack.trackName).toBe('custom');
    expect(bouncedTrack.effects).toEqual([]);
    expect(bouncedTrack.volume).toBe(1);
    expect(bouncedTrack.pan).toBe(0);
    expect(bouncedTrack.clips).toHaveLength(1);
    expect(bouncedTrack.clips[0].isolatedAudioKey).toBe('bounce-key');

    useProjectStore.getState().undo();
    const restored = useProjectStore.getState().project!.tracks.find((candidate) => candidate.id === track.id)!;
    expect(restored.trackType).toBe('pianoRoll');
    expect(restored.clips).toHaveLength(1);
  });

  it('creates a sibling bounced audio track when replaceOriginal is false', async () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('drums', 'sequencer');

    mockBounceTrackToAudioAsset.mockResolvedValue({
      audioKey: 'bounce-key-2',
      startTime: 0,
      duration: 4,
      waveformPeaks: [0.1, 0.4],
    });

    await store.bounceInPlace(track.id, {
      includeEffects: false,
      includeAutomation: false,
      normalize: true,
      replaceOriginal: false,
    });

    const tracks = useProjectStore.getState().project!.tracks;
    expect(tracks).toHaveLength(2);
    expect(tracks[0].id).toBe(track.id);
    expect(tracks[1].displayName).toBe('Drums Bounce');
    expect(tracks[1].trackType).toBe('sample');
    expect(tracks[1].clips[0].isolatedAudioKey).toBe('bounce-key-2');
    expect(tracks[1].clips[0].startTime).toBe(0);
    expect(tracks[1].clips[0].duration).toBe(4);
  });
});
