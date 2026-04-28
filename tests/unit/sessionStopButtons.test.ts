import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';
import { useTransportStore } from '../../src/store/transportStore';

vi.mock('../../src/services/projectStorage', () => ({ saveProject: vi.fn() }));

describe('session empty slot stop buttons', () => {
  beforeEach(() => {
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });
  });

  it('new slots have hasStopButton true by default', () => {
    const track = useProjectStore.getState().addTrack('drums');
    const session = useProjectStore.getState().project?.session;
    const slot = session?.slots.find(s => s.trackId === track.id);
    expect(slot?.hasStopButton).toBe(true);
  });

  it('setSessionSlotStopButton toggles the stop button', () => {
    const track = useProjectStore.getState().addTrack('drums');
    const session = useProjectStore.getState().project?.session;
    const slot = session?.slots.find(s => s.trackId === track.id);

    useProjectStore.getState().setSessionSlotStopButton(slot!.id, false);
    const updated = useProjectStore.getState().project?.session?.slots.find(s => s.id === slot!.id);
    expect(updated?.hasStopButton).toBe(false);

    useProjectStore.getState().setSessionSlotStopButton(slot!.id, true);
    const restored = useProjectStore.getState().project?.session?.slots.find(s => s.id === slot!.id);
    expect(restored?.hasStopButton).toBe(true);
  });

  it('setSessionSlotStopButton is a no-op for non-existent slot IDs', () => {
    useProjectStore.getState().addTrack('drums');
    const updatedAtBefore = useProjectStore.getState().project?.updatedAt;
    const slotsBefore = useProjectStore.getState().project?.session?.slots;
    useProjectStore.getState().setSessionSlotStopButton('non-existent-id', false);
    const updatedAtAfter = useProjectStore.getState().project?.updatedAt;
    const slotsAfter = useProjectStore.getState().project?.session?.slots;
    // Early-return: no history push, no updatedAt change, slots unchanged
    expect(updatedAtAfter).toBe(updatedAtBefore);
    expect(slotsAfter).toBe(slotsBefore);
  });

  it('scene launch stops tracks whose empty slot has hasStopButton true', () => {
    const store = useProjectStore.getState();
    const track1 = store.addTrack('drums');

    const session = useProjectStore.getState().project?.session;
    expect(session).not.toBeUndefined();

    const scenes = session!.scenes;
    expect(scenes.length).toBeGreaterThanOrEqual(2);

    const scene1 = scenes[0];
    const track1Scene1Slot = session!.slots.find(s => s.trackId === track1.id && s.sceneId === scene1.id);
    expect(track1Scene1Slot).not.toBeUndefined();
    expect(track1Scene1Slot!.clipId).toBeNull();
    expect(track1Scene1Slot!.hasStopButton).toBe(true);

    // Pre-set an active clip on the track to simulate a playing clip
    const fakeClipId = 'fake-active-clip';
    useProjectStore.setState((prev) => ({
      project: {
        ...prev.project!,
        session: {
          ...prev.project!.session!,
          activeClipIdsByTrackId: {
            ...prev.project!.session!.activeClipIdsByTrackId,
            [track1.id]: fakeClipId,
          },
        },
      },
    }));
    expect(useProjectStore.getState().project?.session?.activeClipIdsByTrackId[track1.id]).toBe(fakeClipId);

    // Launch scene1 - empty slot with hasStopButton=true should stop the track
    useProjectStore.getState().launchSessionScene(scene1.id);

    // Assert the track was stopped (activeClipId set to null)
    const afterActive = useProjectStore.getState().project?.session?.activeClipIdsByTrackId[track1.id];
    expect(afterActive).toBeNull();
  });

  it('scene launch does not stop track when empty slot has hasStopButton=false', () => {
    const store = useProjectStore.getState();
    const track1 = store.addTrack('drums');

    const session = useProjectStore.getState().project?.session;
    expect(session).not.toBeUndefined();

    const scenes = session!.scenes;
    const scene1 = scenes[0];
    const track1Scene1Slot = session!.slots.find(s => s.trackId === track1.id && s.sceneId === scene1.id);
    expect(track1Scene1Slot).not.toBeUndefined();

    // Remove stop button
    useProjectStore.getState().setSessionSlotStopButton(track1Scene1Slot!.id, false);
    const updatedSlot = useProjectStore.getState().project?.session?.slots.find(s => s.id === track1Scene1Slot!.id);
    expect(updatedSlot?.hasStopButton).toBe(false);

    // Pre-set an active clip on the track to simulate a playing clip
    const fakeClipId = 'fake-active-clip';
    useProjectStore.setState((prev) => ({
      project: {
        ...prev.project!,
        session: {
          ...prev.project!.session!,
          activeClipIdsByTrackId: {
            ...prev.project!.session!.activeClipIdsByTrackId,
            [track1.id]: fakeClipId,
          },
        },
      },
    }));
    expect(useProjectStore.getState().project?.session?.activeClipIdsByTrackId[track1.id]).toBe(fakeClipId);

    // Launch scene - should NOT stop the track since hasStopButton is false
    useProjectStore.getState().launchSessionScene(scene1.id);

    // Assert the track is still active (not stopped)
    const afterActive = useProjectStore.getState().project?.session?.activeClipIdsByTrackId[track1.id];
    expect(afterActive).toBe(fakeClipId);
  });

  it('all slots for a new track are created with hasStopButton true', () => {
    const track = useProjectStore.getState().addTrack('bass');
    const session = useProjectStore.getState().project?.session;
    const trackSlots = session?.slots.filter(s => s.trackId === track.id) ?? [];

    expect(trackSlots.length).toBeGreaterThan(0);
    for (const slot of trackSlots) {
      expect(slot.hasStopButton).toBe(true);
    }
  });
});
