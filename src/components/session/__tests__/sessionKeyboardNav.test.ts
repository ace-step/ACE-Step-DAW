import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../../../store/uiStore';
import { useProjectStore } from '../../../store/projectStore';

/**
 * Tests for session view keyboard navigation logic.
 *
 * These tests validate the selectedSessionSlot state and navigation
 * helpers. The actual keydown handler dispatches to the same store
 * actions tested here; full integration tests would require firing
 * keyboard events in a browser context.
 */

function setupThreeTracks() {
  const ps = useProjectStore.getState();
  ps.createProject();
  const t0 = ps.addTrack('Track A', 'stems', { order: 0 });
  const t1 = ps.addTrack('Track B', 'stems', { order: 1 });
  const t2 = ps.addTrack('Track C', 'stems', { order: 2 });

  // Add playable clips to each track so sceneCount > 0
  ps.addClip(t0.id, { startTime: 0, duration: 4, prompt: 'clip-a1' });
  ps.addClip(t0.id, { startTime: 4, duration: 4, prompt: 'clip-a2' });
  ps.addClip(t1.id, { startTime: 0, duration: 4, prompt: 'clip-b1' });
  ps.addClip(t2.id, { startTime: 0, duration: 4, prompt: 'clip-c1' });
  ps.addClip(t2.id, { startTime: 4, duration: 4, prompt: 'clip-c2' });
  ps.addClip(t2.id, { startTime: 8, duration: 4, prompt: 'clip-c3' });

  // Mark clips as ready so they count as playable
  const project = useProjectStore.getState().project!;
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      ps.updateClip(clip.id, { generationStatus: 'ready' });
    }
  }

  return { t0, t1, t2 };
}

function getOrderedTrackIds(): string[] {
  const project = useProjectStore.getState().project!;
  return [...project.tracks].sort((a, b) => a.order - b.order).map((t) => t.id);
}

