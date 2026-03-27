import { describe, it, expect } from 'vitest';
import {
  getEffectAutomationSpec,
  getEffectAutomationColor,
  getEffectAutomationLabel,
  normalizeEffectParamValue,
  denormalizeEffectParamValue,
  getNormalizedEffectAutomationValue,
} from '../effectAutomation';
import type {
  AutomationParameter,
  TrackEffect,
  AutomatableEffectTarget,
} from '../../types/project';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeEffect<T extends TrackEffect['type']>(
  type: T,
  params: Extract<TrackEffect, { type: T }>['params'],
): Extract<TrackEffect, { type: T }> {
  return { id: 'eff-1', type, enabled: true, params } as Extract<TrackEffect, { type: T }>;
}

// ─── getEffectAutomationSpec ────────────────────────────────────────────────

describe('getEffectAutomationSpec', () => {
  it('returns correct spec for eq3 low param', () => {
    const spec = getEffectAutomationSpec('eq3', 'low');
    expect(spec).not.toBeNull();
    expect(spec!.label).toBe('Low Gain');
    expect(spec!.min).toBe(-12);
    expect(spec!.max).toBe(12);
    expect(spec!.color).toBe('#22c55e');
  });

  it('returns correct spec for compressor threshold', () => {
    const spec = getEffectAutomationSpec('compressor', 'threshold');
    expect(spec!.label).toBe('Threshold');
    expect(spec!.min).toBe(-60);
    expect(spec!.max).toBe(0);
  });

  it('returns correct spec for reverb wet', () => {
    const spec = getEffectAutomationSpec('reverb', 'wet');
    expect(spec!.label).toBe('Dry/Wet');
    expect(spec!.min).toBe(0);
    expect(spec!.max).toBe(1);
  });

  it('returns correct spec for delay feedback', () => {
    const spec = getEffectAutomationSpec('delay', 'feedback');
    expect(spec!.max).toBe(0.95);
  });

  it('returns correct spec for distortion amount', () => {
    const spec = getEffectAutomationSpec('distortion', 'amount');
    expect(spec!.label).toBe('Amount');
    expect(spec!.min).toBe(0);
    expect(spec!.max).toBe(1);
  });

  it('returns correct spec for filter frequency', () => {
    const spec = getEffectAutomationSpec('filter', 'frequency');
    expect(spec!.label).toBe('Cutoff');
    expect(spec!.min).toBe(20);
    expect(spec!.max).toBe(20000);
  });

  it('returns correct spec for chorus depth', () => {
    const spec = getEffectAutomationSpec('chorus', 'depth');
    expect(spec!.label).toBe('Depth');
    expect(spec!.min).toBe(0);
    expect(spec!.max).toBe(1);
  });

  it('returns correct spec for flanger feedback (negative min)', () => {
    const spec = getEffectAutomationSpec('flanger', 'feedback');
    expect(spec!.min).toBe(-0.95);
    expect(spec!.max).toBe(0.95);
  });

  it('returns correct spec for phaser baseFrequency', () => {
    const spec = getEffectAutomationSpec('phaser', 'baseFrequency');
    expect(spec!.label).toBe('Base Freq');
    expect(spec!.min).toBe(100);
    expect(spec!.max).toBe(4000);
  });

  it('returns null for unknown param on a known effect type', () => {
    const spec = getEffectAutomationSpec('eq3', 'nonexistent');
    expect(spec).toBeNull();
  });

  it('returns null for parametricEq (empty spec)', () => {
    const spec = getEffectAutomationSpec('parametricEq', 'anything');
    expect(spec).toBeNull();
  });
});

// ─── getEffectAutomationColor ───────────────────────────────────────────────

describe('getEffectAutomationColor', () => {
  it('returns green for mixer volume', () => {
    const param: AutomationParameter = { type: 'mixer', param: 'volume' };
    expect(getEffectAutomationColor(param)).toBe('#22c55e');
  });

  it('returns blue for mixer pan', () => {
    const param: AutomationParameter = { type: 'mixer', param: 'pan' };
    expect(getEffectAutomationColor(param)).toBe('#3b82f6');
  });

  it('returns orange for send parameter', () => {
    const param: AutomationParameter = { type: 'send', sendIndex: 0, param: 'amount' };
    expect(getEffectAutomationColor(param)).toBe('#f97316');
  });

  it('returns effect-specific color for known effect param', () => {
    const param: AutomationParameter = {
      type: 'effect',
      effectId: 'e1',
      effectType: 'reverb',
      param: 'decay',
    };
    expect(getEffectAutomationColor(param)).toBe('#8b5cf6');
  });

  it('returns fallback purple for unknown effect param', () => {
    const param: AutomationParameter = {
      type: 'effect',
      effectId: 'e1',
      effectType: 'parametricEq',
      param: 'unknown' as any,
    };
    expect(getEffectAutomationColor(param)).toBe('#8b5cf6');
  });
});

// ─── getEffectAutomationLabel ───────────────────────────────────────────────

