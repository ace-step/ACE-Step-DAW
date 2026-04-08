import { describe, it, expect } from 'vitest';
import { EFFECT_COLORS, resolveEffectColor } from '../effectColors';
import type { TrackEffectType } from '../../../../types/project';

describe('effectColors', () => {
  it('defines a color for every effect type', () => {
    const expectedTypes: TrackEffectType[] = [
      'eq3', 'parametricEq', 'compressor', 'gate', 'deesser', 'transientShaper',
      'limiter', 'reverb', 'delay', 'convolver', 'algorithmicReverb', 'filter',
      'chorus', 'flanger', 'phaser', 'distortion', 'saturation', 'stereoImager',
      'noiseReduction', 'spectralFreeze', 'spectralBlur', 'spectralFilter', 'spectralMorph',
    ];
    for (const type of expectedTypes) {
      expect(EFFECT_COLORS[type]).toBeDefined();
      expect(EFFECT_COLORS[type]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('groups EQ family as cool blue', () => {
    expect(EFFECT_COLORS.eq3).toMatch(/^#[56][0-9a-f]/i);
    expect(EFFECT_COLORS.parametricEq).toMatch(/^#[67][0-9a-f]/i);
  });

  it('groups dynamics family as warm amber', () => {
    expect(EFFECT_COLORS.compressor).toMatch(/^#[bc][0-9a-f]/i);
    expect(EFFECT_COLORS.limiter).toMatch(/^#[cd][0-9a-f]/i);
  });

  describe('resolveEffectColor', () => {
    it('returns fallback hex when CSS custom property is empty', () => {
      // In jsdom, getComputedStyle returns empty strings for custom properties,
      // so resolveEffectColor falls back to the EFFECT_COLORS constant
      const color = resolveEffectColor('compressor');
      expect(color).toBe(EFFECT_COLORS.compressor);
    });

    it('returns a valid hex color for each type', () => {
      for (const type of Object.keys(EFFECT_COLORS) as TrackEffectType[]) {
        const color = resolveEffectColor(type);
        expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });
  });
});
