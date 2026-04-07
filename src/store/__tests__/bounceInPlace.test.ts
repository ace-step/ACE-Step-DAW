import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';
import { useCollaborationStore } from '../collaborationStore';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../services/bounceInPlace', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/bounceInPlace')>();
  return {
    ...actual,
    bounceTrackToAudioAsset: vi.fn().mockResolvedValue({
      audioKey: 'bounced-audio-key',
      startTime: 0,
      duration: 5,
      waveformPeaks: [0.1, 0.5, 0.9, 0.3],
    }),
  };
});

describe('projectStore bounceInPlace', () => {
  let trackId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    useCollaborationStore.getState().reset();
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    const track = useProjectStore.getState().addTrack('stems');
    trackId = track.id;
    useProjectStore.getState().addClip(trackId, {
      startTime: 0,
      duration: 5,
      prompt: 'test',
      lyrics: '',
    });
  });

  it('replaces the source track with bounced audio when replaceOriginal is true', async () => {
    const resultClip = await useProjectStore.getState().bounceInPlace(trackId, {
      replaceOriginal: true,
    });

    expect(resultClip).toBeDefined();
    expect(resultClip!.isolatedAudioKey).toBe('bounced-audio-key');
    expect(resultClip!.generationStatus).toBe('ready');
    expect(resultClip!.waveformPeaks).toEqual([0.1, 0.5, 0.9, 0.3]);

    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId);
    expect(track).toBeDefined();
    expect(track!.clips).toHaveLength(1);
    expect(track!.clips[0].isolatedAudioKey).toBe('bounced-audio-key');
    expect(track!.trackType).toBe('sample');
  });

  it('creates a sibling bounced sample track when replaceOriginal is false', async () => {
    const initialTrackCount = useProjectStore.getState().project!.tracks.length;

    const resultClip = await useProjectStore.getState().bounceInPlace(trackId, {
      replaceOriginal: false,
    });

    expect(resultClip).toBeDefined();
    const trackCount = useProjectStore.getState().project!.tracks.length;
    expect(trackCount).toBe(initialTrackCount + 1);

    // Original track should still exist with its original clips
    const originalTrack = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId);
    expect(originalTrack).toBeDefined();

    // New track should be inserted after the original
    const originalIndex = useProjectStore.getState().project!.tracks.findIndex((t) => t.id === trackId);
    const newTrack = useProjectStore.getState().project!.tracks[originalIndex + 1];
    expect(newTrack).toBeDefined();
    expect(newTrack.clips).toHaveLength(1);
    expect(newTrack.clips[0].isolatedAudioKey).toBe('bounced-audio-key');
    expect(newTrack.trackType).toBe('sample');
  });

  it('throws when project is null', async () => {
    useProjectStore.setState({ project: null });
    await expect(useProjectStore.getState().bounceInPlace(trackId)).rejects.toThrow('No project');
  });

  it('throws when track is not found', async () => {
    await expect(useProjectStore.getState().bounceInPlace('nonexistent')).rejects.toThrow("Track 'nonexistent' not found");
  });

  it('supports undo after bounceInPlace with replaceOriginal', async () => {
    const originalClipCount = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId)!.clips.length;

    await useProjectStore.getState().bounceInPlace(trackId, { replaceOriginal: true });

    // Verify the bounce happened
    const bouncedTrack = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId);
    expect(bouncedTrack!.trackType).toBe('sample');

    // Undo
    useProjectStore.getState().undo();

    // Verify undo restored original state
    const restoredTrack = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId);
    expect(restoredTrack!.clips).toHaveLength(originalClipCount);
    expect(restoredTrack!.trackType).toBe('stems');
  });

  it('bounceTrackToAudio delegates to bounceInPlace with replaceOriginal false', async () => {
    const initialTrackCount = useProjectStore.getState().project!.tracks.length;

    await useProjectStore.getState().bounceTrackToAudio(trackId);

    // Should create a new track (replaceOriginal: false)
    expect(useProjectStore.getState().project!.tracks.length).toBe(initialTrackCount + 1);
  });
});
