import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('Track groups / folder tracks', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
  });

  it('createGroupTrack creates a group track with isGroup=true and collapsed=false', () => {
    const group = useProjectStore.getState().createGroupTrack('Drums Bus');
    expect(group.isGroup).toBe(true);
    expect(group.collapsed).toBe(false);
    expect(group.displayName).toBe('Drums Bus');

    const tracks = useProjectStore.getState().project!.tracks;
    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe(group.id);
  });

  it('moveTrackToGroup assigns parentTrackId and can remove it', () => {
    const group = useProjectStore.getState().createGroupTrack('Bus');
    useProjectStore.getState().addTrack('drums');
    const child = useProjectStore.getState().project!.tracks.find((t) => !t.isGroup)!;

    // Move into group
    useProjectStore.getState().moveTrackToGroup(child.id, group.id);
    const updated = useProjectStore.getState().project!.tracks.find((t) => t.id === child.id)!;
    expect(updated.parentTrackId).toBe(group.id);

    // Remove from group
    useProjectStore.getState().moveTrackToGroup(child.id, null);
    const removed = useProjectStore.getState().project!.tracks.find((t) => t.id === child.id)!;
    expect(removed.parentTrackId).toBeUndefined();
  });

  it('toggleGroupCollapse toggles the collapsed state', () => {
    const group = useProjectStore.getState().createGroupTrack('Bus');
    expect(useProjectStore.getState().project!.tracks[0].collapsed).toBe(false);

    useProjectStore.getState().toggleGroupCollapse(group.id);
    expect(useProjectStore.getState().project!.tracks[0].collapsed).toBe(true);

    useProjectStore.getState().toggleGroupCollapse(group.id);
    expect(useProjectStore.getState().project!.tracks[0].collapsed).toBe(false);
  });
});
