import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { nudgeSelectedClips, nudgeSelectedClipsToTrack } from '../clipNudge';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

function setupProject() {
  useProjectStore.setState({ project: null });
  useProjectStore.getState().createProject();
  // Default BPM is 120, so one beat = 0.5s
}

function addTrackWithClip(startTime: number, duration = 4) {
  const store = useProjectStore.getState();
  const track = store.addTrack('custom', 'sample');
  const clip = store.addClip(track.id, {
    startTime,
    duration,
    prompt: 'test',
    globalCaption: '',
    lyrics: '',
  });
  return { track, clip };
}

describe('nudgeSelectedClips', () => {
  beforeEach(() => {
    setupProject();
    useUIStore.setState({ selectedClipIds: new Set() });
  });

  it('nudges selected clips right by one beat', () => {
    const { clip } = addTrackWithClip(2);
    useUIStore.setState({ selectedClipIds: new Set([clip.id]) });

    nudgeSelectedClips('right');

    const project = useProjectStore.getState().project!;
    const movedClip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === clip.id)!;
    // BPM=120, one beat = 0.5s, so 2 + 0.5 = 2.5
    expect(movedClip.startTime).toBe(2.5);
  });

  it('nudges selected clips left by one beat', () => {
    const { clip } = addTrackWithClip(2);
    useUIStore.setState({ selectedClipIds: new Set([clip.id]) });

    nudgeSelectedClips('left');

    const project = useProjectStore.getState().project!;
    const movedClip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === clip.id)!;
    // 2 - 0.5 = 1.5
    expect(movedClip.startTime).toBe(1.5);
  });

  it('does not nudge clips past time 0', () => {
    const { clip } = addTrackWithClip(0.2);
    useUIStore.setState({ selectedClipIds: new Set([clip.id]) });

    nudgeSelectedClips('left');

    const project = useProjectStore.getState().project!;
    const movedClip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === clip.id)!;
    // batchMoveClips clamps to 0 internally
    expect(movedClip.startTime).toBe(0);
  });

  it('nudges multiple selected clips together', () => {
    const { clip: clip1 } = addTrackWithClip(1);
    const { clip: clip2 } = addTrackWithClip(3);
    useUIStore.setState({ selectedClipIds: new Set([clip1.id, clip2.id]) });

    nudgeSelectedClips('right');

    const project = useProjectStore.getState().project!;
    const allClips = project.tracks.flatMap((t) => t.clips);
    const c1 = allClips.find((c) => c.id === clip1.id)!;
    const c2 = allClips.find((c) => c.id === clip2.id)!;
    expect(c1.startTime).toBe(1.5);
    expect(c2.startTime).toBe(3.5);
  });

  it('is a no-op when no clips are selected', () => {
    addTrackWithClip(2);
    // No selection
    nudgeSelectedClips('right');
    // Should not throw and clips should be unchanged
    const project = useProjectStore.getState().project!;
    const clip = project.tracks.flatMap((t) => t.clips)[0];
    expect(clip.startTime).toBe(2);
  });
});

describe('nudgeSelectedClipsToTrack', () => {
  beforeEach(() => {
    setupProject();
    useUIStore.setState({ selectedClipIds: new Set() });
  });

  it('moves selected clip up to previous track', () => {
    const store = useProjectStore.getState();
    const trackA = store.addTrack('custom', 'sample');
    const trackB = store.addTrack('custom', 'sample');
    const clip = store.addClip(trackB.id, {
      startTime: 2,
      duration: 4,
      prompt: 'test',
      globalCaption: '',
      lyrics: '',
    });
    useUIStore.setState({ selectedClipIds: new Set([clip.id]) });

    nudgeSelectedClipsToTrack('up');

    const project = useProjectStore.getState().project!;
    const tA = project.tracks.find((t) => t.id === trackA.id)!;
    const tB = project.tracks.find((t) => t.id === trackB.id)!;
    expect(tA.clips).toHaveLength(1);
    expect(tA.clips[0].id).toBe(clip.id);
    expect(tB.clips).toHaveLength(0);
  });

  it('moves selected clip down to next track', () => {
    const store = useProjectStore.getState();
    const trackA = store.addTrack('custom', 'sample');
    const trackB = store.addTrack('custom', 'sample');
    const clip = store.addClip(trackA.id, {
      startTime: 2,
      duration: 4,
      prompt: 'test',
      globalCaption: '',
      lyrics: '',
    });
    useUIStore.setState({ selectedClipIds: new Set([clip.id]) });

    nudgeSelectedClipsToTrack('down');

    const project = useProjectStore.getState().project!;
    const tA = project.tracks.find((t) => t.id === trackA.id)!;
    const tB = project.tracks.find((t) => t.id === trackB.id)!;
    expect(tA.clips).toHaveLength(0);
    expect(tB.clips).toHaveLength(1);
    expect(tB.clips[0].id).toBe(clip.id);
  });

  it('does nothing when clip is on first track and nudging up', () => {
    const store = useProjectStore.getState();
    const trackA = store.addTrack('custom', 'sample');
    store.addTrack('custom', 'sample');
    const clip = store.addClip(trackA.id, {
      startTime: 2,
      duration: 4,
      prompt: 'test',
      globalCaption: '',
      lyrics: '',
    });
    useUIStore.setState({ selectedClipIds: new Set([clip.id]) });

    nudgeSelectedClipsToTrack('up');

    const project = useProjectStore.getState().project!;
    const tA = project.tracks.find((t) => t.id === trackA.id)!;
    expect(tA.clips).toHaveLength(1);
  });

  it('does nothing when clip is on last track and nudging down', () => {
    const store = useProjectStore.getState();
    store.addTrack('custom', 'sample');
    const trackB = store.addTrack('custom', 'sample');
    const clip = store.addClip(trackB.id, {
      startTime: 2,
      duration: 4,
      prompt: 'test',
      globalCaption: '',
      lyrics: '',
    });
    useUIStore.setState({ selectedClipIds: new Set([clip.id]) });

    nudgeSelectedClipsToTrack('down');

    const project = useProjectStore.getState().project!;
    const tB = project.tracks.find((t) => t.id === trackB.id)!;
    expect(tB.clips).toHaveLength(1);
  });

  it('preserves clip startTime when moving between tracks', () => {
    const store = useProjectStore.getState();
    const trackA = store.addTrack('custom', 'sample');
    store.addTrack('custom', 'sample');
    const clip = store.addClip(trackA.id, {
      startTime: 5.5,
      duration: 4,
      prompt: 'test',
      globalCaption: '',
      lyrics: '',
    });
    useUIStore.setState({ selectedClipIds: new Set([clip.id]) });

    nudgeSelectedClipsToTrack('down');

    const project = useProjectStore.getState().project!;
    const movedClip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === clip.id)!;
    expect(movedClip.startTime).toBe(5.5);
  });

  it('is a no-op when no clips are selected', () => {
    const store = useProjectStore.getState();
    const trackA = store.addTrack('custom', 'sample');
    store.addTrack('custom', 'sample');
    store.addClip(trackA.id, {
      startTime: 2,
      duration: 4,
      prompt: 'test',
      globalCaption: '',
      lyrics: '',
    });

    nudgeSelectedClipsToTrack('up');

    const project = useProjectStore.getState().project!;
    const tA = project.tracks.find((t) => t.id === trackA.id)!;
    expect(tA.clips).toHaveLength(1);
  });
});
