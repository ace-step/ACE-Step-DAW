import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';
import type { MidiNote } from '../../src/types/project';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../src/hooks/useToast', () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../src/hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({
    ctx: {
      createBuffer: vi.fn((channels: number, length: number, sampleRate: number) => ({
        numberOfChannels: channels,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: (ch: number) => new Float32Array(length),
      })),
    },
    decodeAudioData: vi.fn(),
  }),
}));

function setupClipWithNote(opts: {
  pitch?: number;
  startBeat?: number;
  durationBeats?: number;
  velocity?: number;
} = {}) {
  useProjectStore.getState().createProject();
  const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
  const clip = useProjectStore.getState().ensureMidiClip(track.id);
  const noteId = useProjectStore.getState().addMidiNote(clip.id, {
    pitch: opts.pitch ?? 60,
    startBeat: opts.startBeat ?? 2,
    durationBeats: opts.durationBeats ?? 2,
    velocity: opts.velocity ?? 100,
  })!;
  return { track, clip, noteId };
}

function getNote(noteId: string) {
  const project = useProjectStore.getState().project!;
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      const note = clip.midiData?.notes.find((n) => n.id === noteId);
      if (note) return note;
    }
  }
  return undefined;
}

describe('resizeMidiNote', () => {
  beforeEach(() => {
    useProjectStore.getState().createProject();
  });

  describe('right edge resize', () => {
    it('changes duration while keeping start beat fixed', () => {
      const { clip, noteId } = setupClipWithNote({ startBeat: 2, durationBeats: 2 });

      useProjectStore.getState().resizeMidiNote(clip.id, noteId, {
        edge: 'right',
        endBeat: 6,
      });

      const note = getNote(noteId)!;
      expect(note.startBeat).toBe(2);
      expect(note.durationBeats).toBe(4); // endBeat 6 - startBeat 2
    });

    it('shortens duration when dragging right edge left', () => {
      const { clip, noteId } = setupClipWithNote({ startBeat: 2, durationBeats: 4 });

      useProjectStore.getState().resizeMidiNote(clip.id, noteId, {
        edge: 'right',
        endBeat: 3,
      });

      const note = getNote(noteId)!;
      expect(note.startBeat).toBe(2);
      expect(note.durationBeats).toBe(1);
    });

    it('does not allow duration below minimum', () => {
      const { clip, noteId } = setupClipWithNote({ startBeat: 2, durationBeats: 2 });

      useProjectStore.getState().resizeMidiNote(clip.id, noteId, {
        edge: 'right',
        endBeat: 2, // same as startBeat => zero duration
        minDurationBeats: 0.25,
      });

      const note = getNote(noteId)!;
      expect(note.startBeat).toBe(2);
      expect(note.durationBeats).toBe(0.25);
    });
  });

  describe('left edge resize', () => {
    it('changes start beat and duration together, keeping end beat fixed', () => {
      const { clip, noteId } = setupClipWithNote({ startBeat: 2, durationBeats: 2 });
      // Original: startBeat=2, endBeat=4

      useProjectStore.getState().resizeMidiNote(clip.id, noteId, {
        edge: 'left',
        startBeat: 1,
      });

      const note = getNote(noteId)!;
      expect(note.startBeat).toBe(1);
      expect(note.durationBeats).toBe(3); // endBeat 4 - startBeat 1
    });

    it('shortens note when dragging left edge right', () => {
      const { clip, noteId } = setupClipWithNote({ startBeat: 2, durationBeats: 4 });
      // Original: startBeat=2, endBeat=6

      useProjectStore.getState().resizeMidiNote(clip.id, noteId, {
        edge: 'left',
        startBeat: 4,
      });

      const note = getNote(noteId)!;
      expect(note.startBeat).toBe(4);
      expect(note.durationBeats).toBe(2); // endBeat 6 - startBeat 4
    });

    it('does not allow duration below minimum', () => {
      const { clip, noteId } = setupClipWithNote({ startBeat: 2, durationBeats: 2 });
      // Original: startBeat=2, endBeat=4

      useProjectStore.getState().resizeMidiNote(clip.id, noteId, {
        edge: 'left',
        startBeat: 4, // same as endBeat => zero duration
        minDurationBeats: 0.25,
      });

      const note = getNote(noteId)!;
      // startBeat should be capped at endBeat - minDuration
      expect(note.startBeat).toBe(3.75);
      expect(note.durationBeats).toBe(0.25);
    });

    it('does not allow start beat below 0', () => {
      const { clip, noteId } = setupClipWithNote({ startBeat: 1, durationBeats: 2 });
      // Original: startBeat=1, endBeat=3

      useProjectStore.getState().resizeMidiNote(clip.id, noteId, {
        edge: 'left',
        startBeat: -5,
      });

      const note = getNote(noteId)!;
      expect(note.startBeat).toBe(0);
      expect(note.durationBeats).toBe(3); // endBeat 3 - startBeat 0
    });
  });

  describe('minimum duration enforcement', () => {
    it('uses default minimum of 0.125 when not specified', () => {
      const { clip, noteId } = setupClipWithNote({ startBeat: 2, durationBeats: 2 });

      useProjectStore.getState().resizeMidiNote(clip.id, noteId, {
        edge: 'right',
        endBeat: 2.01, // near-zero
      });

      const note = getNote(noteId)!;
      // Default min is 0.125
      expect(note.durationBeats).toBeGreaterThanOrEqual(0.125);
    });

    it('respects custom minimum duration', () => {
      const { clip, noteId } = setupClipWithNote({ startBeat: 0, durationBeats: 4 });

      useProjectStore.getState().resizeMidiNote(clip.id, noteId, {
        edge: 'right',
        endBeat: 0.1,
        minDurationBeats: 0.5,
      });

      const note = getNote(noteId)!;
      expect(note.durationBeats).toBe(0.5);
    });
  });

  describe('undo support', () => {
    it('resize is undoable', () => {
      const { clip, noteId } = setupClipWithNote({ startBeat: 2, durationBeats: 2 });

      useProjectStore.getState().resizeMidiNote(clip.id, noteId, {
        edge: 'right',
        endBeat: 8,
      });

      const afterResize = getNote(noteId)!;
      expect(afterResize.durationBeats).toBe(6);

      useProjectStore.getState().undo();

      const afterUndo = getNote(noteId)!;
      expect(afterUndo.durationBeats).toBe(2);
      expect(afterUndo.startBeat).toBe(2);
    });

    it('left-edge resize is undoable', () => {
      const { clip, noteId } = setupClipWithNote({ startBeat: 4, durationBeats: 2 });

      useProjectStore.getState().resizeMidiNote(clip.id, noteId, {
        edge: 'left',
        startBeat: 1,
      });

      const afterResize = getNote(noteId)!;
      expect(afterResize.startBeat).toBe(1);
      expect(afterResize.durationBeats).toBe(5);

      useProjectStore.getState().undo();

      const afterUndo = getNote(noteId)!;
      expect(afterUndo.startBeat).toBe(4);
      expect(afterUndo.durationBeats).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('no-ops for non-existent clip', () => {
      const { noteId } = setupClipWithNote();

      // Should not throw
      useProjectStore.getState().resizeMidiNote('nonexistent-clip', noteId, {
        edge: 'right',
        endBeat: 10,
      });
    });

    it('no-ops for non-existent note', () => {
      const { clip } = setupClipWithNote();

      // Should not throw, note remains unchanged
      useProjectStore.getState().resizeMidiNote(clip.id, 'nonexistent-note', {
        edge: 'right',
        endBeat: 10,
      });
    });

    it('preserves pitch and velocity during resize', () => {
      const { clip, noteId } = setupClipWithNote({
        pitch: 72,
        velocity: 110,
        startBeat: 2,
        durationBeats: 2,
      });

      useProjectStore.getState().resizeMidiNote(clip.id, noteId, {
        edge: 'right',
        endBeat: 8,
      });

      const note = getNote(noteId)!;
      expect(note.pitch).toBe(72);
      expect(note.velocity).toBe(110);
    });

    it('does not affect other notes in the same clip', () => {
      const { clip, noteId } = setupClipWithNote({ startBeat: 0, durationBeats: 2 });
      const otherNoteId = useProjectStore.getState().addMidiNote(clip.id, {
        pitch: 64,
        startBeat: 4,
        durationBeats: 1,
        velocity: 80,
      })!;

      useProjectStore.getState().resizeMidiNote(clip.id, noteId, {
        edge: 'right',
        endBeat: 6,
      });

      const otherNote = getNote(otherNoteId)!;
      expect(otherNote.startBeat).toBe(4);
      expect(otherNote.durationBeats).toBe(1);
    });
  });
});

/**
 * Pure-function tests for the edge-detection logic used in PianoRollCanvas.findNoteAt.
 * This mirrors the logic from the component so we can test it without rendering canvas.
 */
describe('findNoteAt edge detection', () => {
  const EDGE_PX = 8;
  const MIN_WIDTH_FOR_EDGES = 10;

  function findNoteEdge(
    mouseX: number,
    noteX: number,
    noteWidth: number,
  ): 'left' | 'right' | 'body' {
    const nearLeft = mouseX < noteX + EDGE_PX && noteWidth > MIN_WIDTH_FOR_EDGES;
    const nearRight = mouseX > noteX + noteWidth - EDGE_PX && noteWidth > MIN_WIDTH_FOR_EDGES;
    return nearLeft ? 'left' : nearRight ? 'right' : 'body';
  }

  it('returns "left" when mouse is near the left edge', () => {
    expect(findNoteEdge(102, 100, 80)).toBe('left');
  });

  it('returns "right" when mouse is near the right edge', () => {
    expect(findNoteEdge(175, 100, 80)).toBe('right');
  });

  it('returns "body" when mouse is in the center', () => {
    expect(findNoteEdge(140, 100, 80)).toBe('body');
  });

  it('returns "body" for very narrow notes (no edge zones)', () => {
    // Note width <= 10px: no edge detection
    expect(findNoteEdge(101, 100, 8)).toBe('body');
    expect(findNoteEdge(107, 100, 8)).toBe('body');
  });

  it('returns "left" at the exact edge boundary', () => {
    // noteX + EDGE_PX - 1 should be 'left'
    expect(findNoteEdge(107, 100, 80)).toBe('left');
    // noteX + EDGE_PX is body
    expect(findNoteEdge(108, 100, 80)).toBe('body');
  });

  it('returns "right" at the exact right boundary', () => {
    // noteX + noteWidth - EDGE_PX is body
    expect(findNoteEdge(172, 100, 80)).toBe('body');
    // noteX + noteWidth - EDGE_PX + 1 is right
    expect(findNoteEdge(173, 100, 80)).toBe('right');
  });
});
