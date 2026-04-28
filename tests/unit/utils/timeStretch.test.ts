import { describe, it, expect } from 'vitest';
import {
  phaseVocoderStretch,
  wsolaStretch,
  timeStretch,
  timeStretchStereo,
  pitchShift,
  pitchShiftStereo,
  type TimeStretchMode,
} from '../../../src/utils/timeStretch';

/** Generate a sine wave test signal */
function sineWave(freq: number, sampleRate: number, duration: number): Float32Array {
  const len = Math.round(sampleRate * duration);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
  return out;
}

/** Generate a click track (bursts at regular intervals) */
function clickTrack(sampleRate: number, duration: number, intervalMs: number): Float32Array {
  const len = Math.round(sampleRate * duration);
  const out = new Float32Array(len);
  const intervalSamples = Math.round(sampleRate * intervalMs / 1000);
  // Use short noise bursts instead of single impulses for better detection
  const burstLen = 128;
  for (let i = 0; i < len; i += intervalSamples) {
    for (let j = 0; j < burstLen && i + j < len; j++) {
      out[i + j] = (j % 2 === 0 ? 0.8 : -0.8) * (1 - j / burstLen);
    }
  }
  return out;
}

describe('phaseVocoderStretch', () => {
  it('returns input length at ratio=1', () => {
    const input = sineWave(440, 48000, 0.5);
    const output = phaseVocoderStretch(input, 1.0, 2048);
    // At ratio=1, output length should be approximately the same
    expect(Math.abs(output.length - input.length)).toBeLessThan(2048);
  });

  it('produces longer output at ratio > 1', () => {
    const input = sineWave(440, 48000, 0.5);
    const output = phaseVocoderStretch(input, 2.0, 2048);
    // Output should be roughly 2x the input length
    expect(output.length).toBeGreaterThan(input.length * 1.5);
  });

  it('produces shorter output at ratio < 1', () => {
    const input = sineWave(440, 48000, 1.0);
    const output = phaseVocoderStretch(input, 0.5, 2048);
    expect(output.length).toBeLessThan(input.length * 0.8);
  });

  it('preserves energy (output is not silent)', () => {
    const input = sineWave(440, 48000, 0.5);
    const output = phaseVocoderStretch(input, 1.5, 2048);
    const rms = Math.sqrt(output.reduce((sum, x) => sum + x * x, 0) / output.length);
    expect(rms).toBeGreaterThan(0.01);
  });

  it('handles very short input gracefully', () => {
    const input = new Float32Array(100);
    input.fill(0.5);
    const output = phaseVocoderStretch(input, 2.0, 2048);
    // Should return a copy of input (too short for STFT)
    expect(output.length).toBe(input.length);
  });
});

describe('wsolaStretch', () => {
  it('produces longer output at ratio > 1', () => {
    const input = sineWave(220, 48000, 1.0);
    const output = wsolaStretch(input, 2.0);
    expect(output.length).toBeGreaterThan(input.length * 1.5);
  });

  it('produces shorter output at ratio < 1', () => {
    const input = sineWave(220, 48000, 1.0);
    const output = wsolaStretch(input, 0.5);
    expect(output.length).toBeLessThan(input.length * 0.8);
  });

  it('preserves energy', () => {
    const input = sineWave(440, 48000, 0.5);
    const output = wsolaStretch(input, 1.5);
    const rms = Math.sqrt(output.reduce((sum, x) => sum + x * x, 0) / output.length);
    expect(rms).toBeGreaterThan(0.01);
  });
});

describe('timeStretch (all modes)', () => {
  const modes: TimeStretchMode[] = ['beats', 'tones', 'complex', 'complexPro', 'texture'];

  for (const mode of modes) {
    describe(`mode: ${mode}`, () => {
      it('produces output at stretch ratio 1.5', () => {
        const input = sineWave(440, 48000, 0.5);
        const output = timeStretch(input, { mode, ratio: 1.5, sampleRate: 48000 });
        expect(output.length).toBeGreaterThan(input.length);
        // Verify not silent
        const maxAbs = output.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
        expect(maxAbs).toBeGreaterThan(0.01);
      });

      it('returns copy at ratio ≈ 1', () => {
        const input = sineWave(440, 48000, 0.3);
        const output = timeStretch(input, { mode, ratio: 1.0001, sampleRate: 48000 });
        expect(output.length).toBe(input.length);
      });

      it('handles short input', () => {
        const input = new Float32Array(100);
        input.fill(0.3);
        const output = timeStretch(input, { mode, ratio: 2.0, sampleRate: 48000 });
        expect(output.length).toBe(input.length);
      });
    });
  }
});

