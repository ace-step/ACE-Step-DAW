import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useProjectStore } from '../projectStore';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('drag performance optimizations', () => {
  let trackId: string;
  let clipId: string;

  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    const track = useProjectStore.getState().addTrack('vocals');
    trackId = track.id;
    useProjectStore.getState().addClip(trackId, {
      startTime: 0,
      duration: 10,
      prompt: 'test clip',
      lyrics: '',
    });
    clipId = useProjectStore.getState().project!.tracks[0].clips[0].id;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function getProject() {
    return useProjectStore.getState().project!;
  }

  describe('updateClip during drag skips computeTotalDuration', () => {
    it('does not change totalDuration during drag', () => {
      const store = useProjectStore.getState();
      const durationBefore = getProject().totalDuration;

      store.beginDrag();
      // Move clip far out — would normally change totalDuration
      store.updateClip(clipId, { startTime: 1000 });
      const durationDuring = getProject().totalDuration;

      expect(durationDuring).toBe(durationBefore);

      store.endDrag();
      // After endDrag, totalDuration should be recomputed
      const durationAfter = getProject().totalDuration;
      expect(durationAfter).toBeGreaterThan(durationBefore);
    });

    it('does not update updatedAt during drag', () => {
      let time = 1000;
      vi.spyOn(Date, 'now').mockImplementation(() => time);

      const store = useProjectStore.getState();
      // Set a known baseline
      useProjectStore.setState({ project: { ...getProject(), updatedAt: 1000 } });
      const updatedAtBefore = getProject().updatedAt;

      store.beginDrag();
      time = 2000;
      store.updateClip(clipId, { startTime: 500 });
      const updatedAtDuring = getProject().updatedAt;
      expect(updatedAtDuring).toBe(updatedAtBefore);

      time = 3000;
      store.endDrag();
      const updatedAtAfter = getProject().updatedAt;
      expect(updatedAtAfter).toBe(3000);
      expect(updatedAtAfter).toBeGreaterThan(updatedAtBefore);
    });
  });

  describe('batchMoveClips during drag skips computeTotalDuration', () => {
    it('does not change totalDuration during drag', () => {
      const store = useProjectStore.getState();
      const durationBefore = getProject().totalDuration;

      store.beginDrag();
      store.batchMoveClips([clipId], 1000);
      const durationDuring = getProject().totalDuration;

      expect(durationDuring).toBe(durationBefore);

      store.endDrag();
      const durationAfter = getProject().totalDuration;
      expect(durationAfter).toBeGreaterThan(durationBefore);
    });

    it('does not update updatedAt during drag', () => {
      let time = 1000;
      vi.spyOn(Date, 'now').mockImplementation(() => time);

      const store = useProjectStore.getState();
      useProjectStore.setState({ project: { ...getProject(), updatedAt: 1000 } });
      const updatedAtBefore = getProject().updatedAt;

      store.beginDrag();
      time = 2000;
      store.batchMoveClips([clipId], 500);
      const updatedAtDuring = getProject().updatedAt;
      expect(updatedAtDuring).toBe(updatedAtBefore);

      time = 3000;
      store.endDrag();
      const updatedAtAfter = getProject().updatedAt;
      expect(updatedAtAfter).toBe(3000);
      expect(updatedAtAfter).toBeGreaterThan(updatedAtBefore);
    });
  });

  describe('endDrag recomputes totalDuration', () => {
    it('recomputes totalDuration and updatedAt after drag ends', () => {
      let time = 1000;
      vi.spyOn(Date, 'now').mockImplementation(() => time);

      const store = useProjectStore.getState();
      useProjectStore.setState({ project: { ...getProject(), updatedAt: 1000 } });
      const durationBefore = getProject().totalDuration;

      store.beginDrag();
      time = 2000;
      store.updateClip(clipId, { startTime: 2000 });
      // During drag: stale values
      expect(getProject().totalDuration).toBe(durationBefore);

      time = 3000;
      store.endDrag();
      // After drag: fresh values
      expect(getProject().totalDuration).toBeGreaterThan(durationBefore);
      expect(getProject().updatedAt).toBe(3000);
    });
  });
});
