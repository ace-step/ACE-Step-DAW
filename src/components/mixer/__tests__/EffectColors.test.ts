import { describe, it, expect } from 'vitest';
import { EFFECT_COLORS } from '../EffectCards';

describe('EFFECT_COLORS', () => {
  it('has unique colors for every effect type (no duplicates)', () => {
    const values = Object.values(EFFECT_COLORS);
    const unique = new Set(values);
    const duplicates: string[] = [];
    const seen = new Map<string, string>();
    for (const [type, color] of Object.entries(EFFECT_COLORS)) {
      if (seen.has(color)) {
        duplicates.push(`${type} duplicates ${seen.get(color)} (${color})`);
      }
      seen.set(color, type);
    }
    expect(duplicates).toEqual([]);
    expect(unique.size).toBe(values.length);
  });

  it('covers all expected effect types', () => {
    const expectedTypes = [
      'eq3', 'parametricEq', 'compressor', 'reverb', 'delay',
      'distortion', 'filter', 'chorus', 'flanger', 'phaser',
      'convolver', 'gate', 'deesser', 'transientShaper', 'limiter',
      'saturation', 'stereoImager', 'algorithmicReverb', 'noiseReduction',
    ];
    for (const type of expectedTypes) {
      expect(EFFECT_COLORS).toHaveProperty(type);
      expect(typeof (EFFECT_COLORS as Record<string, string>)[type]).toBe('string');
    }
  });

  it('all colors are valid hex codes', () => {
    const hexRegex = /^#[0-9a-fA-F]{6}$/;
    for (const [type, color] of Object.entries(EFFECT_COLORS)) {
      expect(color, `${type} has invalid color: ${color}`).toMatch(hexRegex);
    }
  });

  it('groups related effects in similar hue families', () => {
    // EQ family should be in blue range
    const eqColors = [EFFECT_COLORS.eq3, EFFECT_COLORS.parametricEq];
    for (const c of eqColors) {
      const r = parseInt(c.slice(1, 3), 16);
      const b = parseInt(c.slice(5, 7), 16);
      expect(b, `EQ color ${c} should have blue > red`).toBeGreaterThan(r);
    }

    // Dynamics family should be in warm amber range
    const dynColors = [EFFECT_COLORS.compressor, EFFECT_COLORS.gate, EFFECT_COLORS.limiter];
    for (const c of dynColors) {
      const r = parseInt(c.slice(1, 3), 16);
      const b = parseInt(c.slice(5, 7), 16);
      expect(r, `Dynamics color ${c} should have red > blue`).toBeGreaterThan(b);
    }
  });
});
