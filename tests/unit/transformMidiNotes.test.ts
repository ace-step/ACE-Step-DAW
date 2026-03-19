import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';

describe('projectStore.transformMidiNotes', () => {
  let clipId: string;
  const noteIds: string[] = [];

  beforeEach(() => {
    useProjectStore.getState().createProject({ name: 'Test', bpm: 120 });
    const track = useProjectStore.getState().addTrack('synth', 'pianoRoll');
    const clip = useProjectStore.getState().ensureMidiClip(track.id);
    clipId = clip.id;
    noteIds.length = 0;
    noteIds.push(
      useProjectStore.getState().addMidiNote(clipId, { pitch: 60, startBeat: 0, durationBeats: 1, velocity: 100 })!,
      useProjectStore.getState().addMidiNote(clipId, { pitch: 64, startBeat: 1, durationBeats: 1, velocity: 80 })!,
      useProjectStore.getState().addMidiNote(clipId, { pitch: 67, startBeat: 2, durationBeats: 1, velocity: 60 })!,
    );
  });

  function getNotes() {
    const project = useProjectStore.getState().project!;
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        if (clip.id === clipId && clip.midiData) return clip.midiData.notes;
      }
    }
    return [];
  }

  it('transposes selected notes only', () => {
    useProjectStore.getState().transformMidiNotes(clipId, [noteIds[0], noteIds[1]], {
      type: 'transpose',
      semitones: 12,
    });
    const notes = getNotes();
    const byId = Object.fromEntries(notes.map((n) => [n.id, n]));
    expect(byId[noteIds[0]].pitch).toBe(72);
    expect(byId[noteIds[1]].pitch).toBe(76);
    expect(byId[noteIds[2]].pitch).toBe(67); // unchanged
  });

  it('supports undo after transform', () => {
    const beforePitch = getNotes().find((n) => n.id === noteIds[0])!.pitch;
    useProjectStore.getState().transformMidiNotes(clipId, [noteIds[0]], {
      type: 'transpose',
      semitones: 5,
    });
    expect(getNotes().find((n) => n.id === noteIds[0])!.pitch).toBe(beforePitch + 5);
    useProjectStore.getState().undo();
    expect(getNotes().find((n) => n.id === noteIds[0])!.pitch).toBe(beforePitch);
  });

  it('applies legato transform', () => {
    useProjectStore.getState().transformMidiNotes(clipId, noteIds, { type: 'legato' });
    const notes = getNotes();
    const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat);
    expect(sorted[0].durationBeats).toBe(1); // gap to next = 1
    expect(sorted[1].durationBeats).toBe(1); // gap to next = 1
    expect(sorted[2].durationBeats).toBe(1); // last note unchanged
  });

  it('applies velocity scale transform', () => {
    useProjectStore.getState().transformMidiNotes(clipId, noteIds, {
      type: 'velocityScale',
      min: 20,
      max: 120,
    });
    const notes = getNotes();
    const velocities = notes.map((n) => n.velocity).sort((a, b) => a - b);
    expect(velocities[0]).toBe(20);
    expect(velocities[2]).toBe(120);
  });

  it('does nothing for non-existent clip', () => {
    // Should not throw or modify notes for a non-existent clip
    useProjectStore.getState().transformMidiNotes('nonexistent-clip', noteIds, { type: 'transpose', semitones: 1 });
    const notes = getNotes();
    expect(notes.find((n) => n.id === noteIds[0])!.pitch).toBe(60); // unchanged
  });
});
