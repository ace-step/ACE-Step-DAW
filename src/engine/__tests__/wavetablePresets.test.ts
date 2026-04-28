import { describe, it, expect } from 'vitest';
import {
  interpolatePartials,
  computePartialsAtPosition,
  WAVETABLE_PRESETS,
  getWavetablePresetById,
  WAVEFORM_SINE,
  WAVEFORM_SAW,
  WAVEFORM_SQUARE,
  WAVEFORM_TRIANGLE,
} from '../wavetablePresets';

describe('interpolatePartials', () => {
  it('returns first array when t = 0', () => {
    const a = [1, 0.5, 0.25];
    const b = [0, 1, 0.75];
    const result = interpolatePartials(a, b, 0);
    expect(result).toEqual([1, 0.5, 0.25]);
  });

  it('returns second array when t = 1', () => {
    const a = [1, 0.5, 0.25];
    const b = [0, 1, 0.75];
    const result = interpolatePartials(a, b, 1);
    expect(result).toEqual([0, 1, 0.75]);
  });

  it('interpolates at t = 0.5', () => {
    const a = [1, 0];
    const b = [0, 1];
    const result = interpolatePartials(a, b, 0.5);
    expect(result[0]).toBeCloseTo(0.5);
    expect(result[1]).toBeCloseTo(0.5);
  });

  it('handles arrays of different lengths by zero-padding shorter one', () => {
    const a = [1];
    const b = [0.5, 0.8, 0.3];
    const result = interpolatePartials(a, b, 0.5);
    expect(result).toHaveLength(3);
    expect(result[0]).toBeCloseTo(0.75); // (1 + 0.5) / 2
    expect(result[1]).toBeCloseTo(0.4);  // (0 + 0.8) / 2
    expect(result[2]).toBeCloseTo(0.15); // (0 + 0.3) / 2
  });

  it('handles empty arrays', () => {
    expect(interpolatePartials([], [], 0.5)).toEqual([]);
    expect(interpolatePartials([], [1, 2], 0.5)).toEqual([0.5, 1]);
  });
});

describe('computePartialsAtPosition', () => {
  it('returns [1] fallback for empty waveforms array', () => {
    expect(computePartialsAtPosition([], 0.5)).toEqual([1]);
  });

  it('returns the single waveform partials when only one waveform exists', () => {
    const result = computePartialsAtPosition([WAVEFORM_SINE], 0.5);
    expect(result).toEqual([1]);
  });

  it('returns first waveform partials at position 0 (zero-padded to max length)', () => {
    const a = { name: 'A', partials: [1, 0.5] };
    const b = { name: 'B', partials: [0, 1] };
    const result = computePartialsAtPosition([a, b], 0);
    expect(result).toEqual([1, 0.5]);
  });

  it('returns last waveform at position 1', () => {
    const waveforms = [WAVEFORM_SINE, WAVEFORM_SAW];
    const result = computePartialsAtPosition(waveforms, 1);
    expect(result).toEqual(WAVEFORM_SAW.partials);
  });

  it('blends two waveforms at position 0.5 with two waveforms', () => {
    const a = { name: 'A', partials: [1, 0] };
    const b = { name: 'B', partials: [0, 1] };
    const result = computePartialsAtPosition([a, b], 0.5);
    expect(result[0]).toBeCloseTo(0.5);
    expect(result[1]).toBeCloseTo(0.5);
  });

  it('selects correct pair with 3+ waveforms', () => {
    const a = { name: 'A', partials: [1] };
    const b = { name: 'B', partials: [0.5] };
    const c = { name: 'C', partials: [0] };
    // position 0.75 with 3 waveforms: scaled = 0.75 * 2 = 1.5, indexA=1, indexB=2, t=0.5
    const result = computePartialsAtPosition([a, b, c], 0.75);
    expect(result[0]).toBeCloseTo(0.25); // 0.5 + (0 - 0.5) * 0.5
  });

  it('clamps position to [0, 1]', () => {
    const a = { name: 'A', partials: [1, 0.5] };
    const b = { name: 'B', partials: [0, 1] };
    const resultNeg = computePartialsAtPosition([a, b], -0.5);
    expect(resultNeg).toEqual([1, 0.5]);
    const resultOver = computePartialsAtPosition([a, b], 1.5);
    expect(resultOver).toEqual([0, 1]);
  });
});

describe('factory wavetable presets', () => {
  it('has exactly 5 presets', () => {
    expect(WAVETABLE_PRESETS).toHaveLength(5);
  });

  it('each preset has a unique id', () => {
    const ids = WAVETABLE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(5);
  });

  it('each preset has at least 2 waveforms', () => {
    for (const preset of WAVETABLE_PRESETS) {
      expect(preset.settings.waveforms.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('each preset has valid position and morphSpeed', () => {
    for (const preset of WAVETABLE_PRESETS) {
      expect(preset.settings.position).toBeGreaterThanOrEqual(0);
      expect(preset.settings.position).toBeLessThanOrEqual(1);
      expect(preset.settings.morphSpeed).toBeGreaterThanOrEqual(0);
    }
  });

  it('each preset has valid ADSR envelope values', () => {
    for (const preset of WAVETABLE_PRESETS) {
      const env = preset.settings.ampEnvelope;
      expect(env.attack).toBeGreaterThan(0);
      expect(env.decay).toBeGreaterThan(0);
      expect(env.sustain).toBeGreaterThanOrEqual(0);
      expect(env.sustain).toBeLessThanOrEqual(1);
      expect(env.release).toBeGreaterThan(0);
    }
  });

  it('getWavetablePresetById returns correct preset', () => {
    const basic = getWavetablePresetById('wt-basic');
    expect(basic).not.toBeUndefined();
    expect(basic!.name).toBe('Basic');
  });

  it('getWavetablePresetById returns undefined for unknown id', () => {
    expect(getWavetablePresetById('nonexistent')).toBeUndefined();
  });
});

describe('factory waveforms', () => {
  it('WAVEFORM_SINE has only the fundamental', () => {
    expect(WAVEFORM_SINE.partials).toEqual([1]);
  });

  it('WAVEFORM_SAW has decreasing harmonics', () => {
    for (let i = 1; i < WAVEFORM_SAW.partials.length; i++) {
      expect(WAVEFORM_SAW.partials[i]).toBeLessThan(WAVEFORM_SAW.partials[i - 1]);
    }
  });

  it('WAVEFORM_SQUARE has zero values for even harmonics', () => {
    for (let i = 1; i < WAVEFORM_SQUARE.partials.length; i += 2) {
      expect(WAVEFORM_SQUARE.partials[i]).toBe(0);
    }
  });

  it('WAVEFORM_TRIANGLE has zero values for even harmonics', () => {
    for (let i = 1; i < WAVEFORM_TRIANGLE.partials.length; i += 2) {
      expect(WAVEFORM_TRIANGLE.partials[i]).toBe(0);
    }
  });
});
