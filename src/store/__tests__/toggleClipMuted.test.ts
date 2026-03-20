import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('toggleClipMuted', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    useProjectStore.getState().addTrack('stems');
  });

  function addTestClip(trackId: string) {
    return useProjectStore.getState().addClip(trackId, {
      startTime: 0,
      duration: 4,
      prompt: 'test',
      lyrics: '',
    });
  }

  function getClip(clipId: string) {
    const project = useProjectStore.getState().project!;
    for (const track of project.tracks) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (clip) return clip;
    }
    return undefined;
  }

  it('toggles a single clip from active to muted', () => {
    const track = useProjectStore.getState().project!.tracks[0];
    const clip = addTestClip(track.id);
    expect(getClip(clip.id)?.muted).toBeFalsy();

    useProjectStore.getState().toggleClipMuted([clip.id]);
    expect(getClip(clip.id)?.muted).toBe(true);
  });

  it('toggles a muted clip back to active', () => {
    const track = useProjectStore.getState().project!.tracks[0];
    const clip = addTestClip(track.id);

    useProjectStore.getState().toggleClipMuted([clip.id]);
    expect(getClip(clip.id)?.muted).toBe(true);

    useProjectStore.getState().toggleClipMuted([clip.id]);
    expect(getClip(clip.id)?.muted).toBe(false);
  });

  it('toggles multiple clips at once', () => {
    const track = useProjectStore.getState().project!.tracks[0];
    const clip1 = addTestClip(track.id);
    const clip2 = useProjectStore.getState().addClip(track.id, {
      startTime: 4,
      duration: 4,
      prompt: 'test2',
      lyrics: '',
    });

    useProjectStore.getState().toggleClipMuted([clip1.id, clip2.id]);
    expect(getClip(clip1.id)?.muted).toBe(true);
    expect(getClip(clip2.id)?.muted).toBe(true);
  });

  it('when mixed muted states, mutes all (any active -> all muted)', () => {
    const track = useProjectStore.getState().project!.tracks[0];
    const clip1 = addTestClip(track.id);
    const clip2 = useProjectStore.getState().addClip(track.id, {
      startTime: 4,
      duration: 4,
      prompt: 'test2',
      lyrics: '',
    });

    // Mute only clip1
    useProjectStore.getState().toggleClipMuted([clip1.id]);
    expect(getClip(clip1.id)?.muted).toBe(true);
    expect(getClip(clip2.id)?.muted).toBeFalsy();

    // Toggle both: since clip2 is active, all should become muted
    useProjectStore.getState().toggleClipMuted([clip1.id, clip2.id]);
    expect(getClip(clip1.id)?.muted).toBe(true);
    expect(getClip(clip2.id)?.muted).toBe(true);
  });

  it('when all muted, unmutes all', () => {
    const track = useProjectStore.getState().project!.tracks[0];
    const clip1 = addTestClip(track.id);
    const clip2 = useProjectStore.getState().addClip(track.id, {
      startTime: 4,
      duration: 4,
      prompt: 'test2',
      lyrics: '',
    });

    // Mute both
    useProjectStore.getState().toggleClipMuted([clip1.id, clip2.id]);
    expect(getClip(clip1.id)?.muted).toBe(true);
    expect(getClip(clip2.id)?.muted).toBe(true);

    // Toggle both: since all are muted, all should become active
    useProjectStore.getState().toggleClipMuted([clip1.id, clip2.id]);
    expect(getClip(clip1.id)?.muted).toBe(false);
    expect(getClip(clip2.id)?.muted).toBe(false);
  });

  it('supports undo', () => {
    const track = useProjectStore.getState().project!.tracks[0];
    const clip = addTestClip(track.id);

    useProjectStore.getState().toggleClipMuted([clip.id]);
    expect(getClip(clip.id)?.muted).toBe(true);

    useProjectStore.getState().undo();
    expect(getClip(clip.id)?.muted).toBeFalsy();
  });

  it('ignores empty array', () => {
    const before = useProjectStore.getState().project!.updatedAt;
    useProjectStore.getState().toggleClipMuted([]);
    const after = useProjectStore.getState().project!.updatedAt;
    expect(after).toBe(before);
  });

  it('ignores non-existent clip IDs gracefully', () => {
    useProjectStore.getState().toggleClipMuted(['non-existent-id']);
    // Should not throw
    expect(true).toBe(true);
  });
});
