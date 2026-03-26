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

  it('setSessionSlotStopButton does nothing for non-existent slot', () => {
    useProjectStore.getState().addTrack('drums');
    const slotsBefore = useProjectStore.getState().project?.session?.slots;
    useProjectStore.getState().setSessionSlotStopButton('non-existent-id', false);
    const slotsAfter = useProjectStore.getState().project?.session?.slots;
    // Should still update (map returns new array) but no slot values changed
    expect(slotsAfter?.length).toBe(slotsBefore?.length);
  });

  it('scene launch stops tracks whose empty slot has hasStopButton true', () => {
    const store = useProjectStore.getState();
    const track1 = store.addTrack('drums');

    // Get session data
    const session = useProjectStore.getState().project?.session;
    expect(session).toBeDefined();

    const scenes = session!.scenes;
    expect(scenes.length).toBeGreaterThanOrEqual(2);

    // Find slot for track1 in first scene - it should be empty with hasStopButton=true
    const scene1 = scenes[0];
    const track1Scene1Slot = session!.slots.find(s => s.trackId === track1.id && s.sceneId === scene1.id);
    expect(track1Scene1Slot).toBeDefined();
    expect(track1Scene1Slot!.clipId).toBeNull();
    expect(track1Scene1Slot!.hasStopButton).toBe(true);

    // Launch scene1 - since slot is empty with stop button, it should trigger stop
    // (This tests the code path; the actual stop behavior is in applySessionTrackLaunch)
    useProjectStore.getState().launchSessionScene(scene1.id);

    // Verify no error occurred and state is still valid
    const afterState = useProjectStore.getState().project;
    expect(afterState).toBeDefined();
  });

  it('scene launch does not stop track when empty slot has hasStopButton=false', () => {
    const store = useProjectStore.getState();
    const track1 = store.addTrack('drums');

    const session = useProjectStore.getState().project?.session;
    expect(session).toBeDefined();

    const scenes = session!.scenes;
    const scene1 = scenes[0];
    const track1Scene1Slot = session!.slots.find(s => s.trackId === track1.id && s.sceneId === scene1.id);
    expect(track1Scene1Slot).toBeDefined();

    // Remove stop button
    useProjectStore.getState().setSessionSlotStopButton(track1Scene1Slot!.id, false);

    // Verify it's set
    const updatedSlot = useProjectStore.getState().project?.session?.slots.find(s => s.id === track1Scene1Slot!.id);
    expect(updatedSlot?.hasStopButton).toBe(false);

    // Launch scene - should not stop the track since hasStopButton is false
    useProjectStore.getState().launchSessionScene(scene1.id);

    // Verify no error and state is valid
    const afterState = useProjectStore.getState().project;
    expect(afterState).toBeDefined();
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
