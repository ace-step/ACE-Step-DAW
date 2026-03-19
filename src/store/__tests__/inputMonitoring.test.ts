import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

// Mock projectStorage to prevent IndexedDB calls during testing
vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('setInputMonitoring', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    useProjectStore.getState().addTrack('vocals');
  });

  it('sets input monitoring mode on a track and cycles correctly', () => {
    const trackId = useProjectStore.getState().project!.tracks[0].id;

    // Default should be undefined (treated as 'off' in the UI)
    expect(useProjectStore.getState().project!.tracks[0].inputMonitoring).toBeUndefined();

    useProjectStore.getState().setInputMonitoring(trackId, 'auto');
    expect(useProjectStore.getState().project!.tracks[0].inputMonitoring).toBe('auto');

    useProjectStore.getState().setInputMonitoring(trackId, 'on');
    expect(useProjectStore.getState().project!.tracks[0].inputMonitoring).toBe('on');

    useProjectStore.getState().setInputMonitoring(trackId, 'off');
    expect(useProjectStore.getState().project!.tracks[0].inputMonitoring).toBe('off');
  });

  it('does not affect other tracks when setting input monitoring', () => {
    useProjectStore.getState().addTrack('drums');
    const tracks = useProjectStore.getState().project!.tracks;
    const vocalsId = tracks[0].id;
    const drumsId = tracks[1].id;

    useProjectStore.getState().setInputMonitoring(vocalsId, 'on');

    const updated = useProjectStore.getState().project!.tracks;
    expect(updated.find((t) => t.id === vocalsId)!.inputMonitoring).toBe('on');
    expect(updated.find((t) => t.id === drumsId)!.inputMonitoring).toBeUndefined();
  });
});
