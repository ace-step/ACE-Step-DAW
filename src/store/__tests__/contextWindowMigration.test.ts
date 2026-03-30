import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';
import { resolveContextWindow } from '../../services/generationPipeline';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

/**
 * Regression tests for #1189: after clip move, contextWindow must resolve
 * to the correct absolute times — not the stale pre-move values.
 */
describe('contextWindow migration on clip move', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
  });

  function addClipWithLegacyCtx(trackId: string, startTime: number, ctxStart: number, ctxEnd: number) {
    const clip = useProjectStore.getState().addClip(trackId, {
      startTime,
      duration: 4,
      prompt: 'test',
      globalCaption: '',
      lyrics: '',
    });
    // Inject legacy absolute contextWindow
    useProjectStore.getState().updateClip(clip.id, {
      generationParams: {
        ...clip.generationParams,
        contextWindow: { startTime: ctxStart, endTime: ctxEnd },
      },
    });
    return clip;
  }

  function addClipWithRelativeCtx(trackId: string, startTime: number, offsetStart: number, offsetEnd: number) {
    const clip = useProjectStore.getState().addClip(trackId, {
      startTime,
      duration: 4,
      prompt: 'test',
      globalCaption: '',
      lyrics: '',
    });
    useProjectStore.getState().updateClip(clip.id, {
      generationParams: {
        ...clip.generationParams,
        contextWindow: { offsetStart, offsetEnd, trackIds: ['t1'] },
      },
    });
    return clip;
  }

  function getClip(clipId: string) {
    const project = useProjectStore.getState().project!;
    for (const t of project.tracks) {
      const c = t.clips.find((c) => c.id === clipId);
      if (c) return c;
    }
    return undefined;
  }

  describe('batchMoveClips', () => {
    it('converts legacy absolute contextWindow to relative offsets on move', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('custom', 'sample');
      // Clip at bar 4 (t=5.5), context window bars 2-6 (t=3.0-8.5)
      const clip = addClipWithLegacyCtx(track.id, 5.5, 3.0, 8.5);

      // Move clip forward by 4 seconds (to bar 8 area)
      store.batchMoveClips([clip.id], 4);

      const moved = getClip(clip.id)!;
      expect(moved.startTime).toBe(9.5);

      // The contextWindow should now be in relative format
      const ctx = moved.generationParams?.contextWindow;
      expect(ctx).toBeDefined();
      expect(ctx).toHaveProperty('offsetStart');
      expect(ctx).toHaveProperty('offsetEnd');

      // Resolved context should reflect the move
      const resolved = resolveContextWindow(moved);
      expect(resolved).not.toBeNull();
      // Original relative offsets: ctxStart - origStart = 3.0 - 5.5 = -2.5
      //                           ctxEnd - origStart = 8.5 - 5.5 = 3.0
      // After move: resolved startTime = 9.5 + (-2.5) = 7.0
      //             resolved endTime = 9.5 + 3.0 = 12.5
      expect(resolved!.startTime).toBe(7.0);
      expect(resolved!.endTime).toBe(12.5);
    });

    it('preserves relative contextWindow unchanged on move', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('custom', 'sample');
      const clip = addClipWithRelativeCtx(track.id, 5.5, -2.5, 3.0);

      store.batchMoveClips([clip.id], 4);

      const moved = getClip(clip.id)!;
      expect(moved.startTime).toBe(9.5);

      const ctx = moved.generationParams?.contextWindow;
      expect(ctx).toHaveProperty('offsetStart', -2.5);
      expect(ctx).toHaveProperty('offsetEnd', 3.0);
      expect(ctx).toHaveProperty('trackIds');

      const resolved = resolveContextWindow(moved);
      expect(resolved!.startTime).toBe(7.0);
      expect(resolved!.endTime).toBe(12.5);
    });

    it('handles clip without contextWindow gracefully', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('custom', 'sample');
      const clip = store.addClip(track.id, {
        startTime: 5,
        duration: 4,
        prompt: 'test',
        globalCaption: '',
        lyrics: '',
      });

      store.batchMoveClips([clip.id], 3);

      const moved = getClip(clip.id)!;
      expect(moved.startTime).toBe(8);
      expect(moved.generationParams?.contextWindow).toBeUndefined();
    });
  });

  describe('moveClipToTrack', () => {
    it('converts legacy absolute contextWindow to relative offsets on move with new startTime', () => {
      const store = useProjectStore.getState();
      const trackA = store.addTrack('custom', 'sample');
      const trackB = store.addTrack('custom', 'sample');
      const clip = addClipWithLegacyCtx(trackA.id, 5.5, 3.0, 8.5);

      store.moveClipToTrack(clip.id, trackB.id, 10);

      const moved = getClip(clip.id)!;
      expect(moved.startTime).toBe(10);

      const ctx = moved.generationParams?.contextWindow;
      expect(ctx).toHaveProperty('offsetStart');

      const resolved = resolveContextWindow(moved);
      // offsets: 3.0 - 5.5 = -2.5, 8.5 - 5.5 = 3.0
      // resolved: 10 + (-2.5) = 7.5, 10 + 3.0 = 13.0
      expect(resolved!.startTime).toBe(7.5);
      expect(resolved!.endTime).toBe(13.0);
    });

    it('converts legacy contextWindow even when only track changes (no startTime change)', () => {
      const store = useProjectStore.getState();
      const trackA = store.addTrack('custom', 'sample');
      const trackB = store.addTrack('custom', 'sample');
      const clip = addClipWithLegacyCtx(trackA.id, 5.5, 3.0, 8.5);

      // Move to different track, same position
      store.moveClipToTrack(clip.id, trackB.id);

      const moved = getClip(clip.id)!;
      expect(moved.startTime).toBe(5.5);

      const ctx = moved.generationParams?.contextWindow;
      expect(ctx).toHaveProperty('offsetStart');

      const resolved = resolveContextWindow(moved);
      // Same position, so resolved should match original absolute values
      expect(resolved!.startTime).toBe(3.0);
      expect(resolved!.endTime).toBe(8.5);
    });
  });
});