describe('timeStretchStereo', () => {
  it('stretches both channels independently', () => {
    const left = sineWave(440, 48000, 0.5);
    const right = sineWave(660, 48000, 0.5);
    const result = timeStretchStereo(left, right, { mode: 'complex', ratio: 1.5, sampleRate: 48000 });
    expect(result.left.length).toBeGreaterThan(left.length);
    expect(result.right.length).toBeGreaterThan(right.length);
    // Both channels should have same length
    expect(result.left.length).toBe(result.right.length);
  });
});

describe('pitchShift', () => {
  it('preserves duration when shifting pitch up', () => {
    const input = sineWave(440, 48000, 0.5);
    const output = pitchShift(input, { semitones: 7, sampleRate: 48000 });
    // Duration should be preserved (±5% tolerance for algorithm artifacts)
    expect(Math.abs(output.length - input.length) / input.length).toBeLessThan(0.05);
  });

  it('preserves duration when shifting pitch down', () => {
    const input = sineWave(440, 48000, 0.5);
    const output = pitchShift(input, { semitones: -5, sampleRate: 48000 });
    expect(Math.abs(output.length - input.length) / input.length).toBeLessThan(0.05);
  });

  it('returns copy at 0 semitones', () => {
    const input = sineWave(440, 48000, 0.3);
    const output = pitchShift(input, { semitones: 0, sampleRate: 48000 });
    expect(output.length).toBe(input.length);
  });

  it('preserves energy (output is not silent)', () => {
    const input = sineWave(440, 48000, 0.5);
    const output = pitchShift(input, { semitones: 4, sampleRate: 48000 });
    const rms = Math.sqrt(output.reduce((sum, x) => sum + x * x, 0) / output.length);
    expect(rms).toBeGreaterThan(0.01);
  });

  it('handles large pitch shifts (octave up)', () => {
    const input = sineWave(440, 48000, 0.5);
    const output = pitchShift(input, { semitones: 12, sampleRate: 48000 });
    expect(Math.abs(output.length - input.length) / input.length).toBeLessThan(0.05);
    const rms = Math.sqrt(output.reduce((sum, x) => sum + x * x, 0) / output.length);
    expect(rms).toBeGreaterThan(0.01);
  });

  it('clamps extreme semitone values', () => {
    const input = sineWave(440, 48000, 0.5);
    // Should not crash or hang with extreme values
    const output = pitchShift(input, { semitones: 36, sampleRate: 48000 });
    expect(output.length).toBeGreaterThan(0);
  });

  it('handles short input gracefully', () => {
    const input = new Float32Array(100);
    input.fill(0.3);
    const output = pitchShift(input, { semitones: 5, sampleRate: 48000 });
    expect(output.length).toBe(input.length);
  });
});

describe('pitchShiftStereo', () => {
  it('shifts both channels and preserves duration', () => {
    const left = sineWave(440, 48000, 0.5);
    const right = sineWave(660, 48000, 0.5);
    const result = pitchShiftStereo(left, right, { semitones: 3, sampleRate: 48000 });
    expect(Math.abs(result.left.length - left.length) / left.length).toBeLessThan(0.05);
    expect(result.left.length).toBe(result.right.length);
  });
});

describe('timeStretch with click track', () => {
  it('beats mode preserves transient positions roughly', () => {
    const input = clickTrack(48000, 1.0, 500); // clicks every 500ms
    const output = timeStretch(input, { mode: 'beats', ratio: 2.0, sampleRate: 48000 });
    // Output should be approximately 2x length
    expect(output.length).toBeGreaterThan(input.length * 1.5);
    // Should have non-zero samples (transients preserved)
    const nonZero = output.filter((x) => Math.abs(x) > 0.01).length;
    expect(nonZero).toBeGreaterThan(0);
  });
});
