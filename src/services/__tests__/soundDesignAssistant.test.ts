import { describe, it, expect } from 'vitest';
import {
  SOUND_DESCRIPTORS,
  parseSoundDescription,
  generateVariations,
} from '../soundDesignAssistant';

describe('SOUND_DESCRIPTORS', () => {
  it('defines at least 10 descriptors', () => {
    expect(Object.keys(SOUND_DESCRIPTORS).length).toBeGreaterThanOrEqual(10);
  });

  it('each descriptor has at least one adjustment', () => {
    for (const [key, adjustments] of Object.entries(SOUND_DESCRIPTORS)) {
      expect(adjustments.length, `${key} should have adjustments`).toBeGreaterThan(0);
    }
  });

  it('all adjustments have required fields', () => {
    for (const adjustments of Object.values(SOUND_DESCRIPTORS)) {
      for (const adj of adjustments) {
        expect(adj.parameter).toBeTruthy();
        expect(typeof adj.delta).toBe('number');
        expect(adj.description).toBeTruthy();
      }
    }
  });
});

describe('parseSoundDescription', () => {
  it('returns empty array for unrecognized input', () => {
    expect(parseSoundDescription('xyz123')).toEqual([]);
  });

  it('parses a single descriptor', () => {
    const result = parseSoundDescription('warmer');
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((a) => a.parameter === 'filter.cutoffHz')).toBe(true);
  });

  it('handles case insensitivity', () => {
    const lower = parseSoundDescription('brighter');
    const upper = parseSoundDescription('BRIGHTER');
    expect(lower.length).toBe(upper.length);
    expect(lower[0].delta).toBe(upper[0].delta);
  });

  it('applies intensifier "much"', () => {
    const normal = parseSoundDescription('warmer');
    const amplified = parseSoundDescription('much warmer');
    const cutoffNormal = normal.find((a) => a.parameter === 'filter.cutoffHz');
    const cutoffAmplified = amplified.find((a) => a.parameter === 'filter.cutoffHz');
    expect(cutoffAmplified!.delta).toBe(cutoffNormal!.delta * 1.5);
  });

  it('applies intensifier "slightly"', () => {
    const normal = parseSoundDescription('brighter');
    const reduced = parseSoundDescription('slightly brighter');
    const cutoffNormal = normal.find((a) => a.parameter === 'filter.cutoffHz');
    const cutoffReduced = reduced.find((a) => a.parameter === 'filter.cutoffHz');
    expect(cutoffReduced!.delta).toBe(cutoffNormal!.delta * 0.5);
  });

  it('sums deltas for overlapping parameters across descriptors', () => {
    // "warmer" lowers cutoff by -800, "darker" lowers cutoff by -1500
    const result = parseSoundDescription('warmer darker');
    const cutoff = result.find((a) => a.parameter === 'filter.cutoffHz');
    expect(cutoff!.delta).toBe(-800 + -1500);
  });

  it('combines non-overlapping adjustments from multiple descriptors', () => {
    const result = parseSoundDescription('fatter sharper');
    const params = result.map((a) => a.parameter);
    expect(params).toContain('oscillator.detuneCents');
    expect(params).toContain('ampEnvelope.attack');
  });

  it('trims whitespace', () => {
    const result = parseSoundDescription('  warmer  ');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('generateVariations', () => {
  const baseAdjustments = [
    { parameter: 'filter.cutoffHz', delta: 100, description: 'test cutoff' },
    { parameter: 'ampEnvelope.attack', delta: 0.1, description: 'test attack' },
  ];

  it('generates requested number of variations', () => {
    const result = generateVariations(baseAdjustments, 3);
    expect(result).toHaveLength(3);
  });

  it('caps at 10 variations', () => {
    const result = generateVariations(baseAdjustments, 20);
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it('handles zero count', () => {
    const result = generateVariations(baseAdjustments, 0);
    expect(result).toHaveLength(0);
  });

  it('each variation has a name and adjustments', () => {
    const result = generateVariations(baseAdjustments, 5);
    for (const variation of result) {
      expect(variation.name).toBeTruthy();
      expect(variation.adjustments.length).toBe(baseAdjustments.length);
    }
  });

  it('Brighter variation scales all deltas by 1.3', () => {
    const result = generateVariations(baseAdjustments, 1);
    expect(result[0].name).toBe('Brighter');
    expect(result[0].adjustments[0].delta).toBeCloseTo(100 * 1.3, 5);
  });

  it('defaults to 5 variations', () => {
    const result = generateVariations(baseAdjustments);
    expect(result).toHaveLength(5);
  });

  it('handles negative count gracefully', () => {
    const result = generateVariations(baseAdjustments, -3);
    expect(result).toHaveLength(0);
  });
});
