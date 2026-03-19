import type {
  AutomationParameter,
  AutomatableEffectTarget,
  TrackEffect,
  TrackEffectType,
} from '../types/project';

type EffectAutomationSpec = {
  label: string;
  min: number;
  max: number;
  color: string;
};

const EFFECT_AUTOMATION_SPECS: Record<TrackEffectType, Record<string, EffectAutomationSpec>> = {
  eq3: {
    low: { label: 'Low Gain', min: -12, max: 12, color: '#22c55e' },
    mid: { label: 'Mid Gain', min: -12, max: 12, color: '#22c55e' },
    high: { label: 'High Gain', min: -12, max: 12, color: '#22c55e' },
    lowFrequency: { label: 'Low Frequency', min: 100, max: 1000, color: '#22c55e' },
    highFrequency: { label: 'High Frequency', min: 1000, max: 8000, color: '#22c55e' },
  },
  compressor: {
    threshold: { label: 'Threshold', min: -60, max: 0, color: '#f59e0b' },
    ratio: { label: 'Ratio', min: 1, max: 20, color: '#f59e0b' },
    attack: { label: 'Attack', min: 0.001, max: 0.1, color: '#f59e0b' },
    release: { label: 'Release', min: 0.01, max: 1, color: '#f59e0b' },
    knee: { label: 'Knee', min: 0, max: 40, color: '#f59e0b' },
  },
  reverb: {
    decay: { label: 'Decay', min: 0.1, max: 10, color: '#8b5cf6' },
    preDelay: { label: 'Pre-Delay', min: 0, max: 0.1, color: '#8b5cf6' },
    wet: { label: 'Dry/Wet', min: 0, max: 1, color: '#8b5cf6' },
  },
  delay: {
    time: { label: 'Time', min: 0.01, max: 1, color: '#f59e0b' },
    feedback: { label: 'Feedback', min: 0, max: 0.95, color: '#f59e0b' },
    wet: { label: 'Dry/Wet', min: 0, max: 1, color: '#f59e0b' },
  },
  distortion: {
    amount: { label: 'Amount', min: 0, max: 1, color: '#ef4444' },
    wet: { label: 'Dry/Wet', min: 0, max: 1, color: '#ef4444' },
  },
  filter: {
    frequency: { label: 'Cutoff', min: 20, max: 20000, color: '#06b6d4' },
    resonance: { label: 'Resonance', min: 0, max: 20, color: '#06b6d4' },
    lfoRate: { label: 'LFO Rate', min: 0.1, max: 20, color: '#06b6d4' },
    lfoDepth: { label: 'LFO Depth', min: 0, max: 1, color: '#06b6d4' },
  },
  parametricEq: {},
};

function clampNormalized(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function getNumericParamValue(effect: TrackEffect, param: string): number | null {
  switch (effect.type) {
    case 'eq3': {
      const value = effect.params[param as keyof typeof effect.params];
      return typeof value === 'number' ? value : null;
    }
    case 'compressor': {
      const value = effect.params[param as keyof typeof effect.params];
      return typeof value === 'number' ? value : null;
    }
    case 'reverb': {
      const value = effect.params[param as keyof typeof effect.params];
      return typeof value === 'number' ? value : null;
    }
    case 'delay': {
      const value = effect.params[param as keyof typeof effect.params];
      return typeof value === 'number' ? value : null;
    }
    case 'distortion': {
      const value = effect.params[param as keyof typeof effect.params];
      return typeof value === 'number' ? value : null;
    }
    case 'filter': {
      const value = effect.params[param as keyof typeof effect.params];
      return typeof value === 'number' ? value : null;
    }
    case 'parametricEq':
      return null;
  }
}

export function getEffectAutomationSpec(
  effectType: TrackEffectType,
  param: string,
): EffectAutomationSpec | null {
  return EFFECT_AUTOMATION_SPECS[effectType][param] ?? null;
}

export function getEffectAutomationColor(parameter: AutomationParameter): string {
  if (parameter.type === 'mixer') {
    return parameter.param === 'volume' ? '#22c55e' : '#3b82f6';
  }
  return getEffectAutomationSpec(parameter.effectType, parameter.param)?.color ?? '#8b5cf6';
}

export function getEffectAutomationLabel(
  effectType: TrackEffectType,
  param: string,
): string {
  return getEffectAutomationSpec(effectType, param)?.label ?? param;
}

export function normalizeEffectParamValue(
  effectType: TrackEffectType,
  param: string,
  value: number,
): number | null {
  const spec = getEffectAutomationSpec(effectType, param);
  if (!spec) return null;
  if (spec.max === spec.min) return 0;
  return clampNormalized((value - spec.min) / (spec.max - spec.min));
}

export function denormalizeEffectParamValue(
  effectType: TrackEffectType,
  param: string,
  normalized: number,
): number | null {
  const spec = getEffectAutomationSpec(effectType, param);
  if (!spec) return null;
  return spec.min + clampNormalized(normalized) * (spec.max - spec.min);
}

export function getNormalizedEffectAutomationValue(
  effect: TrackEffect,
  target: AutomatableEffectTarget,
): number | null {
  if (effect.type !== target.effectType) return null;
  const rawValue = getNumericParamValue(effect, target.param);
  if (rawValue === null) return null;
  return normalizeEffectParamValue(effect.type, target.param, rawValue);
}
