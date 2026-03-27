import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('duplicateClip', () => {
  let clipId: string;
  let trackId: string;

  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    const track = useProjectStore.getState().addTrack('stems');
    trackId = track.id;
    const clip = useProjectStore.getState().addClip(trackId, {
      startTime: 2, duration: 3, prompt: 'my prompt', lyrics: 'la la',
    });
    clipId = clip.id;
    useProjectStore.getState().updateClip(clipId, {
      generationStatus: 'ready',
      isolatedAudioKey: 'audio-key-1',
      waveformPeaks: [0.1, 0.5, 0.3],
    });
  });

  it('creates a second clip on the same track', () => {
    useProjectStore.getState().duplicateClip(clipId);
    const clips = useProjectStore.getState().project!.tracks[0].clips;
    expect(clips).toHaveLength(2);
  });

  it('places duplicate immediately after the source clip', () => {
    useProjectStore.getState().duplicateClip(clipId);
    const clips = useProjectStore.getState().project!.tracks[0].clips;
    const dup = clips.find((c) => c.id !== clipId)!;
    expect(dup.startTime).toBe(2 + 3); // source start + source duration
  });

  it('duplicate has the same duration as source', () => {
    useProjectStore.getState().duplicateClip(clipId);
    const clips = useProjectStore.getState().project!.tracks[0].clips;
    const dup = clips.find((c) => c.id !== clipId)!;
    expect(dup.duration).toBe(3);
  });

  it('duplicate gets a new unique id', () => {
    useProjectStore.getState().duplicateClip(clipId);
    const clips = useProjectStore.getState().project!.tracks[0].clips;
    const ids = clips.map((c) => c.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('duplicate inherits audio data when source is ready', () => {
    useProjectStore.getState().duplicateClip(clipId);
    const clips = useProjectStore.getState().project!.tracks[0].clips;
    const dup = clips.find((c) => c.id !== clipId)!;
    expect(dup.isolatedAudioKey).toBe('audio-key-1');
    expect(dup.generationStatus).toBe('ready');
    expect(dup.waveformPeaks).toEqual([0.1, 0.5, 0.3]);
  });

  it('duplicate gets empty status when source has no audio', () => {
    useProjectStore.getState().updateClip(clipId, {
      generationStatus: 'empty',
      isolatedAudioKey: null,
      waveformPeaks: null,
    });
    useProjectStore.getState().duplicateClip(clipId);
    const clips = useProjectStore.getState().project!.tracks[0].clips;
    const dup = clips.find((c) => c.id !== clipId)!;
    expect(dup.generationStatus).toBe('empty');
    expect(dup.isolatedAudioKey).toBeNull();
  });

  it('returns the new clip object', () => {
    const result = useProjectStore.getState().duplicateClip(clipId);
    expect(result).not.toBeUndefined();
    expect(result!.id).not.toBe(clipId);
    expect(result!.startTime).toBe(5);
  });

  it('returns undefined for nonexistent clipId', () => {
    const result = useProjectStore.getState().duplicateClip('nonexistent');
    expect(result).toBeUndefined();
  });

  it('returns undefined when project is null', () => {
    useProjectStore.setState({ project: null });
    const result = useProjectStore.getState().duplicateClip(clipId);
    expect(result).toBeUndefined();
  });

  it('duplicate preserves prompt and lyrics', () => {
    const dup = useProjectStore.getState().duplicateClip(clipId)!;
    expect(dup.prompt).toBe('my prompt');
    expect(dup.lyrics).toBe('la la');
  });

  it('clears generationJobId on the duplicate', () => {
    useProjectStore.getState().updateClip(clipId, { generationJobId: 'job-123' });
    const dup = useProjectStore.getState().duplicateClip(clipId)!;
    expect(dup.generationJobId).toBeNull();
  });
});
