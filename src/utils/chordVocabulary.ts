/**
 * Chord vocabulary for ChordSeqAI integration.
 *
 * Maps a simplified set of common chord tokens to MIDI notes.
 * The full ChordSeqAI vocabulary has 1,033 tokens; this provides
 * the core subset needed for DAW integration. Additional tokens
 * can be loaded from the full vocabulary file when available.
 */
import type { ChordToken } from '../types/chordSuggestion';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** Chord quality definitions: [suffix, intervals from root]. Array preserves order (unlike object with numeric keys). */
const CHORD_QUALITIES: Array<[string, number[]]> = [
  ['', [0, 4, 7]],             // major
  ['m', [0, 3, 7]],            // minor
  ['dim', [0, 3, 6]],          // diminished
  ['aug', [0, 4, 8]],          // augmented
  ['7', [0, 4, 7, 10]],        // dominant 7th
  ['maj7', [0, 4, 7, 11]],     // major 7th
  ['m7', [0, 3, 7, 10]],       // minor 7th
  ['dim7', [0, 3, 6, 9]],      // diminished 7th
  ['sus2', [0, 2, 7]],         // suspended 2nd
  ['sus4', [0, 5, 7]],         // suspended 4th
  ['5', [0, 7]],               // power chord
  ['add9', [0, 4, 7, 14]],     // add 9
  ['m(add9)', [0, 3, 7, 14]],  // minor add 9
  ['6', [0, 4, 7, 9]],         // major 6th
  ['m6', [0, 3, 7, 9]],        // minor 6th
  ['9', [0, 4, 7, 10, 14]],    // dominant 9th
  ['maj9', [0, 4, 7, 11, 14]], // major 9th
  ['m9', [0, 3, 7, 10, 14]],   // minor 9th
  ['7sus4', [0, 5, 7, 10]],    // 7sus4
  ['mmaj7', [0, 3, 7, 11]],    // minor-major 7th
];

/** Quality suffix → intervals lookup for parsing. */
const QUALITY_MAP = new Map(CHORD_QUALITIES);

/** Build MIDI notes for a chord rooted at the given pitch class, centered around octave 4 (middle C). */
function buildMidiNotes(rootPitchClass: number, intervals: number[]): number[] {
  const baseNote = 60 + rootPitchClass; // root in octave 4
  return intervals.map((i) => baseNote + i).filter((n) => n >= 0 && n <= 127);
}

/** Parse a note name like "C", "F#", "Bb" to pitch class 0-11. */
export function parseNoteName(name: string): number {
  const normalized = name
    .replace(/♯/g, '#')
    .replace(/♭/g, 'b');

  for (let i = 0; i < NOTE_NAMES.length; i++) {
    if (normalized === NOTE_NAMES[i]) return i;
  }
  // Handle flats: Db=1, Eb=3, Gb=6, Ab=8, Bb=10
  const flatMap: Record<string, number> = {
    'Db': 1, 'Eb': 3, 'Fb': 4, 'Gb': 6, 'Ab': 8, 'Bb': 10,
  };
  return flatMap[normalized] ?? -1;
}

/** Get the note name for a pitch class 0-11. */
export function pitchClassName(pitchClass: number): string {
  return NOTE_NAMES[((pitchClass % 12) + 12) % 12];
}

/**
 * Build the core chord vocabulary (240 tokens: 12 roots × 20 qualities).
 * Token indices are assigned sequentially: root * qualityCount + qualityIdx.
 */
export function buildCoreVocabulary(): ChordToken[] {
  const tokens: ChordToken[] = [];
  let index = 0;

  for (let root = 0; root < 12; root++) {
    for (const [suffix, intervals] of CHORD_QUALITIES) {
      const label = `${NOTE_NAMES[root]}${suffix}`;
      tokens.push({
        index,
        label,
        root,
        midiNotes: buildMidiNotes(root, intervals),
      });
      index++;
    }
  }

  return tokens;
}

/** Singleton vocabulary instance. */
let _vocabulary: ChordToken[] | null = null;

export function getChordVocabulary(): ChordToken[] {
  if (!_vocabulary) {
    _vocabulary = buildCoreVocabulary();
  }
  return _vocabulary;
}

/** Look up a chord token by its index. */
export function getChordByIndex(index: number): ChordToken | undefined {
  return getChordVocabulary()[index];
}

/** Look up a chord token by label (e.g. "Am7"). */
export function getChordByLabel(label: string): ChordToken | undefined {
  return getChordVocabulary().find((t) => t.label === label);
}

/**
 * Parse a chord label into root pitch class and quality suffix.
 * Returns null if unparseable.
 */
export function parseChordLabel(label: string): { root: number; quality: string } | null {
  // Try two-char root first (e.g., "C#", "Bb")
  for (let len = 2; len >= 1; len--) {
    const rootStr = label.slice(0, len);
    const root = parseNoteName(rootStr);
    if (root >= 0) {
      const quality = label.slice(len);
      return { root, quality };
    }
  }
  return null;
}

/**
 * Get MIDI notes for a chord label, falling back to the quality map
 * if the token isn't in the vocabulary.
 */
export function chordLabelToMidiNotes(label: string): number[] {
  const token = getChordByLabel(label);
  if (token) return token.midiNotes;

  const parsed = parseChordLabel(label);
  if (!parsed) return [];

  // Strip slash bass note for lookup
  const qualityBase = parsed.quality.split('/')[0];
  const intervals = QUALITY_MAP.get(qualityBase);
  if (!intervals) return [];

  return buildMidiNotes(parsed.root, intervals);
}
