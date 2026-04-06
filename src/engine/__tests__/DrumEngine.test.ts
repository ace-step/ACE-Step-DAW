import { describe, it, expect } from 'vitest';
import { BEAT_PAD_KEYS, DRUM_PAD_NAMES, drumEngine } from '../DrumEngine';
import type { PadParams } from '../DrumEngine';

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

describe('DrumEngine pad params', () => {
  describe('updatePadParams', () => {
    it('no-ops gracefully for non-existent track', () => {
      // Should not throw when called for a track that hasn't been initialized
      expect(() => {
        drumEngine.updatePadParams('nonexistent', 0, { pan: 0.5 });
      }).not.toThrow();
    });

    it('no-ops gracefully for out-of-range pad index', () => {
      expect(() => {
        drumEngine.updatePadParams('nonexistent', -1, { tune: 5 });
        drumEngine.updatePadParams('nonexistent', 999, { drive: 0.5 });
      }).not.toThrow();
    });
  });

  describe('syncTrackPadParams', () => {
    it('no-ops gracefully when track not initialized', () => {
      const pads = [{
        volume: 0.8, tune: 5, decay: 0.3, pan: -0.5,
        filter: { type: 'lowpass' as const, cutoff: 2000 },
        drive: 0.4, send: { reverb: 0.2, delay: 0.1 },
      }];
      expect(() => {
        drumEngine.syncTrackPadParams('nonexistent', pads);
      }).not.toThrow();
    });
  });

  describe('PadParams type contract', () => {
    it('accepts all parameter fields as optional', () => {
      const empty: PadParams = {};
      expect(empty).toBeDefined();

      const tuneOnly: PadParams = { tune: 12 };
      expect(tuneOnly.tune).toBe(12);

      const filterOnly: PadParams = {
        filter: { type: 'lowpass', cutoff: 1000 },
      };
      expect(filterOnly.filter?.type).toBe('lowpass');
      expect(filterOnly.filter?.cutoff).toBe(1000);
    });

    it('supports filter type off to bypass', () => {
      const params: PadParams = {
        filter: { type: 'off', cutoff: 20000 },
      };
      expect(params.filter?.type).toBe('off');
    });

    it('supports decay range 0-1', () => {
      const short: PadParams = { decay: 0 };
      const long: PadParams = { decay: 1 };
      expect(short.decay).toBe(0);
      expect(long.decay).toBe(1);
    });

    it('supports send amounts for reverb and delay', () => {
      const params: PadParams = {
        send: { reverb: 0.5, delay: 0.3 },
      };
      expect(params.send?.reverb).toBe(0.5);
      expect(params.send?.delay).toBe(0.3);
    });
  });
});
