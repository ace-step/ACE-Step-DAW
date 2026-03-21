import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('projectStore.moveTrackToOrder', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
  });

  it('moves a track into an empty arrangement slot without collapsing unrelated gaps', () => {
    const store = useProjectStore.getState();
    const drums = store.addTrack('drums', 'stems', { order: 1 });
    const bass = store.addTrack('bass', 'stems', { order: 4 });

    store.moveTrackToOrder(drums.id, 3);

    const project = useProjectStore.getState().project!;
    expect(project.tracks.find((track) => track.id === drums.id)?.order).toBe(3);
    expect(project.tracks.find((track) => track.id === bass.id)?.order).toBe(4);
  });

  it('claims the requested slot and shifts occupied tracks down when needed', () => {
    const store = useProjectStore.getState();
    const drums = store.addTrack('drums', 'stems', { order: 1 });
    const bass = store.addTrack('bass', 'stems', { order: 3 });
    const keys = store.addTrack('keyboard', 'pianoRoll', { order: 5 });

    store.moveTrackToOrder(drums.id, 3);

    const project = useProjectStore.getState().project!;
    expect(project.tracks.find((track) => track.id === drums.id)?.order).toBe(3);
    expect(project.tracks.find((track) => track.id === bass.id)?.order).toBe(4);
    expect(project.tracks.find((track) => track.id === keys.id)?.order).toBe(5);
  });

  it('preserves existing track-to-track reorder behavior', () => {
    const store = useProjectStore.getState();
    const drums = store.addTrack('drums', 'stems', { order: 1 });
    const bass = store.addTrack('bass', 'stems', { order: 2 });

    store.reorderTrack(bass.id, drums.id, 'before');

    const project = useProjectStore.getState().project!;
    expect(project.tracks.find((track) => track.id === bass.id)?.order).toBe(1);
    expect(project.tracks.find((track) => track.id === drums.id)?.order).toBe(2);
  });

  it('keeps unaffected duplicate-order tracks in their current relative order', () => {
    const store = useProjectStore.getState();
    const drums = store.addTrack('drums', 'stems', { order: 1 });
    const bass = store.addTrack('bass', 'stems', { order: 3 });
    const keys = store.addTrack('keyboard', 'pianoRoll', { order: 3 });

    store.moveTrackToOrder(drums.id, 5);

    const orderedTrackIds = [...useProjectStore.getState().project!.tracks]
      .sort((a, b) => a.order - b.order)
      .map((track) => track.id);

    expect(orderedTrackIds).toEqual([bass.id, keys.id, drums.id]);
  });

  it('rejects moves into orders occupied by hidden children of collapsed groups', () => {
    const store = useProjectStore.getState();
    const group = store.createGroupTrack('Drum Bus');
    const child = store.addTrack('drums', 'stems', { order: 2 });
    const bass = store.addTrack('bass', 'stems', { order: 4 });

    store.moveTrackToGroup(child.id, group.id);
    store.toggleGroupCollapse(group.id);
    store.moveTrackToOrder(bass.id, 2);

    const project = useProjectStore.getState().project!;
    expect(project.tracks.find((track) => track.id === bass.id)?.order).toBe(4);
    expect(project.tracks.find((track) => track.id === child.id)?.order).toBe(2);
  });

  it('rejects empty-slot moves for group tracks so children stay attached', () => {
    const store = useProjectStore.getState();
    const group = store.createGroupTrack('Drum Bus');
    const child = store.addTrack('drums', 'stems', { order: 2 });

    store.moveTrackToGroup(child.id, group.id);
    store.moveTrackToOrder(group.id, 4);

    const project = useProjectStore.getState().project!;
    expect(project.tracks.find((track) => track.id === group.id)?.order).toBe(1);
    expect(project.tracks.find((track) => track.id === child.id)?.order).toBe(2);
  });
});
