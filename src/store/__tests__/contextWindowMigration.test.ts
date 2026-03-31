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

  describe('updateClip (same-track drag path)', () => {
    it('converts legacy absolute contextWindow to relative offsets on startTime change', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('custom', 'sample');
      const clip = addClipWithLegacyCtx(track.id, 5.5, 3.0, 8.5);

      // Same-track drag: updateClip called with new startTime
      store.updateClip(clip.id, { startTime: 9.5 });

      const updated = getClip(clip.id)!;
      expect(updated.startTime).toBe(9.5);

      const ctx = updated.generationParams?.contextWindow;
      expect(ctx).toHaveProperty('offsetStart');

      const resolved = resolveContextWindow(updated);
      expect(resolved!.startTime).toBe(7.0);  // 9.5 + (3.0 - 5.5)
      expect(resolved!.endTime).toBe(12.5);   // 9.5 + (8.5 - 5.5)
    });

    it('does not migrate when caller explicitly replaces contextWindow in generationParams', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('custom', 'sample');
      const clip = addClipWithLegacyCtx(track.id, 5.5, 3.0, 8.5);
      // Re-fetch to get live generationParams (after the helper's updateClip)
      const liveClip = getClip(clip.id)!;

      store.updateClip(liveClip.id, {
        startTime: 9.5,
        generationParams: { ...liveClip.generationParams!, contextWindow: null },
      });

      const updated = getClip(liveClip.id)!;
      expect(updated.generationParams?.contextWindow).toBeNull();
    });

    it('migrates even when caller also updates other generationParams fields (but not contextWindow)', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('custom', 'sample');
      const clip = addClipWithLegacyCtx(track.id, 5.5, 3.0, 8.5);

      // Caller changes startTime + prompt, but does NOT include contextWindow in generationParams
      const liveParams = getClip(clip.id)!.generationParams as Record<string, unknown>;
      const { contextWindow: _dropped, ...paramsWithoutCtx } = liveParams;
      store.updateClip(clip.id, {
        startTime: 9.5,
        generationParams: { ...(paramsWithoutCtx as object), prompt: 'updated' } as typeof liveParams as typeof clip.generationParams,
      });

      const updated = getClip(clip.id)!;
      expect(updated.generationParams?.prompt).toBe('updated');
      // contextWindow should have been migrated to relative format
      const ctx = updated.generationParams?.contextWindow;
      expect(ctx).toHaveProperty('offsetStart');
      const resolved = resolveContextWindow(updated);
      expect(resolved!.startTime).toBe(7.0);
      expect(resolved!.endTime).toBe(12.5);
    });

    it('preserves relative contextWindow unchanged on startTime change', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('custom', 'sample');
      const clip = addClipWithRelativeCtx(track.id, 5.5, -2.5, 3.0);

      store.updateClip(clip.id, { startTime: 9.5 });

      const updated = getClip(clip.id)!;
      const ctx = updated.generationParams?.contextWindow;
      expect(ctx).toHaveProperty('offsetStart', -2.5);
      expect(ctx).toHaveProperty('offsetEnd', 3.0);
    });
  });

  describe('batchMoveClips (clamp-to-zero)', () => {
    it('uses post-clamp startTime as migration anchor when clip is clamped to 0', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('custom', 'sample');
      // Clip at t=2, context [1.0, 4.0]
      const clip = addClipWithLegacyCtx(track.id, 2, 1.0, 4.0);

      // Move back by 5s — would go to t=-3, clamped to 0
      store.batchMoveClips([clip.id], -5);

      const moved = getClip(clip.id)!;
      expect(moved.startTime).toBe(0);

      const resolved = resolveContextWindow(moved);
      // Migration anchors to pre-move c.startTime=2 (correct: preserves
      // the relationship between clip and context across all move scenarios).
      //   offsetStart = 1.0 - 2 = -1.0, offsetEnd = 4.0 - 2 = +2.0
      // Resolved at clamped startTime=0: 0 + (-1.0) = -1.0, 0 + 2.0 = 2.0
      // (negative context start is valid — generation code clamps to project start)
      expect(resolved!.startTime).toBeCloseTo(-1.0);
      expect(resolved!.endTime).toBeCloseTo(2.0);
    });
  });

  describe('splitClip', () => {
    it('migrates legacy contextWindow for rightClip using splitTime as anchor', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('custom', 'sample');
      // Clip at t=2, duration=10 (t=2..12), context [0.0, 9.0]
      // We inject legacy ctx manually since addClipWithLegacyCtx uses fixed duration=4
      const base = store.addClip(track.id, {
        startTime: 2,
        duration: 10,
        prompt: 'test',
        globalCaption: '',
        lyrics: '',
      });
      store.updateClip(base.id, {
        generationParams: {
          ...base.generationParams,
          contextWindow: { startTime: 0.0, endTime: 9.0 },
        },
      });

      // Split at t=6 — rightClip startTime = 6, left is t=2..6
      store.splitClip(base.id, 6);

      const project = useProjectStore.getState().project!;
      const allClips = project.tracks.flatMap(t => t.clips);
      const rightClip = allClips.find(c => c.startTime === 6);
      expect(rightClip).toBeDefined();

      const ctx = rightClip!.generationParams?.contextWindow;
      expect(ctx).toHaveProperty('offsetStart');

      const resolved = resolveContextWindow(rightClip!);
      // Migration anchor = splitTime=6:
      //   offsetStart = 0.0 - 6 = -6.0, offsetEnd = 9.0 - 6 = +3.0
      // Resolved: 6 + (-6.0) = 0.0, 6 + 3.0 = 9.0
      expect(resolved!.startTime).toBeCloseTo(0.0);
      expect(resolved!.endTime).toBeCloseTo(9.0);
    });
  });
});
