/**
 * Tests for session slot recording store actions.
 * Validates startSessionSlotRecording, stopSessionSlotRecording,
 * stopAllSessionSlotRecordings, and setSessionFixedLengthBars.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../projectStore';

function resetWithProject() {
  useProjectStore.setState({ project: null });
  const store = useProjectStore.getState();
  // Create a minimal project
  store.createProject({
    name: 'Test Project',
    bpm: 120,
    keyScale: 'C major',
    timeSignature: 4,
    measures: 4,
  });
  const project = useProjectStore.getState().project!;
  // Add tracks to populate session
  store.addTrack('pianoRoll');
  store.addTrack('stems');
}

describe('sessionSlotRecording store actions', () => {
  beforeEach(() => {
    resetWithProject();
  });

  it('starts recording on a session slot', () => {
    const state = useProjectStore.getState();
    const session = state.project!.session!;
    const slot = session.slots[0];
    state.startSessionSlotRecording(slot.id);

    const updated = useProjectStore.getState().project!.session!;
    expect(updated.recordingSlotIds).toContain(slot.id);
  });

  it('does not duplicate when starting recording on already-recording slot', () => {
    const state = useProjectStore.getState();
    const slot = state.project!.session!.slots[0];
    state.startSessionSlotRecording(slot.id);
    state.startSessionSlotRecording(slot.id);

    const updated = useProjectStore.getState().project!.session!;
    expect(updated.recordingSlotIds!.filter((id) => id === slot.id)).toHaveLength(1);
  });

  it('stops recording on a session slot', () => {
    const state = useProjectStore.getState();
    const slot = state.project!.session!.slots[0];
    state.startSessionSlotRecording(slot.id);
    state.stopSessionSlotRecording(slot.id);

    const updated = useProjectStore.getState().project!.session!;
    expect(updated.recordingSlotIds ?? []).not.toContain(slot.id);
  });

  it('stops all session slot recordings', () => {
    const state = useProjectStore.getState();
    const session = state.project!.session!;
    const slot1 = session.slots[0];
    const slot2 = session.slots[1];
    state.startSessionSlotRecording(slot1.id);
    state.startSessionSlotRecording(slot2.id);
    state.stopAllSessionSlotRecordings();

    const updated = useProjectStore.getState().project!.session!;
    expect(updated.recordingSlotIds ?? []).toEqual([]);
  });

  it('sets fixed-length bars for session recording', () => {
    const state = useProjectStore.getState();
    state.setSessionFixedLengthBars(4);

    const updated = useProjectStore.getState().project!.session!;
    expect(updated.fixedLengthBars).toBe(4);
  });

  it('clears fixed-length bars with null', () => {
    const state = useProjectStore.getState();
    state.setSessionFixedLengthBars(4);
    state.setSessionFixedLengthBars(null);

    const updated = useProjectStore.getState().project!.session!;
    expect(updated.fixedLengthBars).toBeNull();
  });

  it('no-ops stopSessionSlotRecording when slot is not recording', () => {
    const stateBefore = useProjectStore.getState().project!.updatedAt;
    useProjectStore.getState().stopSessionSlotRecording('nonexistent-slot');
    const stateAfter = useProjectStore.getState().project!.updatedAt;
    expect(stateAfter).toBe(stateBefore);
  });
});