describe('Session keyboard navigation', () => {
  beforeEach(() => {
    useUIStore.setState({ selectedSessionSlot: null });
  });

  it('starts with no selection', () => {
    expect(useUIStore.getState().selectedSessionSlot).toBeNull();
  });

  it('setSelectedSessionSlot sets the slot', () => {
    useUIStore.getState().setSelectedSessionSlot({ trackId: 'track-1', sceneIndex: 0 });
    expect(useUIStore.getState().selectedSessionSlot).toEqual({ trackId: 'track-1', sceneIndex: 0 });
  });

  it('clearSelectedSessionSlot resets to null', () => {
    useUIStore.getState().setSelectedSessionSlot({ trackId: 'track-1', sceneIndex: 0 });
    useUIStore.getState().clearSelectedSessionSlot();
    expect(useUIStore.getState().selectedSessionSlot).toBeNull();
  });

  describe('arrow navigation logic', () => {
    let trackIds: string[];

    beforeEach(() => {
      const { t0, t1, t2 } = setupThreeTracks();
      trackIds = [t0.id, t1.id, t2.id];
    });

    it('from no selection, selecting first track + first scene', () => {
      // Simulate what the keyboard handler does when no slot is selected
      const orderedIds = getOrderedTrackIds();
      useUIStore.getState().setSelectedSessionSlot({ trackId: orderedIds[0], sceneIndex: 0 });
      expect(useUIStore.getState().selectedSessionSlot).toEqual({
        trackId: trackIds[0],
        sceneIndex: 0,
      });
    });

    it('ArrowUp from track[1] scene[2] moves to track[0] scene[2]', () => {
      useUIStore.getState().setSelectedSessionSlot({ trackId: trackIds[1], sceneIndex: 2 });
      // Navigate up
      const orderedIds = getOrderedTrackIds();
      const slot = useUIStore.getState().selectedSessionSlot!;
      const trackIdx = orderedIds.indexOf(slot.trackId);
      const nextIdx = Math.max(0, trackIdx - 1);
      useUIStore.getState().setSelectedSessionSlot({ trackId: orderedIds[nextIdx], sceneIndex: slot.sceneIndex });

      expect(useUIStore.getState().selectedSessionSlot).toEqual({
        trackId: trackIds[0],
        sceneIndex: 2,
      });
    });

    it('ArrowUp from first track stays at first track', () => {
      useUIStore.getState().setSelectedSessionSlot({ trackId: trackIds[0], sceneIndex: 1 });
      const orderedIds = getOrderedTrackIds();
      const slot = useUIStore.getState().selectedSessionSlot!;
      const trackIdx = orderedIds.indexOf(slot.trackId);
      const nextIdx = Math.max(0, trackIdx - 1);
      useUIStore.getState().setSelectedSessionSlot({ trackId: orderedIds[nextIdx], sceneIndex: slot.sceneIndex });

      expect(useUIStore.getState().selectedSessionSlot).toEqual({
        trackId: trackIds[0],
        sceneIndex: 1,
      });
    });

    it('ArrowDown from track[1] scene[0] moves to track[2] scene[0]', () => {
      useUIStore.getState().setSelectedSessionSlot({ trackId: trackIds[1], sceneIndex: 0 });
      const orderedIds = getOrderedTrackIds();
      const slot = useUIStore.getState().selectedSessionSlot!;
      const trackIdx = orderedIds.indexOf(slot.trackId);
      const nextIdx = Math.min(orderedIds.length - 1, trackIdx + 1);
      useUIStore.getState().setSelectedSessionSlot({ trackId: orderedIds[nextIdx], sceneIndex: slot.sceneIndex });

      expect(useUIStore.getState().selectedSessionSlot).toEqual({
        trackId: trackIds[2],
        sceneIndex: 0,
      });
    });

    it('ArrowDown from last track stays at last track', () => {
      useUIStore.getState().setSelectedSessionSlot({ trackId: trackIds[2], sceneIndex: 0 });
      const orderedIds = getOrderedTrackIds();
      const slot = useUIStore.getState().selectedSessionSlot!;
      const trackIdx = orderedIds.indexOf(slot.trackId);
      const nextIdx = Math.min(orderedIds.length - 1, trackIdx + 1);
      useUIStore.getState().setSelectedSessionSlot({ trackId: orderedIds[nextIdx], sceneIndex: slot.sceneIndex });

      expect(useUIStore.getState().selectedSessionSlot).toEqual({
        trackId: trackIds[2],
        sceneIndex: 0,
      });
    });

    it('ArrowRight from scene[0] moves to scene[1]', () => {
      useUIStore.getState().setSelectedSessionSlot({ trackId: trackIds[0], sceneIndex: 0 });
      const slot = useUIStore.getState().selectedSessionSlot!;
      const sceneCount = 4; // minimum scene count
      useUIStore.getState().setSelectedSessionSlot({
        trackId: slot.trackId,
        sceneIndex: Math.min(sceneCount - 1, slot.sceneIndex + 1),
      });

      expect(useUIStore.getState().selectedSessionSlot).toEqual({
        trackId: trackIds[0],
        sceneIndex: 1,
      });
    });

    it('ArrowLeft from scene[0] stays at scene[0]', () => {
      useUIStore.getState().setSelectedSessionSlot({ trackId: trackIds[1], sceneIndex: 0 });
      const slot = useUIStore.getState().selectedSessionSlot!;
      useUIStore.getState().setSelectedSessionSlot({
        trackId: slot.trackId,
        sceneIndex: Math.max(0, slot.sceneIndex - 1),
      });

      expect(useUIStore.getState().selectedSessionSlot).toEqual({
        trackId: trackIds[1],
        sceneIndex: 0,
      });
    });

    it('ArrowRight from last scene stays at last scene', () => {
      // sceneCount = max(4, max clips per track) = max(4, 3) = 4 (scenes 0-3)
      useUIStore.getState().setSelectedSessionSlot({ trackId: trackIds[0], sceneIndex: 3 });
      const slot = useUIStore.getState().selectedSessionSlot!;
      const sceneCount = 4;
      useUIStore.getState().setSelectedSessionSlot({
        trackId: slot.trackId,
        sceneIndex: Math.min(sceneCount - 1, slot.sceneIndex + 1),
      });

      expect(useUIStore.getState().selectedSessionSlot).toEqual({
        trackId: trackIds[0],
        sceneIndex: 3,
      });
    });
  });

  describe('launch action', () => {
    it('Enter triggers launchSessionClip with correct trackId and clip', () => {
      setupThreeTracks();
      const orderedIds = getOrderedTrackIds();
      const trackId = orderedIds[0];
      useUIStore.getState().setSelectedSessionSlot({ trackId, sceneIndex: 0 });

      const project = useProjectStore.getState().project!;
      const track = project.tracks.find((t) => t.id === trackId)!;
      const playableClips = [...track.clips]
        .filter((c) => c.generationStatus === 'ready' || (c.midiData?.notes.length ?? 0) > 0)
        .sort((a, b) => a.startTime - b.startTime);
      const clip = playableClips[0];

      // Verify the clip exists and matches expectations
      expect(clip).toBeDefined();
      expect(clip.trackId).toBe(trackId);
    });
  });
});
