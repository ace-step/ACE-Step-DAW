import type { MidiNote } from '../types/project';

export interface QuantizeOptions {
  /** Grid size in beats (e.g. 1 = quarter, 0.5 = eighth). */
  gridBeats: number;
  /** 0–100: 0 = no change, 100 = snap to grid. */
  strength: number;
  /** 0–100: offsets every other grid line for swing feel. */
  swing: number;
  /** What to quantize: 'start' | 'startEnd' | 'preserveDuration'. */
  scope: 'start' | 'startEnd' | 'preserveDuration';
}

/**
 * Compute the quantized position of a beat value to the nearest grid line,
 * taking swing into account. Swing offsets every odd grid position.
 */
export function quantizedBeat(beat: number, gridBeats: number, swing: number): number {
  const gridIndex = Math.round(beat / gridBeats);
  let snapped = gridIndex * gridBeats;
  // Apply swing: shift odd grid positions forward by up to half a grid
  if (swing > 0 && gridIndex % 2 !== 0) {
    snapped += (swing / 100) * gridBeats * 0.5;
  }
  return snapped;
}

/**
 * Quantize a single MIDI note, returning a new note object (never mutates).
 */
export function quantizeNote(note: MidiNote, options: QuantizeOptions): MidiNote {
  const { gridBeats, strength, swing, scope } = options;
  if (strength === 0 || gridBeats <= 0) return note;

  const factor = strength / 100;
  const targetStart = quantizedBeat(note.startBeat, gridBeats, swing);
  const newStart = note.startBeat + (targetStart - note.startBeat) * factor;

  if (scope === 'start' || scope === 'preserveDuration') {
    return {
      ...note,
      startBeat: newStart,
      durationBeats: scope === 'preserveDuration' ? note.durationBeats : note.durationBeats,
    };
  }

  // scope === 'startEnd': quantize both start and end independently
  const endBeat = note.startBeat + note.durationBeats;
  const targetEnd = quantizedBeat(endBeat, gridBeats, swing);
  const newEnd = endBeat + (targetEnd - endBeat) * factor;
  const newDuration = Math.max(gridBeats * 0.25, newEnd - newStart); // minimum duration

  return {
    ...note,
    startBeat: newStart,
    durationBeats: newDuration,
  };
}

/**
 * Quantize an array of MIDI notes. Returns new array with quantized notes.
 */
export function quantizeNotes(
  notes: MidiNote[],
  noteIds: Set<string>,
  options: QuantizeOptions,
): MidiNote[] {
  return notes.map((note) =>
    noteIds.has(note.id) ? quantizeNote(note, options) : note,
  );
}
