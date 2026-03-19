import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('slipClip', () => {
  let clipId: string;

  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    const track = useProjectStore.getState().addTrack('stems');
    const clip = useProjectStore.getState().addClip(track.id, {
      startTime: 5, duration: 4, prompt: 'test', lyrics: '',
    });
    clipId = clip.id;
    useProjectStore.getState().updateClip(clipId, {
      audioDuration: 10, audioOffset: 2, generationStatus: 'ready',
    });
  });

  it('adjusts audioOffset without changing startTime or duration', () => {
    useProjectStore.getState().slipClip(clipId, 1);
    const c = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(c.audioOffset).toBe(3);
    expect(c.startTime).toBe(5);
    expect(c.duration).toBe(4);
  });

  it('clamps audioOffset to 0', () => {
    useProjectStore.getState().slipClip(clipId, -10);
    const c = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(c.audioOffset).toBe(0);
  });

  it('clamps audioOffset so clip does not exceed audio end', () => {
    useProjectStore.getState().slipClip(clipId, 20);
    const c = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(c.audioOffset).toBe(6);
  });

  it('does nothing for a clip without audioDuration', () => {
    useProjectStore.getState().updateClip(clipId, { audioDuration: undefined, audioOffset: undefined });
    useProjectStore.getState().slipClip(clipId, 2);
    const c = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(c.audioOffset).toBeUndefined();
  });

  it('is undoable', () => {
    useProjectStore.getState().slipClip(clipId, 2);
    expect(useProjectStore.getState().project!.tracks[0].clips[0].audioOffset).toBe(4);
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project!.tracks[0].clips[0].audioOffset).toBe(2);
  });
});
