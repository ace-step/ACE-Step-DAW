import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';
import { useTransportStore } from '../../src/store/transportStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('session clip launch modes', () => {
  let trackId: string;
  let clipId: string;
  let sceneId: string;

  beforeEach(() => {
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });

    const store = useProjectStore.getState();
    const track = store.addTrack('drums');
    trackId = track.id;
    const clip = store.addClip(trackId, {
      startTime: 0,
      duration: 2,
      prompt: 'Kick groove',
      globalCaption: '',
      lyrics: '',
      source: 'uploaded',
    });
    clipId = clip.id;

    const session = useProjectStore.getState().project?.session;
    sceneId = session!.scenes[0].id;

    // Not playing — immediate launches
    useTransportStore.setState({ currentTime: 0, isPlaying: false });
  });

  describe('setSessionSlotLaunchMode', () => {
    it('sets the launch mode on a session slot', () => {
      const session = useProjectStore.getState().project?.session;
      const slot = session?.slots.find((s) => s.trackId === trackId && s.sceneId === sceneId);
      expect(slot).not.toBeUndefined();

      useProjectStore.getState().setSessionSlotLaunchMode(slot!.id, 'gate');

      const updated = useProjectStore.getState().project?.session?.slots.find((s) => s.id === slot!.id);
      expect(updated?.launchMode).toBe('gate');
    });

    it('supports undo after setting launch mode', () => {
      const session = useProjectStore.getState().project?.session;
      const slot = session?.slots.find((s) => s.trackId === trackId && s.sceneId === sceneId);

      useProjectStore.getState().setSessionSlotLaunchMode(slot!.id, 'toggle');
      expect(useProjectStore.getState().project?.session?.slots.find((s) => s.id === slot!.id)?.launchMode).toBe('toggle');

      useProjectStore.getState().undo();
      const afterUndo = useProjectStore.getState().project?.session?.slots.find((s) => s.id === slot!.id);
      // After undo, launchMode should be back to default (undefined or 'trigger')
      expect(afterUndo?.launchMode === undefined || afterUndo?.launchMode === 'trigger').toBe(true);
    });

    it('defaults to trigger when launchMode is not set', () => {
      const session = useProjectStore.getState().project?.session;
      const slot = session?.slots.find((s) => s.trackId === trackId && s.sceneId === sceneId);
      // Default slots should not have launchMode set (defaults to trigger behavior)
      expect(slot?.launchMode === undefined || slot?.launchMode === 'trigger').toBe(true);
    });
  });

  describe('toggle mode', () => {
    it('stops the clip when launching an already-active clip in toggle mode', () => {
      const session = useProjectStore.getState().project?.session;
      const slot = session?.slots.find((s) => s.trackId === trackId && s.sceneId === sceneId);
      useProjectStore.getState().setSessionSlotLaunchMode(slot!.id, 'toggle');

      // First launch — should activate
      useProjectStore.getState().launchSessionClip(trackId, sceneId);
      expect(useProjectStore.getState().project?.session?.activeClipIdsByTrackId[trackId]).toBe(clipId);

      // Second launch of same clip — should stop it
      useProjectStore.getState().launchSessionClip(trackId, sceneId);
      expect(useProjectStore.getState().project?.session?.activeClipIdsByTrackId[trackId]).toBeNull();
    });

    it('launches normally when clip is not active in toggle mode', () => {
      const session = useProjectStore.getState().project?.session;
      const slot = session?.slots.find((s) => s.trackId === trackId && s.sceneId === sceneId);
      useProjectStore.getState().setSessionSlotLaunchMode(slot!.id, 'toggle');

      useProjectStore.getState().launchSessionClip(trackId, sceneId);
      expect(useProjectStore.getState().project?.session?.activeClipIdsByTrackId[trackId]).toBe(clipId);
    });
  });

  describe('re-trigger stops active clip (all launch modes)', () => {
    it.each(['trigger', 'gate', 'toggle', 'repeat'] as const)(
      'stops the active clip on re-click in %s mode',
      (mode) => {
        const session = useProjectStore.getState().project?.session;
        const slot = session?.slots.find((s) => s.trackId === trackId && s.sceneId === sceneId);
        if (mode !== 'trigger') {
          useProjectStore.getState().setSessionSlotLaunchMode(slot!.id, mode);
        }

        // First launch
        useProjectStore.getState().launchSessionClip(trackId, sceneId);
        expect(useProjectStore.getState().project?.session?.activeClipIdsByTrackId[trackId]).toBe(clipId);

        // Re-click same clip — should stop
        useProjectStore.getState().launchSessionClip(trackId, sceneId);
        expect(useProjectStore.getState().project?.session?.activeClipIdsByTrackId[trackId]).toBeNull();
      },
    );
  });

  describe('trigger mode (default)', () => {
    it('stops the clip when re-triggering the same active clip', () => {
      // Launch once
      useProjectStore.getState().launchSessionClip(trackId, sceneId);
      expect(useProjectStore.getState().project?.session?.activeClipIdsByTrackId[trackId]).toBe(clipId);

      // Launch again — re-clicking an active clip always stops it (standard DAW toggle)
      useProjectStore.getState().launchSessionClip(trackId, sceneId);
      expect(useProjectStore.getState().project?.session?.activeClipIdsByTrackId[trackId]).toBeNull();
    });

    it('can re-launch a clip after stopping it via re-trigger', () => {
      // Launch → stop via retrigger → launch again
      useProjectStore.getState().launchSessionClip(trackId, sceneId);
      expect(useProjectStore.getState().project?.session?.activeClipIdsByTrackId[trackId]).toBe(clipId);

      useProjectStore.getState().launchSessionClip(trackId, sceneId);
      expect(useProjectStore.getState().project?.session?.activeClipIdsByTrackId[trackId]).toBeNull();

      // Third click should launch again
      useProjectStore.getState().launchSessionClip(trackId, sceneId);
      expect(useProjectStore.getState().project?.session?.activeClipIdsByTrackId[trackId]).toBe(clipId);
    });
  });

  describe('launch mode type on SessionClipSlot', () => {
    it('accepts all four valid launch mode values', () => {
      const session = useProjectStore.getState().project?.session;
      const slot = session?.slots.find((s) => s.trackId === trackId && s.sceneId === sceneId);

      for (const mode of ['trigger', 'gate', 'toggle', 'repeat'] as const) {
        useProjectStore.getState().setSessionSlotLaunchMode(slot!.id, mode);
        const updated = useProjectStore.getState().project?.session?.slots.find((s) => s.id === slot!.id);
        expect(updated?.launchMode).toBe(mode);
      }
    });
  });
});
