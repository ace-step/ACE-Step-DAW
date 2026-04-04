import { describe, it, expect } from 'vitest';
import { EFFECT_COLORS } from '../../../src/components/mixer/EffectCards';

describe('EFFECT_COLORS', () => {
  it('has no duplicate colors', () => {
    const values = Object.values(EFFECT_COLORS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('all values are valid hex colors', () => {
    for (const [key, color] of Object.entries(EFFECT_COLORS)) {
      expect(color, `${key} should be a valid hex color`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('saturation and distortion have different colors', () => {
    expect(EFFECT_COLORS.saturation).not.toBe(EFFECT_COLORS.distortion);
  });

  it('saturation color is correct (#b87060)', () => {
    expect(EFFECT_COLORS.saturation).toBe('#b87060');
  });

  it('covers all expected effect types', () => {
    const expectedTypes = [
      'eq3', 'parametricEq',
      'compressor', 'gate', 'deesser', 'transientShaper', 'limiter',
      'reverb', 'delay', 'convolver', 'algorithmicReverb',
      'filter', 'chorus', 'flanger', 'phaser',
      'distortion', 'saturation',
      'stereoImager', 'noiseReduction',
    ];
    for (const type of expectedTypes) {
      expect(EFFECT_COLORS).toHaveProperty(type);
    }
  });
});
