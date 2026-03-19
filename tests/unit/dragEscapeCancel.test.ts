import { describe, expect, it, beforeEach } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';

/**
 * Tests for drag-cancel-with-Escape behavior.
 *
 * The pattern used by all drag operations:
 *   beginDrag() → modify state → [Escape pressed] → endDrag() → undo()
 *
 * This should restore the project to its pre-drag state without leaving
 * a stale history entry.
 */

function store() {
  return useProjectStore.getState();
}

describe('drag Escape cancel restores state via beginDrag/endDrag/undo', () => {
  let trackId: string;
  let clipId: string;

  beforeEach(() => {
    store().createProject({ name: 'Test', bpm: 120 });
    const track = store().addTrack('vocals');
    trackId = track.id;
    const clip = store().addClip(trackId, {
      startTime: 2,
      duration: 4,
      prompt: 'test',
    });
    clipId = clip.id;
  });

  it('restores clip startTime after cancelled move drag', () => {
    const origStart = store().project!.tracks[0].clips[0].startTime;

    store().beginDrag();
    store().updateClip(clipId, { startTime: 10 });
    expect(store().project!.tracks[0].clips[0].startTime).toBe(10);

    // Cancel: endDrag + undo restores
    store().endDrag();
    store().undo();

    expect(store().project!.tracks[0].clips[0].startTime).toBe(origStart);
  });

  it('restores clip duration after cancelled resize-right drag', () => {
    const origDuration = store().project!.tracks[0].clips[0].duration;

    store().beginDrag();
    store().updateClip(clipId, { duration: 20 });
    expect(store().project!.tracks[0].clips[0].duration).toBe(20);

    store().endDrag();
    store().undo();

    expect(store().project!.tracks[0].clips[0].duration).toBe(origDuration);
  });

  it('restores clip startTime and duration after cancelled resize-left drag', () => {
    const origStart = store().project!.tracks[0].clips[0].startTime;
    const origDuration = store().project!.tracks[0].clips[0].duration;

    store().beginDrag();
    store().updateClip(clipId, { startTime: 1, duration: origDuration + (origStart - 1) });

    store().endDrag();
    store().undo();

    const restored = store().project!.tracks[0].clips[0];
    expect(restored.startTime).toBe(origStart);
    expect(restored.duration).toBe(origDuration);
  });

  it('restores track laneHeight after cancelled lane resize', () => {
    const origHeight = store().project!.tracks[0].laneHeight ?? 64;

    store().updateTrack(trackId, { laneHeight: 200 });
    expect(store().project!.tracks[0].laneHeight).toBe(200);

    store().undo();
    expect(store().project!.tracks[0].laneHeight ?? 64).toBe(origHeight);
  });

  it('does not leave a spurious history entry after cancel', () => {
    const historyBefore = store().getUndoHistory().length;

    store().beginDrag();
    store().updateClip(clipId, { startTime: 99 });
    store().endDrag();
    store().undo();

    const historyAfter = store().getUndoHistory().length;
    expect(historyAfter).toBe(historyBefore);
  });

  it('restores tempo event BPM after cancelled tempo point drag', () => {
    store().addTempoEvent({ beat: 4, bpm: 140 });
    const origBpm = store().project!.tempoMap![0].bpm;

    store().beginDrag();
    store().updateTempoEvent(4, { bpm: 200 });
    expect(store().project!.tempoMap![0].bpm).toBe(200);

    store().endDrag();
    store().undo();

    expect(store().project!.tempoMap![0].bpm).toBe(origBpm);
  });

  it('restores gain envelope point after cancelled envelope drag', () => {
    store().addClipGainPoint(clipId, { time: 1, gain: 0.8 });
    const origGain = store().project!.tracks[0].clips[0].gainEnvelope![0].gain;

    store().beginDrag();
    store().updateClipGainPoint(clipId, 0, { gain: 1.5 });
    expect(store().project!.tracks[0].clips[0].gainEnvelope![0].gain).toBe(1.5);

    store().endDrag();
    store().undo();

    expect(store().project!.tracks[0].clips[0].gainEnvelope![0].gain).toBe(origGain);
  });

  it('restores MIDI note position after cancelled piano roll drag', () => {
    store().addTrack('custom', 'pianoRoll');
    const prTrack = store().project!.tracks[1];
    const prClip = store().ensureMidiClip(prTrack.id, 0, 4);
    store().addMidiNote(prClip.id, {
      id: 'note-1',
      pitch: 60,
      startBeat: 0,
      durationBeats: 1,
      velocity: 100,
    });

    expect(store().project!.tracks[1].clips[0].midiData!.notes[0].pitch).toBe(60);

    store().beginDrag();
    store().updateMidiNote(prClip.id, 'note-1', { pitch: 72, startBeat: 4 });
    expect(store().project!.tracks[1].clips[0].midiData!.notes[0].pitch).toBe(72);

    store().endDrag();
    store().undo();

    const restored = store().project!.tracks[1].clips[0].midiData!.notes[0];
    expect(restored.pitch).toBe(60);
    expect(restored.startBeat).toBe(0);
  });
});
