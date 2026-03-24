import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useProjectStore } from '../../../store/projectStore';

vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

/**
 * Tests for clip drag store-update batching (#841).
 *
 * The ClipBlock mousemove handler should batch store updates via
 * requestAnimationFrame so that multiple mousemove events within a
 * single animation frame result in only ONE store update call.
 *
 * We test the batching pattern extracted from the component:
 *   - pendingStoreUpdate / storeRafId variables
 *   - Only the last pending update runs when RAF fires
 *   - Cleanup flushes pending update and cancels RAF
 */

describe('ClipBlock drag store-update batching (#841)', () => {
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

    // Use fake timers to control requestAnimationFrame
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /**
   * Simulate the RAF-batching pattern used in ClipBlock's onMouseMove.
   * This mirrors the implementation: each mousemove stores a pending
   * update and schedules a single RAF to flush it.
   */
  function createBatchedUpdater() {
    let pendingStoreUpdate: (() => void) | null = null;
    let storeRafId = 0;

    return {
      schedule(fn: () => void) {
        pendingStoreUpdate = fn;
        if (!storeRafId) {
          storeRafId = requestAnimationFrame(() => {
            if (pendingStoreUpdate) pendingStoreUpdate();
            pendingStoreUpdate = null;
            storeRafId = 0;
          });
        }
      },
      flush() {
        if (storeRafId) {
          cancelAnimationFrame(storeRafId);
          storeRafId = 0;
        }
        if (pendingStoreUpdate) {
          pendingStoreUpdate();
          pendingStoreUpdate = null;
        }
      },
      get hasPending() {
        return pendingStoreUpdate !== null;
      },
      get hasScheduledRaf() {
        return storeRafId !== 0;
      },
    };
  }

  it('multiple store updates within one frame are coalesced into one', () => {
    const updateClip = vi.fn();
    const batcher = createBatchedUpdater();

    // Simulate 5 rapid mousemove events in the same frame
    batcher.schedule(() => updateClip('pos-1'));
    batcher.schedule(() => updateClip('pos-2'));
    batcher.schedule(() => updateClip('pos-3'));
    batcher.schedule(() => updateClip('pos-4'));
    batcher.schedule(() => updateClip('pos-5'));

    // Before RAF fires, no calls yet
    expect(updateClip).not.toHaveBeenCalled();
    expect(batcher.hasScheduledRaf).toBe(true);

    // Fire the RAF callback
    vi.advanceTimersToNextTimer();

    // Only the LAST scheduled update should have run
    expect(updateClip).toHaveBeenCalledTimes(1);
    expect(updateClip).toHaveBeenCalledWith('pos-5');
  });

  it('flush on mouseup commits the pending update immediately', () => {
    const store = useProjectStore.getState();
    store.beginDrag();

    const batcher = createBatchedUpdater();

    // Schedule a store update (simulating last mousemove)
    batcher.schedule(() => {
      store.updateClip(clipId, { startTime: 5.0 });
    });

    // Before flush: clip is still at original position
    const clipBefore = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clipBefore.startTime).toBe(0);

    // Flush (simulating mouseup cleanup)
    batcher.flush();

    // After flush: clip is at the final position
    const clipAfter = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clipAfter.startTime).toBe(5.0);

    // No pending RAF remains
    expect(batcher.hasPending).toBe(false);
    expect(batcher.hasScheduledRaf).toBe(false);

    store.endDrag();
  });

  it('flush with no pending update is a no-op', () => {
    const batcher = createBatchedUpdater();
    // Should not throw
    batcher.flush();
    expect(batcher.hasPending).toBe(false);
    expect(batcher.hasScheduledRaf).toBe(false);
  });

  it('after RAF fires, a new update schedules a new RAF', () => {
    const updateClip = vi.fn();
    const batcher = createBatchedUpdater();

    // First frame
    batcher.schedule(() => updateClip('frame-1'));
    vi.advanceTimersToNextTimer();
    expect(updateClip).toHaveBeenCalledTimes(1);
    expect(updateClip).toHaveBeenCalledWith('frame-1');

    // Second frame — should schedule a new RAF
    batcher.schedule(() => updateClip('frame-2'));
    expect(batcher.hasScheduledRaf).toBe(true);
    vi.advanceTimersToNextTimer();
    expect(updateClip).toHaveBeenCalledTimes(2);
    expect(updateClip).toHaveBeenCalledWith('frame-2');
  });

  it('cancel + flush does not call the update twice', () => {
    const updateClip = vi.fn();
    const batcher = createBatchedUpdater();

    batcher.schedule(() => updateClip('pending'));
    // Flush cancels the RAF and calls the update once
    batcher.flush();
    expect(updateClip).toHaveBeenCalledTimes(1);

    // Advancing timers should NOT trigger another call (RAF was cancelled)
    vi.advanceTimersToNextTimer();
    expect(updateClip).toHaveBeenCalledTimes(1);
  });
});
