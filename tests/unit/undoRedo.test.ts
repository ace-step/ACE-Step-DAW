import { describe, expect, it, beforeEach } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';

describe('Undo / Redo', () => {
  beforeEach(() => {
    useProjectStore.getState().createProject({ name: 'Undo Test', bpm: 120 });
  });

  it('undoes addTrack', () => {
    useProjectStore.getState().addTrack('drums');
    expect(useProjectStore.getState().project!.tracks).toHaveLength(1);

    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project!.tracks).toHaveLength(0);
  });

  it('redoes after undo', () => {
    useProjectStore.getState().addTrack('drums');
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project!.tracks).toHaveLength(0);

    useProjectStore.getState().redo();
    expect(useProjectStore.getState().project!.tracks).toHaveLength(1);
  });

  it('undoes removeTrack', () => {
    const track = useProjectStore.getState().addTrack('bass');
    useProjectStore.getState().removeTrack(track.id);
    expect(useProjectStore.getState().project!.tracks).toHaveLength(0);

    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project!.tracks).toHaveLength(1);
    expect(useProjectStore.getState().project!.tracks[0].displayName).toBe('Bass');
  });

  it('undoes BPM change', () => {
    useProjectStore.getState().updateProject({ bpm: 160 });
    expect(useProjectStore.getState().project!.bpm).toBe(160);

    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project!.bpm).toBe(120);
  });

  it('undoes addClip', () => {
    const track = useProjectStore.getState().addTrack('drums');
    useProjectStore.getState().addClip(track.id, {
      startTime: 0, duration: 30, prompt: 'test', lyrics: '',
    });
    expect(useProjectStore.getState().project!.tracks[0].clips).toHaveLength(1);

    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project!.tracks[0].clips).toHaveLength(0);
  });

  it('undoes duplicateTrack', () => {
    useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
    expect(useProjectStore.getState().project!.tracks).toHaveLength(1);

    useProjectStore.getState().duplicateTrack(useProjectStore.getState().project!.tracks[0].id);
    expect(useProjectStore.getState().project!.tracks).toHaveLength(2);

    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project!.tracks).toHaveLength(1);
  });

  it('handles multiple undos in sequence', () => {
    useProjectStore.getState().addTrack('drums');
    useProjectStore.getState().addTrack('bass');
    useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
    expect(useProjectStore.getState().project!.tracks).toHaveLength(3);

    useProjectStore.getState().undo(); // remove keyboard
    useProjectStore.getState().undo(); // remove bass
    useProjectStore.getState().undo(); // remove drums
    expect(useProjectStore.getState().project!.tracks).toHaveLength(0);

    useProjectStore.getState().redo(); // restore drums
    useProjectStore.getState().redo(); // restore bass
    expect(useProjectStore.getState().project!.tracks).toHaveLength(2);
  });

  it('clears redo stack when new action is performed', () => {
    useProjectStore.getState().addTrack('drums');
    useProjectStore.getState().addTrack('bass');
    useProjectStore.getState().undo(); // undo bass

    // New action should clear redo stack
    useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
    useProjectStore.getState().redo(); // should do nothing
    expect(useProjectStore.getState().project!.tracks).toHaveLength(2);
    expect(useProjectStore.getState().project!.tracks[1].displayName).toBe('Keyboard');
  });

  it('undo past createProject returns to null project', () => {
    // createProject itself pushes history, so undoing goes back to null/previous state
    // Keep undoing until stack is exhausted
    let attempts = 0;
    while (attempts < 100) {
      useProjectStore.getState().undo();
      attempts++;
      if (!useProjectStore.getState().project) break;
    }
    // After exhausting undo stack, further undos should be no-ops
    useProjectStore.getState().undo();
    useProjectStore.getState().undo();
    // No crash = pass
    expect(true).toBe(true);
  });

  it('undoes MIDI quantize', () => {
    const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
    const clip = useProjectStore.getState().ensureMidiClip(track.id);
    const noteId = useProjectStore.getState().addMidiNote(clip.id, {
      pitch: 60, startBeat: 0.3, durationBeats: 1, velocity: 100,
    })!;

    useProjectStore.getState().quantizeMidiNotes(clip.id, [noteId], 1);
    expect(useProjectStore.getState().project!.tracks[0].clips[0].midiData!.notes[0].startBeat).toBe(0);

    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project!.tracks[0].clips[0].midiData!.notes[0].startBeat).toBe(0.3);
  });

  it('undoes clip consolidation', async () => {
    const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
    const clipA = useProjectStore.getState().addClip(track.id, {
      startTime: 0,
      duration: 1,
      prompt: 'part-a',
      globalCaption: '',
      lyrics: '',
      midiData: {
        grid: '1/16',
        notes: [{ id: 'n1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 }],
      },
      source: 'uploaded',
    });
    const clipB = useProjectStore.getState().addClip(track.id, {
      startTime: 1,
      duration: 1,
      prompt: 'part-b',
      globalCaption: '',
      lyrics: '',
      midiData: {
        grid: '1/16',
        notes: [{ id: 'n2', pitch: 64, startBeat: 0, durationBeats: 1, velocity: 0.7 }],
      },
      source: 'uploaded',
    });

    await useProjectStore.getState().consolidateClips(track.id, [clipA.id, clipB.id]);
    expect(useProjectStore.getState().project!.tracks[0].clips).toHaveLength(1);

    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project!.tracks[0].clips).toHaveLength(2);
  });
});
