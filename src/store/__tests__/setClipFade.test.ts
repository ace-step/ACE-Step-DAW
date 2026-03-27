import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('setClipFade', () => {
  let clipId: string;

  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    const track = useProjectStore.getState().addTrack('stems');
    const clip = useProjectStore.getState().addClip(track.id, {
      startTime: 0, duration: 4, prompt: 'test', lyrics: '',
    });
    clipId = clip.id;
  });

  it('sets fadeInDuration on a clip', () => {
    useProjectStore.getState().setClipFade(clipId, { fadeInDuration: 1 });
    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clip.fadeInDuration).toBe(1);
  });

  it('sets fadeOutDuration on a clip', () => {
    useProjectStore.getState().setClipFade(clipId, { fadeOutDuration: 0.5 });
    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clip.fadeOutDuration).toBe(0.5);
  });

  it('sets both fade in and out simultaneously', () => {
    useProjectStore.getState().setClipFade(clipId, {
      fadeInDuration: 1,
      fadeOutDuration: 1,
    });
    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clip.fadeInDuration).toBe(1);
    expect(clip.fadeOutDuration).toBe(1);
  });

  it('clamps total fades to clip duration', () => {
    useProjectStore.getState().setClipFade(clipId, {
      fadeInDuration: 3,
      fadeOutDuration: 3,
    });
    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    // Total fades should not exceed clip duration (4s)
    expect((clip.fadeInDuration ?? 0) + (clip.fadeOutDuration ?? 0)).toBeLessThanOrEqual(4);
  });

  it('clamps negative values to zero', () => {
    useProjectStore.getState().setClipFade(clipId, { fadeInDuration: -1 });
    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clip.fadeInDuration).toBeGreaterThanOrEqual(0);
  });

  it('preserves existing fadeIn when only setting fadeOut', () => {
    useProjectStore.getState().setClipFade(clipId, { fadeInDuration: 1 });
    useProjectStore.getState().setClipFade(clipId, { fadeOutDuration: 0.5 });
    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clip.fadeInDuration).toBe(1);
    expect(clip.fadeOutDuration).toBe(0.5);
  });

  it('sets fade curve type', () => {
    useProjectStore.getState().setClipFade(clipId, {
      fadeInDuration: 1,
      fadeInCurve: 'exponential',
    });
    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clip.fadeInCurve).toBe('exponential');
  });

  it('does nothing for nonexistent clip', () => {
    // Should not throw
    useProjectStore.getState().setClipFade('nonexistent', { fadeInDuration: 1 });
    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clip.fadeInDuration).toBeUndefined();
  });

  it('handles equal-power fade curve', () => {
    useProjectStore.getState().setClipFade(clipId, {
      fadeOutDuration: 2,
      fadeOutCurve: 'equal-power',
    });
    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clip.fadeOutCurve).toBe('equal-power');
    expect(clip.fadeOutDuration).toBe(2);
  });
});
