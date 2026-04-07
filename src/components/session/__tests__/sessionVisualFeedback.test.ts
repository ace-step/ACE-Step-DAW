import { describe, it, expect } from 'vitest';

/**
 * These tests verify the visual feedback state computation logic
 * used by SessionView for scene playing/queued indicators.
 */

function computeActiveSceneIndices(
  tracks: Array<{ id: string; clips: Array<{ id: string } | null> }>,
  launchedSessionClips: Record<string, { clipId: string } | null>,
): Set<number> {
  const activeIndices = new Set<number>();
  for (const track of tracks) {
    const launch = launchedSessionClips[track.id];
    if (!launch?.clipId) continue;
    const clipIndex = track.clips.findIndex((c) => c?.id === launch.clipId);
    if (clipIndex >= 0) activeIndices.add(clipIndex);
  }
  return activeIndices;
}

function computeQueuedSceneIndices(
  pendingLaunches: Array<{ type: string; sceneId?: string }>,
  scenes: Array<{ id: string }>,
): Set<number> {
  const queued = new Set<number>();
  for (const launch of pendingLaunches) {
    if (launch.type === 'scene' && launch.sceneId) {
      const sceneIdx = scenes.findIndex((s) => s.id === launch.sceneId);
      if (sceneIdx >= 0) queued.add(sceneIdx);
    }
  }
  return queued;
}

describe('Session visual feedback state computation', () => {
  describe('computeActiveSceneIndices', () => {
    it('returns empty set when no clips are playing', () => {
      const result = computeActiveSceneIndices(
        [{ id: 't1', clips: [{ id: 'c1' }, { id: 'c2' }] }],
        {},
      );
      expect(result.size).toBe(0);
    });

    it('identifies the scene index of a playing clip', () => {
      const result = computeActiveSceneIndices(
        [{ id: 't1', clips: [{ id: 'c1' }, { id: 'c2' }] }],
        { t1: { clipId: 'c2' } },
      );
      expect(result.has(1)).toBe(true);
      expect(result.size).toBe(1);
    });

    it('identifies multiple active scenes across tracks', () => {
      const result = computeActiveSceneIndices(
        [
          { id: 't1', clips: [{ id: 'c1' }, { id: 'c2' }] },
          { id: 't2', clips: [null, { id: 'c3' }] },
        ],
        { t1: { clipId: 'c1' }, t2: { clipId: 'c3' } },
      );
      expect(result.has(0)).toBe(true);
      expect(result.has(1)).toBe(true);
    });

    it('ignores tracks with null launch', () => {
      const result = computeActiveSceneIndices(
        [{ id: 't1', clips: [{ id: 'c1' }] }],
        { t1: null },
      );
      expect(result.size).toBe(0);
    });
  });

  describe('computeQueuedSceneIndices', () => {
    it('returns empty set when no pending scene launches', () => {
      const result = computeQueuedSceneIndices([], [{ id: 's1' }]);
      expect(result.size).toBe(0);
    });

    it('identifies queued scene index', () => {
      const result = computeQueuedSceneIndices(
        [{ type: 'scene', sceneId: 's2' }],
        [{ id: 's1' }, { id: 's2' }, { id: 's3' }],
      );
      expect(result.has(1)).toBe(true);
      expect(result.size).toBe(1);
    });

    it('ignores non-scene pending launches', () => {
      const result = computeQueuedSceneIndices(
        [{ type: 'clip', sceneId: 's1' }, { type: 'stop-all' }],
        [{ id: 's1' }],
      );
      expect(result.size).toBe(0);
    });

    it('handles multiple queued scenes', () => {
      const result = computeQueuedSceneIndices(
        [{ type: 'scene', sceneId: 's1' }, { type: 'scene', sceneId: 's3' }],
        [{ id: 's1' }, { id: 's2' }, { id: 's3' }],
      );
      expect(result.has(0)).toBe(true);
      expect(result.has(2)).toBe(true);
      expect(result.size).toBe(2);
    });
  });

  describe('recording state visual feedback', () => {
    it('determines scene header class for active+recording state', () => {
      const isSceneActive = true;
      const isArrangementRecording = true;
      const isSceneQueued = false;
      const isSceneDragTarget = false;
      const isSceneDragSource = false;

      const className = isSceneDragTarget
        ? 'border-blue-500 bg-blue-500/10'
        : isSceneDragSource
          ? 'opacity-40 border-[#333] bg-[#242424]'
          : isSceneActive && isArrangementRecording
            ? 'border-red-500/50 bg-red-500/10'
            : isSceneActive
              ? 'border-emerald-500/50 bg-emerald-500/10'
              : isSceneQueued
                ? 'border-amber-400/50 bg-amber-400/5'
                : 'border-[#333] bg-[#242424]';

      expect(className).toBe('border-red-500/50 bg-red-500/10');
    });

    it('uses emerald class when active but not recording', () => {
      const isSceneActive = true;
      const isArrangementRecording = false;

      const className = isSceneActive && isArrangementRecording
        ? 'border-red-500/50 bg-red-500/10'
        : isSceneActive
          ? 'border-emerald-500/50 bg-emerald-500/10'
          : 'border-[#333] bg-[#242424]';

      expect(className).toBe('border-emerald-500/50 bg-emerald-500/10');
    });

    it('determines scene button label for recording state', () => {
      const getLabel = (isActive: boolean, isRecording: boolean, isQueued: boolean) =>
        isActive && isRecording ? '● REC' : isActive ? '▶ Playing' : isQueued ? '◈ Queued' : 'Launch';

      expect(getLabel(true, true, false)).toBe('● REC');
      expect(getLabel(true, false, false)).toBe('▶ Playing');
      expect(getLabel(false, false, true)).toBe('◈ Queued');
      expect(getLabel(false, false, false)).toBe('Launch');
    });

    it('uses red progress ring stroke when recording', () => {
      const getStroke = (isRecording: boolean) => isRecording ? '#ef4444' : '#4ade80';

      expect(getStroke(true)).toBe('#ef4444');
      expect(getStroke(false)).toBe('#4ade80');
    });

    it('uses red loop count text when recording', () => {
      const getClass = (isRecording: boolean) =>
        `text-xs ${isRecording ? 'text-red-400' : 'text-emerald-400'}`;

      expect(getClass(true)).toContain('text-red-400');
      expect(getClass(false)).toContain('text-emerald-400');
    });

    it('determines scene button style for active+recording', () => {
      const getButtonClass = (isActive: boolean, isRecording: boolean, isQueued: boolean) =>
        isActive && isRecording
          ? 'bg-red-600 text-white hover:bg-red-500'
          : isActive
            ? 'bg-emerald-600 text-white hover:bg-emerald-500'
            : isQueued
              ? 'bg-amber-600 text-white hover:bg-amber-500'
              : 'bg-[#303030] text-zinc-200 hover:bg-daw-accent';

      expect(getButtonClass(true, true, false)).toBe('bg-red-600 text-white hover:bg-red-500');
      expect(getButtonClass(true, false, false)).toBe('bg-emerald-600 text-white hover:bg-emerald-500');
    });
  });
});
