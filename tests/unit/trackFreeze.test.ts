import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('track freeze / unfreeze', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    useProjectStore.getState().addTrack('vocals');
  });

  it('freezeTrack sets frozen to true', () => {
    const trackId = useProjectStore.getState().project!.tracks[0].id;
    useProjectStore.getState().freezeTrack(trackId);
    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId);
    expect(track!.frozen).toBe(true);
  });

  it('unfreezeTrack sets frozen to false and clears frozenAudioKey', () => {
    const trackId = useProjectStore.getState().project!.tracks[0].id;
    // First freeze the track and simulate a frozen audio key
    useProjectStore.getState().freezeTrack(trackId);
    // Manually set frozenAudioKey to simulate a bounce
    useProjectStore.setState((state) => ({
      project: {
        ...state.project!,
        tracks: state.project!.tracks.map((t) =>
          t.id === trackId ? { ...t, frozenAudioKey: 'some-audio-key' } : t,
        ),
      },
    }));
    expect(useProjectStore.getState().project!.tracks[0].frozenAudioKey).toBe('some-audio-key');

    useProjectStore.getState().unfreezeTrack(trackId);
    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId);
    expect(track!.frozen).toBe(false);
    expect(track!.frozenAudioKey).toBeUndefined();
  });
});
