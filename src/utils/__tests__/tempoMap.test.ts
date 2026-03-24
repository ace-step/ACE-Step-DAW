import { describe, it, expect } from 'vitest';
import {
  getTempoAtBeat,
  beatToTime,
  timeToBeat,
  getTimeSignatureAtBar,
  getBarAtBeat,
  getBeatAtBar,
} from '../tempoMap';
import type { TempoEvent, TimeSignatureEvent } from '../../types/project';

describe('tempoMap utilities', () => {
  describe('getTempoAtBeat', () => {
    it('returns fallback BPM when tempoMap is empty', () => {
      expect(getTempoAtBeat([], 0, 120)).toBe(120);
      expect(getTempoAtBeat([], 10, 140)).toBe(140);
    });

    it('returns fallback BPM when tempoMap is undefined', () => {
      expect(getTempoAtBeat(undefined, 5, 120)).toBe(120);
    });

    it('returns first event BPM at beat 0', () => {
      const map: TempoEvent[] = [{ beat: 0, bpm: 100 }];
      expect(getTempoAtBeat(map, 0, 120)).toBe(100);
    });

    it('returns correct BPM after a tempo change', () => {
      const map: TempoEvent[] = [
        { beat: 0, bpm: 100 },
        { beat: 8, bpm: 140 },
      ];
      expect(getTempoAtBeat(map, 0, 120)).toBe(100);
      expect(getTempoAtBeat(map, 4, 120)).toBe(100);
      expect(getTempoAtBeat(map, 8, 120)).toBe(140);
      expect(getTempoAtBeat(map, 16, 120)).toBe(140);
    });

    it('returns fallback BPM before the first event', () => {
      const map: TempoEvent[] = [{ beat: 4, bpm: 160 }];
      expect(getTempoAtBeat(map, 0, 120)).toBe(120);
      expect(getTempoAtBeat(map, 3.99, 120)).toBe(120);
      expect(getTempoAtBeat(map, 4, 120)).toBe(160);
    });

    it('interpolates BPM during a ramp', () => {
      const map: TempoEvent[] = [
        { beat: 0, bpm: 100 },
        { beat: 8, bpm: 140, ramp: true },
      ];
      expect(getTempoAtBeat(map, 4, 120)).toBe(120);
      expect(getTempoAtBeat(map, 0, 120)).toBe(100);
      expect(getTempoAtBeat(map, 8, 120)).toBe(140);
    });
  });

  describe('beatToTime', () => {
    it('converts beats to seconds with constant tempo', () => {
      expect(beatToTime(4, [], 120)).toBeCloseTo(2.0);
      expect(beatToTime(0, [], 120)).toBe(0);
    });

    it('converts beats with a single tempo change', () => {
      const map: TempoEvent[] = [
        { beat: 0, bpm: 120 },
        { beat: 4, bpm: 60 },
      ];
      expect(beatToTime(4, map, 120)).toBeCloseTo(2.0);
      expect(beatToTime(8, map, 120)).toBeCloseTo(6.0);
    });

    it('converts beats with tempo ramp', () => {
      const map: TempoEvent[] = [
        { beat: 0, bpm: 60 },
        { beat: 4, bpm: 120, ramp: true },
      ];
      expect(beatToTime(4, map, 120)).toBeCloseTo(2.6667, 3);
    });

    it('handles empty tempoMap', () => {
      expect(beatToTime(8, undefined, 120)).toBeCloseTo(4.0);
    });
  });

  describe('timeToBeat', () => {
    it('converts time to beats with constant tempo', () => {
      expect(timeToBeat(2.0, [], 120)).toBeCloseTo(4);
    });

    it('inverts beatToTime with tempo changes', () => {
      const map: TempoEvent[] = [
        { beat: 0, bpm: 120 },
        { beat: 4, bpm: 60 },
      ];
      expect(timeToBeat(6.0, map, 120)).toBeCloseTo(8);
      expect(timeToBeat(2.0, map, 120)).toBeCloseTo(4);
    });

    it('handles empty tempoMap', () => {
      expect(timeToBeat(4.0, undefined, 120)).toBeCloseTo(8);
    });
  });

  describe('getTimeSignatureAtBar', () => {
    it('returns default when map is empty', () => {
      const result = getTimeSignatureAtBar([], 1, 4, 4);
      expect(result).toEqual({ numerator: 4, denominator: 4 });
    });

    it('returns changed time signature at the correct bar', () => {
      const map: TimeSignatureEvent[] = [
        { bar: 1, numerator: 4, denominator: 4 },
        { bar: 5, numerator: 3, denominator: 4 },
      ];
      expect(getTimeSignatureAtBar(map, 1, 4, 4)).toEqual({ numerator: 4, denominator: 4 });
      expect(getTimeSignatureAtBar(map, 4, 4, 4)).toEqual({ numerator: 4, denominator: 4 });
      expect(getTimeSignatureAtBar(map, 5, 4, 4)).toEqual({ numerator: 3, denominator: 4 });
      expect(getTimeSignatureAtBar(map, 10, 4, 4)).toEqual({ numerator: 3, denominator: 4 });
    });
  });

  describe('getBarAtBeat / getBeatAtBar', () => {
    it('returns correct bar for constant time signature', () => {
      expect(getBarAtBeat(0, [], 4)).toBe(1);
      expect(getBarAtBeat(3, [], 4)).toBe(1);
      expect(getBarAtBeat(4, [], 4)).toBe(2);
      expect(getBarAtBeat(7, [], 4)).toBe(2);
    });

    it('returns correct beat for a given bar with constant time signature', () => {
      expect(getBeatAtBar(1, [], 4)).toBe(0);
      expect(getBeatAtBar(2, [], 4)).toBe(4);
      expect(getBeatAtBar(3, [], 4)).toBe(8);
    });

    it('uses fallback denominator for constant signatures without a map', () => {
      expect(getBeatAtBar(2, [], 4, 8)).toBe(2);
      expect(getBarAtBeat(1.99, [], 4, 8)).toBe(1);
      expect(getBarAtBeat(2, [], 4, 8)).toBe(2);
    });

    it('handles time signature changes', () => {
      const map: TimeSignatureEvent[] = [
        { bar: 1, numerator: 4, denominator: 4 },
        { bar: 3, numerator: 3, denominator: 4 },
      ];
      expect(getBeatAtBar(1, map, 4)).toBe(0);
      expect(getBeatAtBar(2, map, 4)).toBe(4);
      expect(getBeatAtBar(3, map, 4)).toBe(8);
      expect(getBeatAtBar(4, map, 4)).toBe(11);

      expect(getBarAtBeat(0, map, 4)).toBe(1);
      expect(getBarAtBeat(7, map, 4)).toBe(2);
      expect(getBarAtBeat(8, map, 4)).toBe(3);
      expect(getBarAtBeat(10, map, 4)).toBe(3);
      expect(getBarAtBeat(11, map, 4)).toBe(4);
    });

    it('accounts for denominator changes using quarter-note beat space', () => {
      const map: TimeSignatureEvent[] = [
        { bar: 1, numerator: 6, denominator: 8 },
      ];

      expect(getBeatAtBar(1, map, 4)).toBe(0);
      expect(getBeatAtBar(2, map, 4)).toBe(3);
      expect(getBeatAtBar(3, map, 4)).toBe(6);

      expect(getBarAtBeat(0, map, 4)).toBe(1);
      expect(getBarAtBeat(2.99, map, 4)).toBe(1);
      expect(getBarAtBeat(3, map, 4)).toBe(2);
      expect(getBarAtBeat(5.99, map, 4)).toBe(2);
      expect(getBarAtBeat(6, map, 4)).toBe(3);
    });
  });
});
