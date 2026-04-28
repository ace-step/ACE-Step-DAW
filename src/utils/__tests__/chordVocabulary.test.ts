import { describe, it, expect } from 'vitest';
import {
  buildCoreVocabulary,
  getChordByIndex,
  getChordByLabel,
  parseChordLabel,
  parseNoteName,
  pitchClassName,
  chordLabelToMidiNotes,
  isFullVocabularyLoaded,
} from '../chordVocabulary';

describe('chordVocabulary', () => {
  describe('parseNoteName', () => {
    it('parses natural notes', () => {
      expect(parseNoteName('C')).toBe(0);
      expect(parseNoteName('D')).toBe(2);
      expect(parseNoteName('E')).toBe(4);
      expect(parseNoteName('A')).toBe(9);
    });

    it('parses sharps', () => {
      expect(parseNoteName('C#')).toBe(1);
      expect(parseNoteName('F#')).toBe(6);
    });

    it('parses flats', () => {
      expect(parseNoteName('Bb')).toBe(10);
      expect(parseNoteName('Eb')).toBe(3);
      expect(parseNoteName('Ab')).toBe(8);
    });

    it('returns -1 for invalid notes', () => {
      expect(parseNoteName('X')).toBe(-1);
      expect(parseNoteName('')).toBe(-1);
    });
  });

  describe('pitchClassName', () => {
    it('returns correct note names', () => {
      expect(pitchClassName(0)).toBe('C');
      expect(pitchClassName(1)).toBe('C#');
      expect(pitchClassName(9)).toBe('A');
      expect(pitchClassName(11)).toBe('B');
    });

    it('wraps around octaves', () => {
      expect(pitchClassName(12)).toBe('C');
      expect(pitchClassName(14)).toBe('D');
    });
  });

  describe('buildCoreVocabulary', () => {
    it('generates 240 tokens (12 roots × 20 qualities)', () => {
      const vocab = buildCoreVocabulary();
      expect(vocab).toHaveLength(240);
    });

    it('assigns sequential indices', () => {
      const vocab = buildCoreVocabulary();
      vocab.forEach((token, i) => {
        expect(token.index).toBe(i);
      });
    });

    it('first token is C major', () => {
      const vocab = buildCoreVocabulary();
      expect(vocab[0].label).toBe('C');
      expect(vocab[0].root).toBe(0);
      expect(vocab[0].midiNotes).toEqual([60, 64, 67]); // C4, E4, G4
    });

    it('includes C minor', () => {
      const vocab = buildCoreVocabulary();
      const cMinor = vocab.find((t) => t.label === 'Cm');
      expect(cMinor).toBeDefined();
      expect(cMinor!.midiNotes).toEqual([60, 63, 67]); // C4, Eb4, G4
    });

    it('all tokens have valid MIDI notes (0-127)', () => {
      const vocab = buildCoreVocabulary();
      for (const token of vocab) {
        expect(token.midiNotes.length).toBeGreaterThan(0);
        for (const note of token.midiNotes) {
          expect(note).toBeGreaterThanOrEqual(0);
          expect(note).toBeLessThanOrEqual(127);
        }
      }
    });
  });

  describe('getChordByIndex', () => {
    it('returns correct token', () => {
      const token = getChordByIndex(0);
      expect(token?.label).toBe('C');
    });

    it('returns undefined for out-of-range index', () => {
      expect(getChordByIndex(9999)).toBeUndefined();
    });
  });

  describe('getChordByLabel', () => {
    it('finds major chords', () => {
      const c = getChordByLabel('C');
      expect(c?.root).toBe(0);
      expect(c?.midiNotes).toEqual([60, 64, 67]);
    });

    it('finds minor 7th chords', () => {
      const am7 = getChordByLabel('Am7');
      expect(am7).toBeDefined();
      expect(am7!.root).toBe(9);
      expect(am7!.midiNotes).toEqual([69, 72, 76, 79]); // A4, C5, E5, G5
    });

    it('finds dominant 7th', () => {
      const g7 = getChordByLabel('G7');
      expect(g7).toBeDefined();
      expect(g7!.root).toBe(7);
    });

    it('returns undefined for unknown chords', () => {
      expect(getChordByLabel('Xaug13')).toBeUndefined();
    });
  });

  describe('parseChordLabel', () => {
    it('parses simple major chord', () => {
      expect(parseChordLabel('C')).toEqual({ root: 0, quality: '' });
    });

    it('parses minor chord with sharp root', () => {
      expect(parseChordLabel('F#m')).toEqual({ root: 6, quality: 'm' });
    });

    it('parses complex chord', () => {
      expect(parseChordLabel('Bbmaj7')).toEqual({ root: 10, quality: 'maj7' });
    });

    it('returns null for invalid', () => {
      expect(parseChordLabel('')).toBeNull();
      expect(parseChordLabel('Xx')).toBeNull();
    });
  });

  describe('chordLabelToMidiNotes', () => {
    it('returns MIDI notes for known chords', () => {
      expect(chordLabelToMidiNotes('C')).toEqual([60, 64, 67]);
      expect(chordLabelToMidiNotes('Am')).toEqual([69, 72, 76]);
    });

    it('returns empty array for unparseable labels', () => {
      expect(chordLabelToMidiNotes('???')).toEqual([]);
    });
  });

  describe('isFullVocabularyLoaded', () => {
    it('returns false when only core vocabulary is loaded', () => {
      expect(isFullVocabularyLoaded()).toBe(false);
    });
  });
});
