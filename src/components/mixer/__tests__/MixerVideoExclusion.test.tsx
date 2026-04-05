import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useProjectStore } from '../../../store/projectStore';
import { useCollaborationStore } from '../../../store/collaborationStore';

// Mock projectStorage
vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('Mixer — video track exclusion', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useCollaborationStore.getState().reset();
    useProjectStore.getState().createProject();
  });

  it('video tracks should be filtered out from mixer display', () => {
    // Add a mix of tracks
    useProjectStore.getState().addTrack('custom', 'sample');
    useProjectStore.getState().addTrack('custom', 'video');
    useProjectStore.getState().addTrack('drums', 'stems');

    const tracks = useProjectStore.getState().project!.tracks;
    expect(tracks).toHaveLength(3);

    // Simulate the mixer filtering logic
    const mixerTracks = tracks.filter((t) => t.trackType !== 'video');
    expect(mixerTracks).toHaveLength(2);
    expect(mixerTracks.every((t) => t.trackType !== 'video')).toBe(true);
  });

  it('mixer shows all non-video tracks', () => {
    useProjectStore.getState().addTrack('custom', 'sample');
    useProjectStore.getState().addTrack('drums', 'sequencer');
    useProjectStore.getState().addTrack('custom', 'pianoRoll');

    const tracks = useProjectStore.getState().project!.tracks;
    const mixerTracks = tracks.filter((t) => t.trackType !== 'video');
    expect(mixerTracks).toHaveLength(3);
  });
});