describe('getEffectAutomationLabel', () => {
  it('returns human-readable label for known param', () => {
    expect(getEffectAutomationLabel('compressor', 'ratio')).toBe('Ratio');
  });

  it('returns the raw param name for unknown param', () => {
    expect(getEffectAutomationLabel('eq3', 'unknownParam')).toBe('unknownParam');
  });

  it('returns label for filter resonance', () => {
    expect(getEffectAutomationLabel('filter', 'resonance')).toBe('Resonance');
  });
});

// ─── normalizeEffectParamValue ──────────────────────────────────────────────

describe('normalizeEffectParamValue', () => {
  it('normalizes min value to 0', () => {
    // eq3 low: min=-12, max=12
    expect(normalizeEffectParamValue('eq3', 'low', -12)).toBe(0);
  });

  it('normalizes max value to 1', () => {
    expect(normalizeEffectParamValue('eq3', 'low', 12)).toBe(1);
  });

  it('normalizes midpoint correctly', () => {
    // eq3 low: min=-12, max=12 -> mid=0 -> (0-(-12))/(12-(-12)) = 12/24 = 0.5
    expect(normalizeEffectParamValue('eq3', 'low', 0)).toBe(0.5);
  });

  it('clamps values below min to 0', () => {
    expect(normalizeEffectParamValue('eq3', 'low', -100)).toBe(0);
  });

  it('clamps values above max to 1', () => {
    expect(normalizeEffectParamValue('eq3', 'low', 100)).toBe(1);
  });

  it('returns null for unknown param', () => {
    expect(normalizeEffectParamValue('eq3', 'nonexistent', 5)).toBeNull();
  });

  it('handles reverb wet (0 to 1 range)', () => {
    expect(normalizeEffectParamValue('reverb', 'wet', 0.5)).toBe(0.5);
    expect(normalizeEffectParamValue('reverb', 'wet', 0)).toBe(0);
    expect(normalizeEffectParamValue('reverb', 'wet', 1)).toBe(1);
  });

  it('handles filter frequency (20 to 20000 range)', () => {
    const result = normalizeEffectParamValue('filter', 'frequency', 10010);
    // (10010-20)/(20000-20) = 9990/19980 = 0.5
    expect(result).toBe(0.5);
  });

  it('handles compressor attack (small float range 0.001 to 0.1)', () => {
    const result = normalizeEffectParamValue('compressor', 'attack', 0.001);
    expect(result).toBe(0);
    const result2 = normalizeEffectParamValue('compressor', 'attack', 0.1);
    expect(result2).toBe(1);
  });

  it('handles flanger feedback with negative min (-0.95 to 0.95)', () => {
    const result = normalizeEffectParamValue('flanger', 'feedback', 0);
    // (0 - (-0.95)) / (0.95 - (-0.95)) = 0.95 / 1.9 = 0.5
    expect(result).toBe(0.5);
  });
});

// ─── denormalizeEffectParamValue ────────────────────────────────────────────

describe('denormalizeEffectParamValue', () => {
  it('denormalizes 0 to min', () => {
    expect(denormalizeEffectParamValue('eq3', 'low', 0)).toBe(-12);
  });

  it('denormalizes 1 to max', () => {
    expect(denormalizeEffectParamValue('eq3', 'low', 1)).toBe(12);
  });

  it('denormalizes 0.5 to midpoint', () => {
    expect(denormalizeEffectParamValue('eq3', 'low', 0.5)).toBe(0);
  });

  it('clamps input below 0', () => {
    expect(denormalizeEffectParamValue('eq3', 'low', -1)).toBe(-12);
  });

  it('clamps input above 1', () => {
    expect(denormalizeEffectParamValue('eq3', 'low', 5)).toBe(12);
  });

  it('returns null for unknown param', () => {
    expect(denormalizeEffectParamValue('eq3', 'nonexistent', 0.5)).toBeNull();
  });

  it('roundtrips with normalizeEffectParamValue', () => {
    const original = 5.5;
    const normalized = normalizeEffectParamValue('reverb', 'decay', original)!;
    const restored = denormalizeEffectParamValue('reverb', 'decay', normalized)!;
    expect(restored).toBeCloseTo(original, 10);
  });

  it('handles filter frequency range', () => {
    const result = denormalizeEffectParamValue('filter', 'frequency', 0.5);
    // 20 + 0.5 * (20000 - 20) = 20 + 9990 = 10010
    expect(result).toBe(10010);
  });

  it('handles flanger feedback negative range', () => {
    const result = denormalizeEffectParamValue('flanger', 'feedback', 0);
    expect(result).toBe(-0.95);
    const result2 = denormalizeEffectParamValue('flanger', 'feedback', 1);
    expect(result2).toBe(0.95);
  });
});

// ─── getNormalizedEffectAutomationValue ─────────────────────────────────────

