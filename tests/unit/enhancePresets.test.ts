import { describe, it, expect } from 'vitest';
import {
  ENHANCE_PRESETS,
  surpriseMe,
  type EnhancePreset,
} from '../../src/constants/enhancePresets';

describe('ENHANCE_PRESETS data structure', () => {
  it('has at least 10 presets', () => {
    expect(ENHANCE_PRESETS.length).toBeGreaterThanOrEqual(10);
  });

  it('every preset has unique id', () => {
    const ids = ENHANCE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every preset has required fields', () => {
    for (const preset of ENHANCE_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.label).toBeTruthy();
      expect(preset.icon).toBeTruthy();
      expect(preset.caption).toBeTruthy();
      expect(['low', 'medium', 'high']).toContain(preset.consistency);
      expect(preset.tags.length).toBeGreaterThan(0);
    }
  });

  it('every preset caption is a non-empty string', () => {
    for (const preset of ENHANCE_PRESETS) {
      expect(typeof preset.caption).toBe('string');
      expect(preset.caption.length).toBeGreaterThan(10);
    }
  });

  it('every preset has at least one tag', () => {
    for (const preset of ENHANCE_PRESETS) {
      expect(preset.tags.length).toBeGreaterThanOrEqual(1);
      for (const tag of preset.tags) {
        expect(typeof tag).toBe('string');
        expect(tag.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('surpriseMe', () => {
  it('returns a caption and consistency', () => {
    const result = surpriseMe();
    expect(typeof result.caption).toBe('string');
    expect(result.caption.length).toBeGreaterThan(0);
    expect(['low', 'medium']).toContain(result.consistency);
  });

  it('never returns high consistency', () => {
    // Run many times with different random seeds
    for (let i = 0; i < 50; i++) {
      const result = surpriseMe(ENHANCE_PRESETS, () => i / 50);
      expect(result.consistency).not.toBe('high');
    }
  });

  it('returns a single preset caption when randomFn < 0.4 is false (no combine)', () => {
    // randomFn returns 0.5 for shouldCombine check (> 0.4, no combine)
    // then 0.5 for consistency (medium)
    // then 0.0 for index (first preset)
    let callIdx = 0;
    const values = [0.5, 0.5, 0.0];
    const result = surpriseMe(ENHANCE_PRESETS, () => values[callIdx++] ?? 0);
    expect(result.caption).toBe(ENHANCE_PRESETS[0].caption);
    expect(result.consistency).toBe('medium');
  });

  it('combines two preset captions when randomFn < 0.4 is true', () => {
    // randomFn returns 0.1 for shouldCombine check (< 0.4, combine)
    // then 0.5 for consistency (medium)
    // then values for idxA and idxB
    let callIdx = 0;
    const n = ENHANCE_PRESETS.length;
    const values = [0.1, 0.5, 0.0, 1 / (n - 1)];
    const result = surpriseMe(ENHANCE_PRESETS, () => values[callIdx++] ?? 0);
    expect(result.caption).toContain(ENHANCE_PRESETS[0].caption);
    expect(result.caption).toContain(', ');
  });

  it('handles empty presets array', () => {
    const result = surpriseMe([]);
    expect(result.caption).toBe('');
    expect(result.consistency).toBe('medium');
  });

  it('handles single preset array', () => {
    const single: EnhancePreset[] = [ENHANCE_PRESETS[0]];
    const result = surpriseMe(single, () => 0.3);
    expect(result.caption).toBe(ENHANCE_PRESETS[0].caption);
  });

  it('returns low consistency when randomFn < 0.5 on consistency roll', () => {
    // shouldCombine = 0.5 (no combine), consistency = 0.3 (< 0.5 => low), idx = 0
    let callIdx = 0;
    const values = [0.5, 0.3, 0.0];
    const result = surpriseMe(ENHANCE_PRESETS, () => values[callIdx++] ?? 0);
    expect(result.consistency).toBe('low');
  });
});
