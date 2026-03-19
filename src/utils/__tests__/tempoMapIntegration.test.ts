import { describe, it, expect } from 'vitest';
import {
  secondsToBarsBeats,
  formatBarsBeats,
  snapToGrid,
} from '../time';
import type { TempoEvent, TimeSignatureEvent } from '../../types/project';

describe('tempo-map-aware time utilities', () => {
  describe('secondsToBarsBeats with tempoMap', () => {
    it('uses tempoMap when provided', () => {
      const tempoMap: TempoEvent[] = [
        { beat: 0, bpm: 120 },
        { beat: 4, bpm: 60 },
      ];
      // At 120 BPM, 4 beats = 2s. After that, at 60 BPM.
      // At t=2s, we are at beat 4 = bar 2
      const result = secondsToBarsBeats(2.0, 120, 4, tempoMap);
      expect(result.bars).toBe(2);
      expect(result.beats).toBe(1);
    });

    it('falls back to constant BPM when tempoMap is empty', () => {
      const result = secondsToBarsBeats(2.0, 120, 4, []);
      expect(result.bars).toBe(2);
      expect(result.beats).toBe(1);
    });

    it('falls back to constant BPM when tempoMap is undefined', () => {
      const result = secondsToBarsBeats(2.0, 120, 4, undefined);
      expect(result.bars).toBe(2);
      expect(result.beats).toBe(1);
    });
  });

  describe('secondsToBarsBeats with timeSignatureMap', () => {
    it('accounts for time signature changes', () => {
      const tsMap: TimeSignatureEvent[] = [
        { bar: 1, numerator: 4, denominator: 4 },
        { bar: 3, numerator: 3, denominator: 4 },
      ];
      // 4/4: bars 1-2 = 8 beats. Then 3/4: bar 3 = beats 8-10
      // At 120 BPM, beat 8 = 4s, beat 11 = 5.5s
      // At t=5s => 10 beats. Bar 3 starts at beat 8. 10-8=2 beats into 3/4.
      // Bar = 3, beat = 3 (2 beats into bar + 1-indexed)
      const result = secondsToBarsBeats(5.0, 120, 4, undefined, tsMap);
      expect(result.bars).toBe(3);
      expect(result.beats).toBe(3);
    });
  });

  describe('formatBarsBeats with tempoMap', () => {
    it('formats correctly with tempo changes', () => {
      const tempoMap: TempoEvent[] = [
        { beat: 0, bpm: 120 },
        { beat: 4, bpm: 60 },
      ];
      // At t=2s: beat 4 = bar 2, beat 1
      const result = formatBarsBeats(2.0, 120, 4, tempoMap);
      expect(result).toBe('2.1.00');
    });

    it('formats correctly without tempo map', () => {
      const result = formatBarsBeats(2.0, 120, 4);
      expect(result).toBe('2.1.00');
    });
  });

  describe('snapToGrid with tempoMap', () => {
    it('snaps in beat-space when tempoMap provided', () => {
      const tempoMap: TempoEvent[] = [
        { beat: 0, bpm: 120 },
        { beat: 4, bpm: 60 },
      ];
      // At 120 BPM, beat 1 = 0.5s. Snap 0.3s to nearest beat.
      // 0.3s at 120 BPM = 0.6 beats -> snaps to 1 beat -> 0.5s
      const result = snapToGrid(0.3, 120, 1, tempoMap);
      expect(result).toBeCloseTo(0.5);
    });

    it('handles snapping after tempo change', () => {
      const tempoMap: TempoEvent[] = [
        { beat: 0, bpm: 120 },
        { beat: 4, bpm: 60 },
      ];
      // After beat 4 (t=2s), BPM is 60.
      // Beat 5 at 60 BPM = 2s + 1s = 3s.
      // A time of 2.6s should snap to beat 5 = 3s (since 2.6s is closer to beat 5 than beat 4)
      // Actually let's check: at t=2.6s with tempo map:
      // beat 4 = 2s, then at 60BPM: 0.6s * 60/60 = 0.6 beats. So 4.6 beats.
      // Snaps to 5 beats => beat 5 = 2s + 1s = 3s
      const result = snapToGrid(2.6, 120, 1, tempoMap);
      expect(result).toBeCloseTo(3.0);
    });

    it('works the same as before when tempoMap is undefined', () => {
      const result = snapToGrid(0.3, 120, 1, undefined);
      expect(result).toBeCloseTo(0.5);
    });

    it('works the same as before when tempoMap is empty', () => {
      const result = snapToGrid(0.3, 120, 1, []);
      expect(result).toBeCloseTo(0.5);
    });

    it('snaps to sub-divisions with tempoMap', () => {
      const tempoMap: TempoEvent[] = [
        { beat: 0, bpm: 120 },
      ];
      // 0.13s at 120 BPM = 0.26 beats. Quarter of a beat (0.25) -> 0.125s
      const result = snapToGrid(0.13, 120, 0.25, tempoMap);
      expect(result).toBeCloseTo(0.125);
    });
  });
});
