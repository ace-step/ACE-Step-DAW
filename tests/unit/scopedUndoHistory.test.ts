import { beforeEach, describe, expect, it } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';

describe('Scoped undo history', () => {
  beforeEach(() => {
    useProjectStore.getState().createProject({ name: 'Scoped Undo Test', bpm: 120 });
    useUIStore.setState({
      historyFocusScope: 'arrangement',
      openPianoRollTrackId: null,
      openPianoRollClipId: null,
      openSequencerTrackId: null,
      openDrumMachineTrackId: null,
      openEffectChainTrackId: null,
      openMidiEffectChainTrackId: null,
      showUndoHistoryPanel: false,
      activeBottomPanel: null,
    });
  });

  it('stores MIDI edits in the piano roll scope', () => {
    const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
    const clip = useProjectStore.getState().ensureMidiClip(track.id);

    useProjectStore.getState().addMidiNote(clip.id, {
      pitch: 60,
      startBeat: 0,
      durationBeats: 1,
      velocity: 96,
    });

    const history = useProjectStore.getState().getUndoHistory('pianoRoll');
    expect(history).toHaveLength(1);
    expect(history[0].scope).toBe('pianoRoll');
    expect(history[0].label).toBe('Add MIDI note');
    expect(history[0].clipId).toBe(clip.id);
  });

  it('undoes only the requested scope', () => {
    const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
    const clip = useProjectStore.getState().ensureMidiClip(track.id);

    useProjectStore.getState().addMidiNote(clip.id, {
      pitch: 60,
      startBeat: 0,
      durationBeats: 1,
      velocity: 96,
    });

    expect(useProjectStore.getState().project!.tracks).toHaveLength(1);
    expect(useProjectStore.getState().project!.tracks[0].clips[0].midiData!.notes).toHaveLength(1);

    useProjectStore.getState().undo('pianoRoll');

    expect(useProjectStore.getState().project!.tracks).toHaveLength(1);
    expect(useProjectStore.getState().project!.tracks[0].clips[0].midiData!.notes).toHaveLength(0);
    expect(useProjectStore.getState().getRedoHistory('pianoRoll')).toHaveLength(1);
  });

  it('can jump to a named history entry within a scope', () => {
    const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
    const clip = useProjectStore.getState().ensureMidiClip(track.id);

    useProjectStore.getState().addMidiNote(clip.id, {
      pitch: 60,
      startBeat: 0,
      durationBeats: 1,
      velocity: 96,
    });
    useProjectStore.getState().addMidiNote(clip.id, {
      pitch: 64,
      startBeat: 1,
      durationBeats: 1,
      velocity: 96,
    });

    const history = useProjectStore.getState().getUndoHistory('pianoRoll');
    const oneNoteState = history[history.length - 1];
    useProjectStore.getState().jumpToHistoryEntry(oneNoteState.id, 'pianoRoll');

    const notes = useProjectStore.getState().project!.tracks[0].clips[0].midiData!.notes;
    expect(notes).toHaveLength(1);
    expect(notes[0].pitch).toBe(60);

    useProjectStore.getState().redo('pianoRoll');
    expect(useProjectStore.getState().project!.tracks[0].clips[0].midiData!.notes).toHaveLength(2);
  });

  it('updates history focus when the piano roll opens', () => {
    useUIStore.getState().setOpenPianoRoll('track-1', 'clip-1');
    expect(useUIStore.getState().historyFocusScope).toBe('pianoRoll');
  });
});
