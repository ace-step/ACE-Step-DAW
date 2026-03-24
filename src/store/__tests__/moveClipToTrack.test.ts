import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('moveClipToTrack', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
  });

  it('moves a clip from one track to another', () => {
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

    store.moveClipToTrack(clip.id, trackB.id);

    const project = useProjectStore.getState().project!;
    const srcTrack = project.tracks.find((t) => t.id === trackA.id)!;
    const dstTrack = project.tracks.find((t) => t.id === trackB.id)!;
    expect(srcTrack.clips).toHaveLength(0);
    expect(dstTrack.clips).toHaveLength(1);
    expect(dstTrack.clips[0].id).toBe(clip.id);
  });

  it('updates startTime when provided', () => {
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

    store.moveClipToTrack(clip.id, trackB.id, 8);

    const project = useProjectStore.getState().project!;
    const dstTrack = project.tracks.find((t) => t.id === trackB.id)!;
    expect(dstTrack.clips[0].startTime).toBe(8);
  });

  it('is a no-op when targetTrackId does not exist', () => {
    const store = useProjectStore.getState();
    const trackA = store.addTrack('custom', 'sample');
    const clip = store.addClip(trackA.id, {
      startTime: 2,
      duration: 4,
      prompt: 'test',
      globalCaption: '',
      lyrics: '',
    });

    store.moveClipToTrack(clip.id, '__empty-2');

    const project = useProjectStore.getState().project!;
    const srcTrack = project.tracks.find((t) => t.id === trackA.id)!;
    expect(srcTrack.clips).toHaveLength(1);
    expect(srcTrack.clips[0].id).toBe(clip.id);
  });

  it('is a no-op when targetTrackId is a nonexistent UUID', () => {
    const store = useProjectStore.getState();
    const trackA = store.addTrack('custom', 'sample');
    const clip = store.addClip(trackA.id, {
      startTime: 2,
      duration: 4,
      prompt: 'test',
      globalCaption: '',
      lyrics: '',
    });

    store.moveClipToTrack(clip.id, 'nonexistent-track-id');

    const project = useProjectStore.getState().project!;
    const srcTrack = project.tracks.find((t) => t.id === trackA.id)!;
    expect(srcTrack.clips).toHaveLength(1);
  });
});

describe('move clip to new track (empty slot workflow)', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
  });

  it('can create a new track then move a clip to it', () => {
    const store = useProjectStore.getState();
    const trackA = store.addTrack('custom', 'sample');
    const clip = store.addClip(trackA.id, {
      startTime: 2,
      duration: 4,
      prompt: 'test',
      globalCaption: '',
      lyrics: '',
    });

    // Simulate ClipBlock's empty-slot resolution: create track, then move
    const newTrack = store.addTrack('custom', 'sample', { order: 3 });
    store.moveClipToTrack(clip.id, newTrack.id, 5);

    const project = useProjectStore.getState().project!;
    const srcTrack = project.tracks.find((t) => t.id === trackA.id)!;
    const dstTrack = project.tracks.find((t) => t.id === newTrack.id)!;
    expect(srcTrack.clips).toHaveLength(0);
    expect(dstTrack.clips).toHaveLength(1);
    expect(dstTrack.clips[0].id).toBe(clip.id);
    expect(dstTrack.clips[0].startTime).toBe(5);
    expect(dstTrack.order).toBe(3);
  });
});

describe('addTrack with order', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
  });

  it('creates a track at the specified order', () => {
    const store = useProjectStore.getState();
    store.addTrack('custom', 'sample'); // order 1
    store.addTrack('custom', 'sample'); // order 2

    const track3 = store.addTrack('custom', 'sample', { order: 5 });

    expect(track3.order).toBe(5);
  });

  it('creates a track at maxOrder+1 when no order specified', () => {
    const store = useProjectStore.getState();
    store.addTrack('custom', 'sample'); // order 1
    store.addTrack('custom', 'sample'); // order 2

    const track3 = store.addTrack('custom', 'sample');

    expect(track3.order).toBe(3);
  });
});
