import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('splitClip', () => {
  let clipId: string;
  let trackId: string;

  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    const track = useProjectStore.getState().addTrack('stems');
    trackId = track.id;
    const clip = useProjectStore.getState().addClip(trackId, {
      startTime: 0, duration: 4, prompt: 'test clip', lyrics: 'hello',
    });
    clipId = clip.id;
    useProjectStore.getState().updateClip(clipId, {
      audioDuration: 4,
      audioOffset: 0,
      generationStatus: 'ready',
      isolatedAudioKey: 'audio-key-1',
    });
  });

  it('splits a clip into two at the given time', () => {
    useProjectStore.getState().splitClip(clipId, 2);
    const clips = useProjectStore.getState().project!.tracks[0].clips;
    expect(clips).toHaveLength(2);
  });

  it('left clip retains original start and has shortened duration', () => {
    useProjectStore.getState().splitClip(clipId, 1.5);
    const clips = useProjectStore.getState().project!.tracks[0].clips;
    const left = clips.find((c) => c.id === clipId)!;
    expect(left.startTime).toBe(0);
    expect(left.duration).toBe(1.5);
  });

  it('right clip starts at split time with remaining duration', () => {
    useProjectStore.getState().splitClip(clipId, 1.5);
    const clips = useProjectStore.getState().project!.tracks[0].clips;
    const right = clips.find((c) => c.id !== clipId)!;
    expect(right.startTime).toBe(1.5);
    expect(right.duration).toBe(2.5);
  });

  it('right clip has correct audioOffset', () => {
    useProjectStore.getState().splitClip(clipId, 1);
    const clips = useProjectStore.getState().project!.tracks[0].clips;
    const right = clips.find((c) => c.id !== clipId)!;
    expect(right.audioOffset).toBe(1);
  });

  it('preserves audioOffset from source when splitting', () => {
    useProjectStore.getState().updateClip(clipId, {
      audioOffset: 2,
      audioDuration: 8,
    });
    useProjectStore.getState().splitClip(clipId, 1);
    const clips = useProjectStore.getState().project!.tracks[0].clips;
    const right = clips.find((c) => c.id !== clipId)!;
    // original offset (2) + left duration (1) = 3
    expect(right.audioOffset).toBe(3);
  });

  it('does nothing when split time is before clip start', () => {
    useProjectStore.getState().splitClip(clipId, -1);
    const clips = useProjectStore.getState().project!.tracks[0].clips;
    expect(clips).toHaveLength(1);
  });

  it('does nothing when split time equals clip start', () => {
    useProjectStore.getState().splitClip(clipId, 0);
    const clips = useProjectStore.getState().project!.tracks[0].clips;
    expect(clips).toHaveLength(1);
  });

  it('does nothing when split time is at or past clip end', () => {
    useProjectStore.getState().splitClip(clipId, 4);
    const clips = useProjectStore.getState().project!.tracks[0].clips;
    expect(clips).toHaveLength(1);
  });

  it('does nothing when split time is past clip end', () => {
    useProjectStore.getState().splitClip(clipId, 10);
    const clips = useProjectStore.getState().project!.tracks[0].clips;
    expect(clips).toHaveLength(1);
  });

  it('right clip inherits isolatedAudioKey when source is ready', () => {
    useProjectStore.getState().splitClip(clipId, 2);
    const clips = useProjectStore.getState().project!.tracks[0].clips;
    const right = clips.find((c) => c.id !== clipId)!;
    expect(right.isolatedAudioKey).toBe('audio-key-1');
    expect(right.generationStatus).toBe('ready');
  });

  it('right clip gets empty status when source has no audio', () => {
    useProjectStore.getState().updateClip(clipId, {
      generationStatus: 'empty',
      isolatedAudioKey: null,
    });
    useProjectStore.getState().splitClip(clipId, 2);
    const clips = useProjectStore.getState().project!.tracks[0].clips;
    const right = clips.find((c) => c.id !== clipId)!;
    expect(right.isolatedAudioKey).toBeNull();
    expect(right.generationStatus).toBe('empty');
  });

  it('both clips retain the same prompt and lyrics', () => {
    useProjectStore.getState().splitClip(clipId, 2);
    const clips = useProjectStore.getState().project!.tracks[0].clips;
    expect(clips[0].prompt).toBe('test clip');
    expect(clips[0].lyrics).toBe('hello');
    expect(clips[1].prompt).toBe('test clip');
    expect(clips[1].lyrics).toBe('hello');
  });

  it('does nothing for nonexistent clipId', () => {
    useProjectStore.getState().splitClip('nonexistent', 2);
    const clips = useProjectStore.getState().project!.tracks[0].clips;
    expect(clips).toHaveLength(1);
  });
});
