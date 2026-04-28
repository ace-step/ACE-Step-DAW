import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../projectStore';
import type { Clip, Track, Project } from '../../types/project';

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: overrides.id ?? 'clip-1',
    trackId: overrides.trackId ?? 'track-1',
    startTime: 0,
    duration: 10,
    prompt: 'test prompt',
    lyrics: '',
    generationStatus: 'ready',
    generationJobId: null,
    cumulativeMixKey: null,
    isolatedAudioKey: null,
    waveformPeaks: null,
    ...overrides,
  };
}

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: overrides.id ?? 'track-1',
    trackName: overrides.trackName ?? 'vocals',
    displayName: overrides.displayName ?? 'Vocals',
    color: '#ff0000',
    order: 0,
    volume: 0.8,
    muted: false,
    soloed: false,
    clips: overrides.clips ?? [makeClip()],
    effects: [],
    effectsEnabled: true,
    ...overrides,
  } as Track;
}

function setupProject(tracks: Track[] = [makeTrack()]) {
  useProjectStore.setState({
    project: {
      id: 'test-project',
      name: 'Test',
      tracks,
      bpm: 120,
      keyScale: 'C major',
      timeSignature: 4,
      timeSignatureDenominator: 4,
      globalCaption: '',
      measures: 8,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      totalDuration: 30,
      markers: [],
      tempoMap: [],
      timeSignatureMap: [],
      history: [],
    } as unknown as Project,
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('clip tags', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
  });

  it('addClipTag adds a tag to a clip', () => {
    setupProject();
    useProjectStore.getState().addClipTag('clip-1', 'verse');

    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clip.tags).toContain('verse');
  });

  it('addClipTag does not duplicate existing tags', () => {
    setupProject([makeTrack({ clips: [makeClip({ tags: ['verse'] })] })]);
    useProjectStore.getState().addClipTag('clip-1', 'verse');

    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clip.tags).toEqual(['verse']);
  });

  it('removeClipTag removes a specific tag', () => {
    setupProject([makeTrack({ clips: [makeClip({ tags: ['verse', 'favorite'] })] })]);
    useProjectStore.getState().removeClipTag('clip-1', 'verse');

    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clip.tags).toEqual(['favorite']);
  });

  it('removeClipTag is a no-op if tag does not exist', () => {
    setupProject([makeTrack({ clips: [makeClip({ tags: ['verse'] })] })]);
    useProjectStore.getState().removeClipTag('clip-1', 'nonexistent');

    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clip.tags).toEqual(['verse']);
  });

  it('addClipTag initializes tags array if undefined', () => {
    setupProject();
    const clipBefore = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clipBefore.tags).toBeUndefined();

    useProjectStore.getState().addClipTag('clip-1', 'chorus');

    const clipAfter = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clipAfter.tags).toEqual(['chorus']);
  });

  it('addClipTag supports undo via store.undo()', () => {
    setupProject();
    useProjectStore.getState().addClipTag('clip-1', 'bridge');
    expect(useProjectStore.getState().project!.tracks[0].clips[0].tags).toContain('bridge');

    // Undo should revert the tag addition
    useProjectStore.getState().undo();
    const clipAfterUndo = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clipAfterUndo.tags ?? []).not.toContain('bridge');
  });

  it('handles multiple tags on same clip', () => {
    setupProject();
    const store = useProjectStore.getState();
    store.addClipTag('clip-1', 'verse');
    useProjectStore.getState().addClipTag('clip-1', 'favorite');
    useProjectStore.getState().addClipTag('clip-1', 'needs-work');

    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clip.tags).toEqual(['verse', 'favorite', 'needs-work']);
  });

  it('returns silently when project is null', () => {
    useProjectStore.setState({ project: null });
    expect(() => useProjectStore.getState().addClipTag('clip-1', 'tag')).not.toThrow();
    expect(() => useProjectStore.getState().removeClipTag('clip-1', 'tag')).not.toThrow();
  });

  it('returns silently when clip does not exist', () => {
    setupProject();
    expect(() => useProjectStore.getState().addClipTag('nonexistent', 'tag')).not.toThrow();
  });

  it('trims whitespace from tags', () => {
    setupProject();
    useProjectStore.getState().addClipTag('clip-1', '  verse  ');
    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clip.tags).toEqual(['verse']);
  });

  it('rejects empty/whitespace-only tags', () => {
    setupProject();
    useProjectStore.getState().addClipTag('clip-1', '');
    useProjectStore.getState().addClipTag('clip-1', '   ');
    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clip.tags).toBeUndefined();
  });

  it('removeClipTag trims before matching', () => {
    setupProject([makeTrack({ clips: [makeClip({ tags: ['verse'] })] })]);
    useProjectStore.getState().removeClipTag('clip-1', '  verse  ');
    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clip.tags).toEqual([]);
  });
});
