import { describe, it, expect } from 'vitest';
import {
  gainToDb,
  dbToGain,
  noteToFreq,
  freqToNote,
  lerp,
  cubicInterpolate,
  panToGains,
  rms,
  flushDenormal,
  clamp,
  smoothCoeff,
  ANTI_DENORMAL,
} from '../dsp-utils';

describe('gainToDb / dbToGain', () => {
  it('converts unity gain to 0 dB', () => {
    expect(gainToDb(1)).toBeCloseTo(0, 10);
  });

  it('converts 0 dB to unity gain', () => {
    expect(dbToGain(0)).toBeCloseTo(1, 10);
  });

  it('converts known values', () => {
    expect(gainToDb(2)).toBeCloseTo(6.0206, 3);
    expect(gainToDb(0.5)).toBeCloseTo(-6.0206, 3);
    expect(gainToDb(10)).toBeCloseTo(20, 3);
  });

  it('round-trips accurately', () => {
    for (const db of [-60, -20, -6, 0, 6, 20]) {
      expect(gainToDb(dbToGain(db))).toBeCloseTo(db, 8);
    }
  });

  it('returns -Infinity for gain <= 0', () => {
    expect(gainToDb(0)).toBe(-Infinity);
    expect(gainToDb(-1)).toBe(-Infinity);
  });
});

describe('noteToFreq / freqToNote', () => {
  it('A4 (MIDI 69) = 440 Hz', () => {
    expect(noteToFreq(69)).toBeCloseTo(440, 5);
  });

  it('converts known notes', () => {
    expect(noteToFreq(60)).toBeCloseTo(261.626, 2); // Middle C
    expect(noteToFreq(57)).toBeCloseTo(220, 2);     // A3
    expect(noteToFreq(81)).toBeCloseTo(880, 2);     // A5
  });

  it('round-trips accurately', () => {
    for (const note of [0, 36, 60, 69, 96, 127]) {
      expect(freqToNote(noteToFreq(note))).toBeCloseTo(note, 8);
    }
  });

  it('freqToNote returns fractional notes', () => {
    const freq = 450; // slightly above A4
    const note = freqToNote(freq);
    expect(note).toBeGreaterThan(69);
    expect(note).toBeLessThan(70);
  });
});

describe('lerp', () => {
  it('returns a at t=0', () => {
    expect(lerp(10, 20, 0)).toBe(10);
  });

  it('returns b at t=1', () => {
    expect(lerp(10, 20, 1)).toBe(20);
  });

  it('returns midpoint at t=0.5', () => {
    expect(lerp(0, 100, 0.5)).toBe(50);
  });
});

describe('cubicInterpolate', () => {
  it('returns y1 at t=0', () => {
    expect(cubicInterpolate(0, 1, 2, 3, 0)).toBeCloseTo(1, 10);
  });

  it('interpolates smoothly for a linear sequence', () => {
    // For a perfectly linear sequence, cubic should give linear result
    const result = cubicInterpolate(0, 1, 2, 3, 0.5);
    expect(result).toBeCloseTo(1.5, 5);
  });

  it('interpolates between samples', () => {
    const result = cubicInterpolate(0, 0, 1, 1, 0.5);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1);
  });
});

describe('panToGains', () => {
  it('center pan gives equal gains', () => {
    const [l, r] = panToGains(0);
    expect(l).toBeCloseTo(r, 10);
    // Both should be ~0.707 (1/√2)
    expect(l).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it('hard left gives [1, 0]', () => {
    const [l, r] = panToGains(-1);
    expect(l).toBeCloseTo(1, 10);
    expect(r).toBeCloseTo(0, 10);
  });

  it('hard right gives [0, 1]', () => {
    const [l, r] = panToGains(1);
    expect(l).toBeCloseTo(0, 10);
    expect(r).toBeCloseTo(1, 10);
  });

  it('maintains constant power (L²+R² ≈ 1)', () => {
    for (const pan of [-1, -0.5, 0, 0.5, 1]) {
      const [l, r] = panToGains(pan);
      expect(l * l + r * r).toBeCloseTo(1, 10);
    }
  });
});

describe('rms', () => {
  it('returns 0 for empty range', () => {
    expect(rms(new Float32Array(10), 0, 0)).toBe(0);
    expect(rms(new Float32Array(10), 5, 3)).toBe(0);
  });

  it('computes RMS of DC signal', () => {
    const buf = new Float32Array(128).fill(0.5);
    expect(rms(buf, 0, 128)).toBeCloseTo(0.5, 10);
  });

  it('computes RMS of known signal', () => {
    // Sine wave RMS = peak / √2
    const buf = new Float32Array(1000);
    for (let i = 0; i < 1000; i++) {
      buf[i] = Math.sin((2 * Math.PI * i) / 1000);
    }
    expect(rms(buf, 0, 1000)).toBeCloseTo(Math.SQRT1_2, 2);
  });

  it('respects from/to range', () => {
    const buf = new Float32Array(10);
    buf[3] = 1;
    buf[4] = 1;
    expect(rms(buf, 3, 5)).toBeCloseTo(1, 10);
    expect(rms(buf, 0, 3)).toBeCloseTo(0, 10);
  });
});

describe('flushDenormal', () => {
  it('returns 0 for denormal-sized values', () => {
    expect(flushDenormal(1e-20)).toBe(0);
    expect(flushDenormal(-1e-20)).toBe(0);
  });

  it('preserves normal values', () => {
    expect(flushDenormal(0.5)).toBe(0.5);
    expect(flushDenormal(-0.5)).toBe(-0.5);
    expect(flushDenormal(1e-10)).toBe(1e-10);
  });
});

describe('ANTI_DENORMAL', () => {
  it('is a very small positive number', () => {
    expect(ANTI_DENORMAL).toBeGreaterThan(0);
    expect(ANTI_DENORMAL).toBeLessThan(1e-15);
  });

  it('cancels itself in add/sub', () => {
    const x = 0.5;
    expect(x + ANTI_DENORMAL - ANTI_DENORMAL).toBe(x);
  });
});

describe('clamp', () => {
  it('clamps below minimum', () => {
    expect(clamp(-5, 0, 1)).toBe(0);
  });

  it('clamps above maximum', () => {
    expect(clamp(5, 0, 1)).toBe(1);
  });

  it('returns value in range', () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });

  it('handles equal min and max', () => {
    expect(clamp(5, 3, 3)).toBe(3);
  });
});

describe('smoothCoeff', () => {
  it('returns 0 for zero time', () => {
    expect(smoothCoeff(0, 44100)).toBe(0);
  });

  it('returns value between 0 and 1 for positive time', () => {
    const c = smoothCoeff(10, 44100);
    expect(c).toBeGreaterThan(0);
    expect(c).toBeLessThan(1);
  });

  it('longer time gives higher coefficient (slower smoothing)', () => {
    const fast = smoothCoeff(1, 44100);
    const slow = smoothCoeff(100, 44100);
    expect(slow).toBeGreaterThan(fast);
  });
});
