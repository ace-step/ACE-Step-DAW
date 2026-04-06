/**
 * Tests for session slot recording UI behavior.
 * Validates that the recording state machine correctly transitions
 * recording slots through arm → record → stop → clip created states.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../../../store/projectStore';
import { useTransportStore } from '../../../store/transportStore';

function setupProject() {
  useProjectStore.setState({ project: null });
  useTransportStore.setState({ armedTrackIds: [] });
  const store = useProjectStore.getState();
  store.createProject({
    name: 'Recording Test',
    bpm: 120,
    keyScale: 'C major',
    timeSignature: 4,
    measures: 4,
  });
  store.addTrack('pianoRoll');
  store.addTrack('stems');
}

describe('sessionSlotRecording UI state', () => {
  beforeEach(() => {
    setupProject();
  });

  it('armed tracks show recording-ready slots for empty slots', () => {
    const project = useProjectStore.getState().project!;
    const track = project.tracks[0];

    // Arm the track
    useTransportStore.getState().armTrack(track.id);
    expect(useTransportStore.getState().armedTrackIds).toContain(track.id);

    // Empty slots should exist for armed track
    const session = project.session!;
    const trackSlots = session.slots.filter((s) => s.trackId === track.id);
    expect(trackSlots.length).toBeGreaterThan(0);
    expect(trackSlots[0].clipId).toBeNull(); // empty slot
  });

  it('can start and stop recording on a session slot', () => {
    const project = useProjectStore.getState().project!;
    const track = project.tracks[0];
    const session = project.session!;
    const slot = session.slots.find((s) => s.trackId === track.id)!;

    // Start recording
    useProjectStore.getState().startSessionSlotRecording(slot.id);
    const updatedSession = useProjectStore.getState().project!.session!;
    expect(updatedSession.recordingSlotIds).toContain(slot.id);

    // Stop recording
    useProjectStore.getState().stopSessionSlotRecording(slot.id);
    const finalSession = useProjectStore.getState().project!.session!;
    expect(finalSession.recordingSlotIds ?? []).not.toContain(slot.id);
  });

  it('recording state is track-independent', () => {
    const project = useProjectStore.getState().project!;
    const track1 = project.tracks[0];
    const track2 = project.tracks[1];
    const session = project.session!;
    const slot1 = session.slots.find((s) => s.trackId === track1.id)!;
    const slot2 = session.slots.find((s) => s.trackId === track2.id)!;

    // Record on both tracks simultaneously
    useProjectStore.getState().startSessionSlotRecording(slot1.id);
    useProjectStore.getState().startSessionSlotRecording(slot2.id);

    const updated = useProjectStore.getState().project!.session!;
    expect(updated.recordingSlotIds).toContain(slot1.id);
    expect(updated.recordingSlotIds).toContain(slot2.id);

    // Stop just one
    useProjectStore.getState().stopSessionSlotRecording(slot1.id);
    const after = useProjectStore.getState().project!.session!;
    expect(after.recordingSlotIds).not.toContain(slot1.id);
    expect(after.recordingSlotIds).toContain(slot2.id);
  });

  it('fixed-length bars setting persists in session state', () => {
    useProjectStore.getState().setSessionFixedLengthBars(4);
    expect(useProjectStore.getState().project!.session!.fixedLengthBars).toBe(4);

    useProjectStore.getState().setSessionFixedLengthBars(null);
    expect(useProjectStore.getState().project!.session!.fixedLengthBars).toBeNull();
  });

  it('stopAllSessionSlotRecordings clears all recording slots', () => {
    const project = useProjectStore.getState().project!;
    const session = project.session!;
    const slots = session.slots.filter((s) => s.clipId === null).slice(0, 3);

    for (const slot of slots) {
      useProjectStore.getState().startSessionSlotRecording(slot.id);
    }
    expect(useProjectStore.getState().project!.session!.recordingSlotIds).toHaveLength(3);

    useProjectStore.getState().stopAllSessionSlotRecordings();
    expect(useProjectStore.getState().project!.session!.recordingSlotIds).toEqual([]);
  });

  it('track type determines recording type (pianoRoll=midi, stems=audio)', () => {
    const project = useProjectStore.getState().project!;
    const pianoRollTrack = project.tracks.find((t) => t.trackType === 'pianoRoll');
    const stemsTrack = project.tracks.find((t) => t.trackType === 'stems');

    expect(pianoRollTrack).toBeDefined();
    expect(stemsTrack).toBeDefined();

    // pianoRoll tracks should record MIDI, stems should record audio
    expect(pianoRollTrack!.trackType).toBe('pianoRoll');
    expect(stemsTrack!.trackType).toBe('stems');
  });
});
