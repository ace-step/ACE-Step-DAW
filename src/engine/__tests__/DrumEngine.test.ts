import { describe, it, expect } from 'vitest';
import { BEAT_PAD_KEYS, DRUM_PAD_NAMES } from '../DrumEngine';

describe('DrumEngine constants', () => {
  describe('BEAT_PAD_KEYS', () => {
    it('should have 16 keys for the 4x4 grid', () => {
      expect(BEAT_PAD_KEYS).toHaveLength(16);
    });

    it('should map bottom keyboard row (z,x,c,v) to first 4 pads (Kick, Snare, HH Closed, HH Open)', () => {
      // Row 0 (indices 0-3) = bottom keyboard row for most-used drums
      expect(BEAT_PAD_KEYS[0]).toBe('z');
      expect(BEAT_PAD_KEYS[1]).toBe('x');
      expect(BEAT_PAD_KEYS[2]).toBe('c');
      expect(BEAT_PAD_KEYS[3]).toBe('v');
    });

    it('should map home row (a,s,d,f) to second 4 pads (Clap, Rim, Tom High, Tom Low)', () => {
      // Row 1 (indices 4-7) = home row
      expect(BEAT_PAD_KEYS[4]).toBe('a');
      expect(BEAT_PAD_KEYS[5]).toBe('s');
      expect(BEAT_PAD_KEYS[6]).toBe('d');
      expect(BEAT_PAD_KEYS[7]).toBe('f');
    });

    it('should map qwer row to third 4 pads (Crash, Ride, Shaker, Cowbell)', () => {
      // Row 2 (indices 8-11)
      expect(BEAT_PAD_KEYS[8]).toBe('q');
      expect(BEAT_PAD_KEYS[9]).toBe('w');
      expect(BEAT_PAD_KEYS[10]).toBe('e');
      expect(BEAT_PAD_KEYS[11]).toBe('r');
    });

    it('should map number row (1,2,3,4) to top 4 pads (Conga, Bongo, Tambourine, Perc)', () => {
      // Row 3 (indices 12-15)
      expect(BEAT_PAD_KEYS[12]).toBe('1');
      expect(BEAT_PAD_KEYS[13]).toBe('2');
      expect(BEAT_PAD_KEYS[14]).toBe('3');
      expect(BEAT_PAD_KEYS[15]).toBe('4');
    });

    it('should have the full key layout in bottom-to-top order', () => {
      expect(BEAT_PAD_KEYS).toEqual([
        'z', 'x', 'c', 'v',
        'a', 's', 'd', 'f',
        'q', 'w', 'e', 'r',
        '1', '2', '3', '4',
      ]);
    });
  });

  describe('DRUM_PAD_NAMES', () => {
    it('should have 16 pad names', () => {
      expect(DRUM_PAD_NAMES).toHaveLength(16);
    });

    it('should have Kick as the first pad (index 0)', () => {
      expect(DRUM_PAD_NAMES[0]).toBe('Kick');
    });

    it('should have Snare as the second pad (index 1)', () => {
      expect(DRUM_PAD_NAMES[1]).toBe('Snare');
    });
  });
});
