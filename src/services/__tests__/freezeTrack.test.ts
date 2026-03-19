import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../../store/projectStore';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('freeze / flatten store actions', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    useProjectStore.getState().addTrack('vocals');
  });

  it('freezeTrack sets frozen flag', () => {
    const trackId = useProjectStore.getState().project!.tracks[0].id;
    useProjectStore.getState().freezeTrack(trackId);
    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId);
    expect(track!.frozen).toBe(true);
  });

  it('freezeTrack stores frozenAudioKey when provided', () => {
    const trackId = useProjectStore.getState().project!.tracks[0].id;
    useProjectStore.getState().freezeTrack(trackId, 'my-audio-key');
    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId);
    expect(track!.frozen).toBe(true);
    expect(track!.frozenAudioKey).toBe('my-audio-key');
  });

  it('unfreezeTrack clears frozen and frozenAudioKey', () => {
    const trackId = useProjectStore.getState().project!.tracks[0].id;
    useProjectStore.getState().freezeTrack(trackId, 'some-key');
    expect(useProjectStore.getState().project!.tracks[0].frozen).toBe(true);
    expect(useProjectStore.getState().project!.tracks[0].frozenAudioKey).toBe('some-key');

    useProjectStore.getState().unfreezeTrack(trackId);
    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId);
    expect(track!.frozen).toBe(false);
    expect(track!.frozenAudioKey).toBeUndefined();
  });

  it('flattenTrack converts to sample type, clears sequencerPattern/synthPreset', () => {
    // Set up a sequencer track to flatten
    const trackId = useProjectStore.getState().project!.tracks[0].id;
    useProjectStore.getState().updateTrack(trackId, { trackType: 'sequencer' });

    // Manually set sequencerPattern and synthPreset
    useProjectStore.setState((state) => ({
      project: {
        ...state.project!,
        tracks: state.project!.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                sequencerPattern: { rows: [], stepsPerBar: 16, bars: 4, swing: 0 },
                synthPreset: 'piano' as const,
              }
            : t,
        ),
      },
    }));

    useProjectStore.getState().flattenTrack(trackId, 'flattened-audio-key', [0.1, 0.5, 0.3], 10);
    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId);
    expect(track!.trackType).toBe('sample');
    expect(track!.frozen).toBe(false);
    expect(track!.frozenAudioKey).toBeUndefined();
    expect(track!.sequencerPattern).toBeUndefined();
    expect(track!.synthPreset).toBeUndefined();
  });

  it('flattenTrack creates a clip with flattened audio', () => {
    const trackId = useProjectStore.getState().project!.tracks[0].id;
    useProjectStore.getState().flattenTrack(trackId, 'flat-key', [0.2, 0.8], 5.5);
    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId);
    expect(track!.clips).toHaveLength(1);
    const clip = track!.clips[0];
    expect(clip.isolatedAudioKey).toBe('flat-key');
    expect(clip.generationStatus).toBe('ready');
    expect(clip.startTime).toBe(0);
    expect(clip.duration).toBe(5.5);
    expect(clip.waveformPeaks).toEqual([0.2, 0.8]);
  });

  it('mute/solo still work on frozen tracks', () => {
    const trackId = useProjectStore.getState().project!.tracks[0].id;
    useProjectStore.getState().freezeTrack(trackId, 'frozen-key');

    // Mute
    useProjectStore.getState().updateTrack(trackId, { muted: true });
    let track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId);
    expect(track!.muted).toBe(true);
    expect(track!.frozen).toBe(true);

    // Solo
    useProjectStore.getState().updateTrack(trackId, { soloed: true });
    track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId);
    expect(track!.soloed).toBe(true);
    expect(track!.frozen).toBe(true);
  });
});
