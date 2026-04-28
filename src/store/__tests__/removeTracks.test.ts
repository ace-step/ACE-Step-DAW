import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('projectStore.removeTracks', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
  });

  it('removes multiple tracks in one operation', () => {
    const store = useProjectStore.getState();
    const t1 = store.addTrack('stems');
    const t2 = store.addTrack('stems');
    const t3 = store.addTrack('stems');

    useProjectStore.getState().removeTracks([t1.id, t2.id]);
    const tracks = useProjectStore.getState().project!.tracks;
    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe(t3.id);
  });

  it('does nothing when given empty array', () => {
    const store = useProjectStore.getState();
    store.addTrack('stems');
    useProjectStore.getState().removeTracks([]);
    expect(useProjectStore.getState().project!.tracks).toHaveLength(1);
  });

  it('unparents children when removing a group track', () => {
    const store = useProjectStore.getState();
    const child1 = store.addTrack('stems');
    const child2 = store.addTrack('stems');

    // Create a group track and assign children
    store.createGroupTrack([child1.id, child2.id]);
    const groupTrack = useProjectStore.getState().project!.tracks.find((t) => t.isGroup);
    expect(groupTrack).not.toBeUndefined();

    useProjectStore.getState().removeTracks([groupTrack!.id]);
    const tracks = useProjectStore.getState().project!.tracks;
    // Children should remain but with no parent
    expect(tracks.find((t) => t.id === child1.id)?.parentTrackId).toBeUndefined();
    expect(tracks.find((t) => t.id === child2.id)?.parentTrackId).toBeUndefined();
  });

  it('supports undo after batch deletion', () => {
    const store = useProjectStore.getState();
    const t1 = store.addTrack('stems');
    const t2 = store.addTrack('stems');

    useProjectStore.getState().removeTracks([t1.id, t2.id]);
    expect(useProjectStore.getState().project!.tracks).toHaveLength(0);

    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project!.tracks).toHaveLength(2);
  });
});
