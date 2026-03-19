/**
 * chords.ts — Musical chord definitions for the chord stamp tool.
 */

export interface ChordShape {
  name: string;
  abbr: string;
  intervals: number[]; // semitones from root
}

export const DEFAULT_CHORD_SHAPE_ABBR = 'maj';

export const CHORD_SHAPES: ChordShape[] = [
  { name: 'Major', abbr: 'maj', intervals: [0, 4, 7] },
  { name: 'Minor', abbr: 'min', intervals: [0, 3, 7] },
  { name: 'Diminished', abbr: 'dim', intervals: [0, 3, 6] },
  { name: 'Augmented', abbr: 'aug', intervals: [0, 4, 8] },
  { name: 'Major 7th', abbr: 'maj7', intervals: [0, 4, 7, 11] },
  { name: 'Minor 7th', abbr: 'min7', intervals: [0, 3, 7, 10] },
  { name: 'Dominant 7th', abbr: '7', intervals: [0, 4, 7, 10] },
  { name: 'Suspended 2nd', abbr: 'sus2', intervals: [0, 2, 7] },
  { name: 'Suspended 4th', abbr: 'sus4', intervals: [0, 5, 7] },
  { name: 'Power (5th)', abbr: '5', intervals: [0, 7] },
  { name: 'Add 9', abbr: 'add9', intervals: [0, 4, 7, 14] },
  { name: 'Minor Add 9', abbr: 'madd9', intervals: [0, 3, 7, 14] },
];

/**
 * Generate MIDI pitches for a chord at a given root note.
 */
export function chordPitches(rootPitch: number, shape: ChordShape): number[] {
  return shape.intervals.map((interval) => rootPitch + interval).filter((p) => p <= 127);
}

export function getChordShapeByAbbr(abbr: string): ChordShape | undefined {
  return CHORD_SHAPES.find((shape) => shape.abbr === abbr);
}

/**
 * Get note name from MIDI pitch (e.g., 60 → "C4").
 */
export function pitchToNoteName(pitch: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(pitch / 12) - 1;
  return `${names[pitch % 12]}${octave}`;
}
