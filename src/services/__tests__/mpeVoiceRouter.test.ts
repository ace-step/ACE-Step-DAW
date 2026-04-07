import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MpeVoiceRouter } from '../mpeVoiceRouter';
import type { MpeNoteState } from '../mpeService';

describe('MpeVoiceRouter', () => {
  let router: MpeVoiceRouter;

  beforeEach(() => {
    router = new MpeVoiceRouter();
  });

  describe('pitch bend calculation', () => {
    it('converts pitch bend to frequency multiplier (48 semitone range)', () => {
      // Full positive bend = +48 semitones = up 4 octaves
      const mult = router.pitchBendToFrequencyMultiplier(8191, 48);
      expect(mult).toBeCloseTo(16, 0); // 2^4 = 16

      // No bend
      const noMult = router.pitchBendToFrequencyMultiplier(0, 48);
      expect(noMult).toBeCloseTo(1, 5);

      // Full negative bend = -48 semitones = down 4 octaves
      const negMult = router.pitchBendToFrequencyMultiplier(-8192, 48);
      expect(negMult).toBeCloseTo(1 / 16, 1);
    });

    it('handles 24 semitone range', () => {
      // +24 semitones = 2 octaves up
      const mult = router.pitchBendToFrequencyMultiplier(8191, 24);
      expect(mult).toBeCloseTo(4, 0); // 2^2 = 4
    });
  });

  describe('timbre to filter cutoff', () => {
    it('maps CC74 0 to min cutoff', () => {
      const cutoff = router.timbreToFilterCutoff(0);
      expect(cutoff).toBeCloseTo(200); // min
    });

    it('maps CC74 64 (center) to mid cutoff', () => {
      const cutoff = router.timbreToFilterCutoff(64);
      expect(cutoff).toBeGreaterThan(200);
      expect(cutoff).toBeLessThan(12000);
    });

    it('maps CC74 127 to max cutoff', () => {
      const cutoff = router.timbreToFilterCutoff(127);
      expect(cutoff).toBeCloseTo(12000); // max
    });
  });

  describe('pressure to gain', () => {
    it('maps 0 pressure to base gain', () => {
      const gain = router.pressureToGain(0);
      expect(gain).toBeCloseTo(0.7); // base level
    });

    it('maps 127 pressure to full gain', () => {
      const gain = router.pressureToGain(127);
      expect(gain).toBeCloseTo(1.0);
    });

    it('interpolates linearly', () => {
      const half = router.pressureToGain(64);
      expect(half).toBeGreaterThan(0.7);
      expect(half).toBeLessThan(1.0);
    });
  });

  describe('note state tracking', () => {
    it('registers and retrieves active notes', () => {
      const noteState: MpeNoteState = {
        channel: 1, pitch: 60, velocity: 100,
        pressure: 0, timbre: 64, pitchBend: 0,
      };
      router.registerNote('track1', noteState);
      expect(router.getActiveNoteCount('track1')).toBe(1);
    });

    it('removes notes on release', () => {
      const noteState: MpeNoteState = {
        channel: 1, pitch: 60, velocity: 100,
        pressure: 0, timbre: 64, pitchBend: 0,
      };
      router.registerNote('track1', noteState);
      router.releaseNote('track1', 1, 60);
      expect(router.getActiveNoteCount('track1')).toBe(0);
    });

    it('clears all notes for a track', () => {
      router.registerNote('track1', {
        channel: 1, pitch: 60, velocity: 100,
        pressure: 0, timbre: 64, pitchBend: 0,
      });
      router.registerNote('track1', {
        channel: 2, pitch: 64, velocity: 80,
        pressure: 0, timbre: 64, pitchBend: 0,
      });
      router.clearTrack('track1');
      expect(router.getActiveNoteCount('track1')).toBe(0);
    });
  });
});
