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
    threshold: { label: 'Threshold', min: -60, max: 0, color: '#c4993b' },
    ratio: { label: 'Ratio', min: 1, max: 20, color: '#c4993b' },
    attack: { label: 'Attack', min: 0.001, max: 0.1, color: '#c4993b' },
    release: { label: 'Release', min: 0.01, max: 1, color: '#c4993b' },
    knee: { label: 'Knee', min: 0, max: 40, color: '#c4993b' },
    lookahead: { label: 'Lookahead', min: 0, max: 0.005, color: '#c4993b' },
    sidechainHpf: { label: 'SC HPF', min: 0, max: 500, color: '#c4993b' },
    sidechainLpf: { label: 'SC LPF', min: 0, max: 20000, color: '#c4993b' },
    mix: { label: 'Mix', min: 0, max: 1, color: '#c4993b' },
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
  chorus: {
    frequency: { label: 'Rate', min: 0.1, max: 10, color: '#a78bfa' },
    delayTime: { label: 'Delay', min: 0.5, max: 20, color: '#a78bfa' },
    depth: { label: 'Depth', min: 0, max: 1, color: '#a78bfa' },
    feedback: { label: 'Feedback', min: 0, max: 0.95, color: '#a78bfa' },
    wet: { label: 'Dry/Wet', min: 0, max: 1, color: '#a78bfa' },
  },
  flanger: {
    frequency: { label: 'Rate', min: 0.05, max: 5, color: '#34d399' },
    delayTime: { label: 'Delay', min: 0.5, max: 10, color: '#34d399' },
    depth: { label: 'Depth', min: 0, max: 1, color: '#34d399' },
    feedback: { label: 'Feedback', min: -0.95, max: 0.95, color: '#34d399' },
    wet: { label: 'Dry/Wet', min: 0, max: 1, color: '#34d399' },
  },
  phaser: {
    frequency: { label: 'Rate', min: 0.1, max: 8, color: '#fb923c' },
    octaves: { label: 'Octaves', min: 1, max: 6, color: '#fb923c' },
    Q: { label: 'Q', min: 0.1, max: 20, color: '#fb923c' },
    baseFrequency: { label: 'Base Freq', min: 100, max: 4000, color: '#fb923c' },
    wet: { label: 'Dry/Wet', min: 0, max: 1, color: '#fb923c' },
  },
  convolver: {
    wet: { label: 'Dry/Wet', min: 0, max: 1, color: '#a07cc8' },
    preDelay: { label: 'Pre-Delay', min: 0, max: 100, color: '#a07cc8' },
  },
  gate: {
    threshold: { label: 'Threshold', min: -80, max: 0, color: '#b8903a' },
    range: { label: 'Range', min: -80, max: 0, color: '#b8903a' },
    attack: { label: 'Attack', min: 0.0001, max: 0.05, color: '#b8903a' },
    hold: { label: 'Hold', min: 0, max: 0.5, color: '#b8903a' },
    release: { label: 'Release', min: 0.005, max: 4, color: '#b8903a' },
    hysteresis: { label: 'Hysteresis', min: 0, max: 12, color: '#b8903a' },
    sidechainHpf: { label: 'SC HPF', min: 0, max: 500, color: '#b8903a' },
    sidechainLpf: { label: 'SC LPF', min: 0, max: 20000, color: '#b8903a' },
  },
  deesser: {
    frequency: { label: 'Frequency', min: 2000, max: 16000, color: '#c4a654' },
    bandwidth: { label: 'Bandwidth', min: 0.5, max: 8, color: '#c4a654' },
    threshold: { label: 'Threshold', min: -60, max: 0, color: '#c4a654' },
    range: { label: 'Range', min: 0, max: 20, color: '#c4a654' },
  },
  transientShaper: {
    attack: { label: 'Attack', min: -100, max: 100, color: '#b89340' },
    sustain: { label: 'Sustain', min: -100, max: 100, color: '#b89340' },
    mix: { label: 'Mix', min: 0, max: 1, color: '#b89340' },
    output: { label: 'Output', min: -12, max: 12, color: '#b89340' },
  },
  limiter: {
    ceiling: { label: 'Ceiling', min: -12, max: 0, color: '#d4a040' },
    release: { label: 'Release', min: 0.001, max: 1, color: '#d4a040' },
    lookahead: { label: 'Lookahead', min: 0, max: 0.02, color: '#d4a040' },
    gain: { label: 'Gain', min: -12, max: 24, color: '#d4a040' },
  },
  saturation: {
    drive: { label: 'Drive', min: 0, max: 1, color: '#c46454' },
    harmonicMix: { label: 'Harmonics', min: -1, max: 1, color: '#c46454' },
    inputGain: { label: 'Input', min: -12, max: 12, color: '#c46454' },
    outputGain: { label: 'Output', min: -12, max: 12, color: '#c46454' },
    mix: { label: 'Mix', min: 0, max: 1, color: '#c46454' },
  },
  stereoImager: {
    width: { label: 'Width', min: 0, max: 2, color: '#7a8ab4' },
    midGain: { label: 'Mid', min: -12, max: 12, color: '#7a8ab4' },
    sideGain: { label: 'Side', min: -12, max: 12, color: '#7a8ab4' },
    monoFreq: { label: 'Mono Freq', min: 0, max: 500, color: '#7a8ab4' },
    pan: { label: 'Pan', min: -1, max: 1, color: '#7a8ab4' },
  },
  algorithmicReverb: {
    decay: { label: 'Decay', min: 0.1, max: 20, color: '#7a6fb8' },
    preDelay: { label: 'Pre-Delay', min: 0, max: 200, color: '#7a6fb8' },
    damping: { label: 'Damping', min: 0, max: 1, color: '#7a6fb8' },
    size: { label: 'Size', min: 0, max: 1, color: '#7a6fb8' },
    modRate: { label: 'Mod Rate', min: 0, max: 1, color: '#7a6fb8' },
    modDepth: { label: 'Mod Depth', min: 0, max: 1, color: '#7a6fb8' },
    erLevel: { label: 'ER Level', min: -12, max: 12, color: '#7a6fb8' },
    lowCut: { label: 'Low Cut', min: 20, max: 1000, color: '#7a6fb8' },
    highCut: { label: 'High Cut', min: 1000, max: 20000, color: '#7a6fb8' },
    mix: { label: 'Mix', min: 0, max: 1, color: '#7a6fb8' },
  },
  noiseReduction: {
    amount: { label: 'Amount', min: 0, max: 1, color: '#8a8a8a' },
    threshold: { label: 'Threshold', min: -80, max: -20, color: '#8a8a8a' },
    hfEmphasis: { label: 'HF Focus', min: 0, max: 1, color: '#8a8a8a' },
    mix: { label: 'Mix', min: 0, max: 1, color: '#8a8a8a' },
  },
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
    case 'chorus': {
      const value = effect.params[param as keyof typeof effect.params];
      return typeof value === 'number' ? value : null;
    }
    case 'flanger': {
      const value = effect.params[param as keyof typeof effect.params];
      return typeof value === 'number' ? value : null;
    }
    case 'phaser': {
      const value = effect.params[param as keyof typeof effect.params];
      return typeof value === 'number' ? value : null;
    }
    case 'convolver': {
      const value = effect.params[param as keyof typeof effect.params];
      return typeof value === 'number' ? value : null;
    }
    case 'parametricEq':
      return null;
    case 'gate': {
      const value = effect.params[param as keyof typeof effect.params];
      return typeof value === 'number' ? value : null;
    }
    case 'deesser': {
      const value = effect.params[param as keyof typeof effect.params];
      return typeof value === 'number' ? value : null;
    }
    case 'transientShaper': {
      const value = effect.params[param as keyof typeof effect.params];
      return typeof value === 'number' ? value : null;
    }
    case 'limiter': {
      const value = effect.params[param as keyof typeof effect.params];
      return typeof value === 'number' ? value : null;
    }
    case 'saturation': {
      const value = effect.params[param as keyof typeof effect.params];
      return typeof value === 'number' ? value : null;
    }
    case 'stereoImager': {
      const value = effect.params[param as keyof typeof effect.params];
      return typeof value === 'number' ? value : null;
    }
    case 'algorithmicReverb': {
      const value = effect.params[param as keyof typeof effect.params];
      return typeof value === 'number' ? value : null;
    }
    case 'noiseReduction': {
      const value = effect.params[param as keyof typeof effect.params];
      return typeof value === 'number' ? value : null;
    }
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
  if (parameter.type === 'send') {
    return '#f97316'; // orange for sends
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