describe('getNormalizedEffectAutomationValue', () => {
  it('returns normalized value for matching effect type', () => {
    const effect = makeEffect('reverb', { decay: 5.05, preDelay: 0.05, wet: 0.5 });
    const target: AutomatableEffectTarget = { effectType: 'reverb', param: 'decay' };
    const result = getNormalizedEffectAutomationValue(effect, target);
    // decay: min=0.1, max=10 -> (5.05-0.1)/(10-0.1) = 4.95/9.9 = 0.5
    expect(result).toBe(0.5);
  });

  it('returns null when effect type does not match target', () => {
    const effect = makeEffect('reverb', { decay: 5, preDelay: 0.05, wet: 0.5 });
    const target: AutomatableEffectTarget = { effectType: 'delay', param: 'time' };
    const result = getNormalizedEffectAutomationValue(effect as any, target);
    expect(result).toBeNull();
  });

  it('returns null for parametricEq (no numeric params in spec)', () => {
    const effect = makeEffect('parametricEq', { bands: [] });
    const target = { effectType: 'parametricEq' as const, param: 'bands' as any };
    const result = getNormalizedEffectAutomationValue(effect as any, target);
    expect(result).toBeNull();
  });

  it('normalizes eq3 low at min boundary', () => {
    const effect = makeEffect('eq3', {
      low: -12, mid: 0, high: 0, lowFrequency: 400, highFrequency: 2500,
    });
    const target: AutomatableEffectTarget = { effectType: 'eq3', param: 'low' };
    expect(getNormalizedEffectAutomationValue(effect, target)).toBe(0);
  });

  it('normalizes eq3 low at max boundary', () => {
    const effect = makeEffect('eq3', {
      low: 12, mid: 0, high: 0, lowFrequency: 400, highFrequency: 2500,
    });
    const target: AutomatableEffectTarget = { effectType: 'eq3', param: 'low' };
    expect(getNormalizedEffectAutomationValue(effect, target)).toBe(1);
  });

  it('normalizes distortion wet correctly', () => {
    const effect = makeEffect('distortion', {
      amount: 0.5, wet: 0.75, distortionType: 'soft',
    });
    const target: AutomatableEffectTarget = { effectType: 'distortion', param: 'wet' };
    // wet: min=0, max=1 -> 0.75
    expect(getNormalizedEffectAutomationValue(effect, target)).toBe(0.75);
  });

  it('normalizes compressor ratio correctly', () => {
    const effect = makeEffect('compressor', {
      threshold: -20, ratio: 10.5, attack: 0.01, release: 0.1, knee: 10,
    });
    const target: AutomatableEffectTarget = { effectType: 'compressor', param: 'ratio' };
    // ratio: min=1, max=20 -> (10.5-1)/(20-1) = 9.5/19 = 0.5
    expect(getNormalizedEffectAutomationValue(effect, target)).toBe(0.5);
  });

  it('normalizes chorus frequency', () => {
    const effect = makeEffect('chorus', {
      frequency: 5.05, delayTime: 5, depth: 0.5, feedback: 0.3, wet: 0.5,
    });
    const target: AutomatableEffectTarget = { effectType: 'chorus', param: 'frequency' };
    // frequency: min=0.1, max=10 -> (5.05-0.1)/(10-0.1) = 4.95/9.9 = 0.5
    expect(getNormalizedEffectAutomationValue(effect, target)).toBe(0.5);
  });

  it('normalizes phaser Q', () => {
    const effect = makeEffect('phaser', {
      frequency: 1, octaves: 3, Q: 10.05, baseFrequency: 1000, wet: 0.5, stages: 4,
    });
    const target: AutomatableEffectTarget = { effectType: 'phaser', param: 'Q' };
    // Q: min=0.1, max=20 -> (10.05-0.1)/(20-0.1) = 9.95/19.9 = 0.5
    expect(getNormalizedEffectAutomationValue(effect, target)).toBeCloseTo(0.5, 10);
  });

  it('normalizes filter lfoDepth', () => {
    const effect = makeEffect('filter', {
      frequency: 1000, resonance: 5, lfoRate: 5, lfoDepth: 0.5,
      filterType: 'lowpass', lfoEnabled: false,
    });
    const target: AutomatableEffectTarget = { effectType: 'filter', param: 'lfoDepth' };
    // lfoDepth: min=0, max=1 -> 0.5
    expect(getNormalizedEffectAutomationValue(effect, target)).toBe(0.5);
  });

  it('normalizes delay time', () => {
    const effect = makeEffect('delay', { time: 0.505, feedback: 0.5, wet: 0.5 });
    const target: AutomatableEffectTarget = { effectType: 'delay', param: 'time' };
    // time: min=0.01, max=1 -> (0.505-0.01)/(1-0.01) = 0.495/0.99 = 0.5
    expect(getNormalizedEffectAutomationValue(effect, target)).toBe(0.5);
  });

  it('normalizes flanger depth', () => {
    const effect = makeEffect('flanger', {
      frequency: 1, delayTime: 5, depth: 0.5, feedback: 0, wet: 0.5,
    });
    const target: AutomatableEffectTarget = { effectType: 'flanger', param: 'depth' };
    expect(getNormalizedEffectAutomationValue(effect, target)).toBe(0.5);
  });
});
