import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('Track Groups', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
  });

  it('createGroupTrack creates a group track with isGroup=true and collapsed=false', () => {
    const group = useProjectStore.getState().createGroupTrack('Strings Section');

    expect(group.isGroup).toBe(true);
    expect(group.collapsed).toBe(false);
    expect(group.displayName).toBe('Strings Section');
    expect(group.clips).toEqual([]);

    const project = useProjectStore.getState().project!;
    expect(project.tracks).toHaveLength(1);
    expect(project.tracks[0].id).toBe(group.id);
  });

  it('moveTrackToGroup assigns parentTrackId and getGroupVolume averages children volumes', () => {
    const group = useProjectStore.getState().createGroupTrack('My Group');
    const track1 = useProjectStore.getState().addTrack('vocals');
    const track2 = useProjectStore.getState().addTrack('bass');

    useProjectStore.getState().updateTrack(track1.id, { volume: 0.6 });
    useProjectStore.getState().updateTrack(track2.id, { volume: 1.0 });

    useProjectStore.getState().moveTrackToGroup(track1.id, group.id);
    useProjectStore.getState().moveTrackToGroup(track2.id, group.id);

    const tracks = useProjectStore.getState().project!.tracks;
    expect(tracks.find((t) => t.id === track1.id)!.parentTrackId).toBe(group.id);
    expect(tracks.find((t) => t.id === track2.id)!.parentTrackId).toBe(group.id);

    // Group volume = average of children: (0.6 + 1.0) / 2 = 0.8
    const vol = useProjectStore.getState().getGroupVolume(group.id);
    expect(vol).toBeCloseTo(0.8);
  });

  it('toggleGroupCollapse toggles the collapsed state back and forth', () => {
    const group = useProjectStore.getState().createGroupTrack('Folder');
    expect(group.collapsed).toBe(false);

    useProjectStore.getState().toggleGroupCollapse(group.id);
    let g = useProjectStore.getState().project!.tracks.find((t) => t.id === group.id)!;
    expect(g.collapsed).toBe(true);

    useProjectStore.getState().toggleGroupCollapse(group.id);
    g = useProjectStore.getState().project!.tracks.find((t) => t.id === group.id)!;
    expect(g.collapsed).toBe(false);
  });
});
