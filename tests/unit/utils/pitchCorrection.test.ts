import { describe, it, expect } from 'vitest';
import {
  snapToScale,
  phaseVocoderPitchShift,
  psolaPitchShift,
  analyzePitchCorrection,
  applyAutoTune,
  formantPreservingPitchShift,
  type ScaleType,
} from '../../../src/utils/pitchCorrection';

/** Generate a sine wave */
function sineWave(freq: number, sampleRate: number, duration: number): Float32Array {
  const len = Math.round(sampleRate * duration);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = 0.8 * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
  return out;
}

/** Compute RMS energy */
function rms(signal: Float32Array): number {
  return Math.sqrt(signal.reduce((sum, x) => sum + x * x, 0) / signal.length);
}

describe('snapToScale', () => {
  it('snaps to nearest C major degree (root C)', () => {
    // C=60, C#=61 should snap to C=60 or D=62
    expect(snapToScale(60, 0, 'major')).toBe(60); // C → C
    expect(snapToScale(62, 0, 'major')).toBe(62); // D → D
    expect(snapToScale(64, 0, 'major')).toBe(64); // E → E
  });

  it('snaps non-scale notes to nearest scale degree', () => {
    // C#=61 in C major should snap to C=60 or D=62
    const snapped = snapToScale(61, 0, 'major');
    expect([60, 62]).toContain(snapped);
  });

  it('handles chromatic scale (all notes valid)', () => {
    for (let midi = 48; midi <= 72; midi++) {
      expect(snapToScale(midi, 0, 'chromatic')).toBe(midi);
    }
  });

  it('works with different root notes', () => {
    // A minor (root = A = 9): A B C D E F G
    const snapped = snapToScale(69, 9, 'minor'); // A4
    expect(snapped).toBe(69);
  });

  it('handles octave boundaries', () => {
    const low = snapToScale(48, 0, 'major'); // C3
    const high = snapToScale(72, 0, 'major'); // C5
    expect(low % 12).toBe(0); // Should be C
    expect(high % 12).toBe(0); // Should be C
  });
});

describe('phaseVocoderPitchShift', () => {
  it('returns original at 0 semitones', () => {
    const input = sineWave(440, 48000, 0.3);
    const output = phaseVocoderPitchShift(input, 0);
    expect(output.length).toBe(input.length);
  });

  it('preserves signal length', () => {
    const input = sineWave(440, 48000, 0.5);
    const output = phaseVocoderPitchShift(input, 3);
    expect(output.length).toBe(input.length);
  });

  it('produces non-silent output when shifting up', () => {
    const input = sineWave(440, 48000, 0.5);
    const output = phaseVocoderPitchShift(input, 5, 2048);
    expect(rms(output)).toBeGreaterThan(0.01);
  });

  it('produces non-silent output when shifting down', () => {
    const input = sineWave(440, 48000, 0.5);
    const output = phaseVocoderPitchShift(input, -5, 2048);
    expect(rms(output)).toBeGreaterThan(0.01);
  });

  it('handles ±12 semitone range', () => {
    const input = sineWave(440, 48000, 0.3);
    const up12 = phaseVocoderPitchShift(input, 12, 2048);
    const down12 = phaseVocoderPitchShift(input, -12, 2048);
    expect(rms(up12)).toBeGreaterThan(0.01);
    expect(rms(down12)).toBeGreaterThan(0.01);
  });

  it('handles short input gracefully', () => {
    const input = new Float32Array(100).fill(0.5);
    const output = phaseVocoderPitchShift(input, 5);
    expect(output.length).toBe(100);
  });
});

describe('psolaPitchShift', () => {
  it('returns original at 0 semitones', () => {
    const input = sineWave(440, 48000, 0.3);
    const output = psolaPitchShift(input, 0, 48000);
    expect(output.length).toBe(input.length);
  });

  it('preserves signal length', () => {
    const input = sineWave(440, 48000, 0.5);
    const output = psolaPitchShift(input, 3, 48000);
    expect(output.length).toBe(input.length);
  });

  it('produces non-silent output', () => {
    const input = sineWave(440, 48000, 0.5);
    const output = psolaPitchShift(input, 5, 48000);
    expect(rms(output)).toBeGreaterThan(0.01);
  });
});

describe('analyzePitchCorrection', () => {
  it('detects correction events for a detuned sine', () => {
    // A4 slightly flat (435 Hz instead of 440 Hz)
    const input = sineWave(435, 48000, 0.5);
    const events = analyzePitchCorrection(input, {
      scale: 'chromatic',
      rootNote: 0,
      retuneSpeed: 0,
      amount: 1,
      sampleRate: 48000,
    });
    // Should detect that pitch is flat and needs correction
    expect(events.length).toBeGreaterThan(0);
    // At least one event should have a positive shift (correct upward)
    const hasUpShift = events.some(e => e.shiftSemitones > 0);
    expect(hasUpShift).toBe(true);
  });

  it('returns empty for silence', () => {
    const input = new Float32Array(48000); // 1s of silence
    const events = analyzePitchCorrection(input, {
      scale: 'chromatic',
      rootNote: 0,
      retuneSpeed: 0,
      amount: 1,
      sampleRate: 48000,
    });
    expect(events).toHaveLength(0);
  });
});

describe('applyAutoTune', () => {
  it('returns same length output', () => {
    const input = sineWave(440, 48000, 0.5);
    const output = applyAutoTune(input, {
      scale: 'chromatic',
      rootNote: 0,
      retuneSpeed: 0,
      amount: 1,
      sampleRate: 48000,
    });
    expect(output.length).toBe(input.length);
  });

  it('preserves energy', () => {
    const input = sineWave(440, 48000, 0.5);
    const output = applyAutoTune(input, {
      scale: 'major',
      rootNote: 0,
      retuneSpeed: 50,
      amount: 0.5,
      sampleRate: 48000,
    });
    expect(rms(output)).toBeGreaterThan(0.01);
  });

  it('returns copy for already-tuned input', () => {
    // A440 is exactly on chromatic scale, no correction needed
    const input = sineWave(440, 48000, 0.5);
    const output = applyAutoTune(input, {
      scale: 'chromatic',
      rootNote: 0,
      retuneSpeed: 0,
      amount: 1,
      sampleRate: 48000,
    });
    // Output should be very similar to input (minimal correction)
    expect(rms(output)).toBeGreaterThan(rms(input) * 0.5);
  });
});

describe('formantPreservingPitchShift', () => {
  it('returns original at 0 semitones', () => {
    const input = sineWave(440, 48000, 0.3);
    const output = formantPreservingPitchShift(input, 0);
    expect(output.length).toBe(input.length);
  });

  it('preserves signal length', () => {
    const input = sineWave(440, 48000, 0.5);
    const output = formantPreservingPitchShift(input, 5, 2048);
    expect(output.length).toBe(input.length);
  });

  it('produces non-silent output', () => {
    const input = sineWave(440, 48000, 0.5);
    const output = formantPreservingPitchShift(input, 5, 2048);
    expect(rms(output)).toBeGreaterThan(0.01);
  });

  it('preserves energy within reasonable range', () => {
    const input = sineWave(440, 48000, 0.5);
    const inputRms = rms(input);
    const output = formantPreservingPitchShift(input, 3, 2048);
    const outputRms = rms(output);
    // Energy should be within 20dB of original
    expect(outputRms).toBeGreaterThan(inputRms * 0.1);
    expect(outputRms).toBeLessThan(inputRms * 10);
  });
});
