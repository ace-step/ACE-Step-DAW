import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';
import { useTransportStore } from '../../src/store/transportStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('follow actions store', () => {
  beforeEach(() => {
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });
  });

  function addTrackWithClips(count: number) {
    const store = useProjectStore.getState();
    const track = store.addTrack('drums');
    const clips = [];
    for (let i = 0; i < count; i++) {
      const clip = store.addClip(track.id, {
        startTime: i * 4,
        duration: 4,
        prompt: `Clip ${i + 1}`,
        globalCaption: '',
        lyrics: '',
        source: 'uploaded',
      });
      clips.push(clip);
    }
    return { track, clips };
  }

  describe('setSessionSlotFollowAction', () => {
    it('sets follow action on a slot with defaults', () => {
      const { track } = addTrackWithClips(2);
      const session = useProjectStore.getState().project!.session!;
      const slot = session.slots.find((s) => s.trackId === track.id && s.clipId !== null);
      expect(slot).toBeDefined();

      useProjectStore.getState().setSessionSlotFollowAction(slot!.id, { actionA: 'next' });
      const updatedSession = useProjectStore.getState().project!.session!;
      const updatedSlot = updatedSession.slots.find((s) => s.id === slot!.id);
      expect(updatedSlot?.followAction).toMatchObject({
        actionA: 'next',
        actionB: 'stop',
        chanceA: 1,
        time: 4,
        enabled: true,
      });
    });

    it('merges partial config with existing follow action', () => {
      const { track } = addTrackWithClips(1);
      const session = useProjectStore.getState().project!.session!;
      const slot = session.slots.find((s) => s.trackId === track.id && s.clipId !== null)!;

      useProjectStore.getState().setSessionSlotFollowAction(slot.id, { actionA: 'next', chanceA: 0.7 });
      useProjectStore.getState().setSessionSlotFollowAction(slot.id, { actionB: 'again' });

      const updatedSlot = useProjectStore.getState().project!.session!.slots.find((s) => s.id === slot.id);
      expect(updatedSlot?.followAction).toMatchObject({
        actionA: 'next',
        actionB: 'again',
        chanceA: 0.7,
      });
    });

    it('is a no-op for invalid slot id', () => {
      addTrackWithClips(1);
      const before = useProjectStore.getState().project!.session!;
      useProjectStore.getState().setSessionSlotFollowAction('nonexistent', { actionA: 'stop' });
      const after = useProjectStore.getState().project!.session!;
      expect(after.slots).toEqual(before.slots);
    });
  });

  describe('setSessionFollowActionsEnabled', () => {
    it('toggles global follow actions enabled', () => {
      addTrackWithClips(1);
      // Default is true (undefined means true)
      expect(useProjectStore.getState().project!.session!.followActionsEnabled).toBeUndefined();

      useProjectStore.getState().setSessionFollowActionsEnabled(false);
      expect(useProjectStore.getState().project!.session!.followActionsEnabled).toBe(false);

      useProjectStore.getState().setSessionFollowActionsEnabled(true);
      expect(useProjectStore.getState().project!.session!.followActionsEnabled).toBe(true);
    });
  });

  describe('scheduleFollowAction', () => {
    it('queues a pending follow-action launch', () => {
      const { track, clips } = addTrackWithClips(3);
      const session = useProjectStore.getState().project!.session!;
      const slot = session.slots.find((s) => s.trackId === track.id && s.clipId === clips[0].id)!;

      // Configure follow action on first slot: always go to next
      useProjectStore.getState().setSessionSlotFollowAction(slot.id, {
        actionA: 'next',
        actionB: 'next',
        chanceA: 1,
        time: 4,
        enabled: true,
      });

      useProjectStore.getState().scheduleFollowAction(track.id, slot.id, 0);

      const pending = useProjectStore.getState().project!.session!.pendingLaunches;
      expect(pending).toHaveLength(1);
      expect(pending[0].type).toBe('follow-action');
      expect(pending[0].trackId).toBe(track.id);
      expect(pending[0].clipId).toBe(clips[1].id); // next clip
      // At 120 BPM, 4 beats = 2 seconds
      expect(pending[0].executeAt).toBeCloseTo(2, 5);
    });

    it('does not schedule when follow action is disabled on slot', () => {
      const { track, clips } = addTrackWithClips(2);
      const session = useProjectStore.getState().project!.session!;
      const slot = session.slots.find((s) => s.trackId === track.id && s.clipId === clips[0].id)!;

      useProjectStore.getState().setSessionSlotFollowAction(slot.id, {
        actionA: 'next',
        enabled: false,
      });

      useProjectStore.getState().scheduleFollowAction(track.id, slot.id, 0);
      const pending = useProjectStore.getState().project!.session!.pendingLaunches;
      expect(pending).toHaveLength(0);
    });

    it('does not schedule when global follow actions are disabled', () => {
      const { track, clips } = addTrackWithClips(2);
      const session = useProjectStore.getState().project!.session!;
      const slot = session.slots.find((s) => s.trackId === track.id && s.clipId === clips[0].id)!;

      useProjectStore.getState().setSessionSlotFollowAction(slot.id, {
        actionA: 'next',
        enabled: true,
      });
      useProjectStore.getState().setSessionFollowActionsEnabled(false);

      useProjectStore.getState().scheduleFollowAction(track.id, slot.id, 0);
      const pending = useProjectStore.getState().project!.session!.pendingLaunches;
      expect(pending).toHaveLength(0);
    });

    it('schedules a stop when follow action resolves to stop', () => {
      const { track, clips } = addTrackWithClips(2);
      const session = useProjectStore.getState().project!.session!;
      const slot = session.slots.find((s) => s.trackId === track.id && s.clipId === clips[0].id)!;

      useProjectStore.getState().setSessionSlotFollowAction(slot.id, {
        actionA: 'stop',
        actionB: 'stop',
        chanceA: 1,
        time: 4,
        enabled: true,
      });

      useProjectStore.getState().scheduleFollowAction(track.id, slot.id, 0);
      const pending = useProjectStore.getState().project!.session!.pendingLaunches;
      expect(pending).toHaveLength(1);
      expect(pending[0].type).toBe('follow-action');
      expect(pending[0].clipId).toBeNull();
    });

    it('commitPendingSessionLaunches processes follow-action launches', () => {
      const { track, clips } = addTrackWithClips(3);
      const session = useProjectStore.getState().project!.session!;
      const slot = session.slots.find((s) => s.trackId === track.id && s.clipId === clips[0].id)!;

      // Set up follow action: next
      useProjectStore.getState().setSessionSlotFollowAction(slot.id, {
        actionA: 'next',
        actionB: 'next',
        chanceA: 1,
        time: 4,
        enabled: true,
      });

      // Schedule follow action
      useProjectStore.getState().scheduleFollowAction(track.id, slot.id, 0);

      // Commit at the right time (2 seconds at 120bpm)
      useProjectStore.getState().commitPendingSessionLaunches(2);

      const nextSession = useProjectStore.getState().project!.session!;
      expect(nextSession.pendingLaunches).toHaveLength(0);
      expect(nextSession.activeClipIdsByTrackId[track.id]).toBe(clips[1].id);
    });
  });
});
