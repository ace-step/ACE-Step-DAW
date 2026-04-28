import { describe, it, expect } from 'vitest';
import {
  getEffectAutomationSpec,
  getEffectAutomationColor,
  getEffectAutomationLabel,
  normalizeEffectParamValue,
  denormalizeEffectParamValue,
} from '../effectAutomation';

describe('getEffectAutomationSpec', () => {
  it('returns spec for known effect param', () => {
    const spec = getEffectAutomationSpec('compressor', 'threshold');
    expect(spec).not.toBeNull();
    expect(spec!.label).toBe('Threshold');
    expect(spec!.min).toBe(-60);
    expect(spec!.max).toBe(0);
  });

  it('returns null for unknown param', () => {
    expect(getEffectAutomationSpec('compressor', 'nonexistent')).toBeNull();
  });

  it('returns spec for reverb decay', () => {
    const spec = getEffectAutomationSpec('reverb', 'decay');
    expect(spec!.min).toBe(0.1);
    expect(spec!.max).toBe(10);
  });

  it('returns null for parametricEq (empty spec)', () => {
    expect(getEffectAutomationSpec('parametricEq', 'anything')).toBeNull();
  });
});

describe('getEffectAutomationColor', () => {
  it('returns green for mixer volume', () => {
    expect(getEffectAutomationColor({
      type: 'mixer',
      param: 'volume',
    } as never)).toBe('#22c55e');
  });

  it('returns blue for mixer pan', () => {
    expect(getEffectAutomationColor({
      type: 'mixer',
      param: 'pan',
    } as never)).toBe('#3b82f6');
  });

  it('returns orange for send', () => {
    expect(getEffectAutomationColor({
      type: 'send',
      param: 'level',
    } as never)).toBe('#f97316');
  });

  it('returns effect color for known effect param', () => {
    const color = getEffectAutomationColor({
      type: 'effect',
      effectType: 'compressor',
      param: 'threshold',
    } as never);
    expect(color).toBe('#c4993b');
  });

  it('returns fallback purple for unknown effect param', () => {
    const color = getEffectAutomationColor({
      type: 'effect',
      effectType: 'parametricEq',
      param: 'unknown',
    } as never);
    expect(color).toBe('#8b5cf6');
  });
});

describe('getEffectAutomationLabel', () => {
  it('returns label for known param', () => {
    expect(getEffectAutomationLabel('delay', 'feedback')).toBe('Feedback');
  });

  it('returns param name as fallback', () => {
    expect(getEffectAutomationLabel('distortion', 'unknown')).toBe('unknown');
  });
});

describe('normalizeEffectParamValue', () => {
  it('normalizes to 0-1 range', () => {
    // Compressor threshold: -60 to 0
    expect(normalizeEffectParamValue('compressor', 'threshold', -60)).toBeCloseTo(0, 5);
    expect(normalizeEffectParamValue('compressor', 'threshold', 0)).toBeCloseTo(1, 5);
    expect(normalizeEffectParamValue('compressor', 'threshold', -30)).toBeCloseTo(0.5, 5);
  });

  it('clamps values outside range', () => {
    expect(normalizeEffectParamValue('compressor', 'threshold', -100)).toBe(0);
    expect(normalizeEffectParamValue('compressor', 'threshold', 10)).toBe(1);
  });

  it('returns null for unknown param', () => {
    expect(normalizeEffectParamValue('reverb', 'nonexistent', 0.5)).toBeNull();
  });
});

describe('denormalizeEffectParamValue', () => {
  it('maps 0-1 to actual range', () => {
    // Compressor threshold: -60 to 0
    expect(denormalizeEffectParamValue('compressor', 'threshold', 0)).toBe(-60);
    expect(denormalizeEffectParamValue('compressor', 'threshold', 1)).toBe(0);
    expect(denormalizeEffectParamValue('compressor', 'threshold', 0.5)).toBe(-30);
  });

  it('clamps normalized values', () => {
    expect(denormalizeEffectParamValue('compressor', 'threshold', -1)).toBe(-60);
    expect(denormalizeEffectParamValue('compressor', 'threshold', 2)).toBe(0);
  });

  it('returns null for unknown param', () => {
    expect(denormalizeEffectParamValue('reverb', 'nonexistent', 0.5)).toBeNull();
  });

  it('roundtrips with normalize', () => {
    const original = -20;
    const normalized = normalizeEffectParamValue('compressor', 'threshold', original);
    const denormalized = denormalizeEffectParamValue('compressor', 'threshold', normalized!);
    expect(denormalized).toBeCloseTo(original, 5);
  });
});
