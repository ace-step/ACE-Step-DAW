import { v4 as uuidv4 } from 'uuid';
import type { ParametricEQBand, ParametricEQBandType } from '../types/project';

export const PARAMETRIC_EQ_MIN_FREQUENCY = 20;
export const PARAMETRIC_EQ_MAX_FREQUENCY = 20000;
export const PARAMETRIC_EQ_MIN_GAIN = -18;
export const PARAMETRIC_EQ_MAX_GAIN = 18;
export const PARAMETRIC_EQ_MIN_Q = 0.1;
export const PARAMETRIC_EQ_MAX_Q = 18;
export const PARAMETRIC_EQ_SAMPLE_RATE = 48000;

export function clampParametricEqFrequency(frequency: number): number {
  return Math.max(PARAMETRIC_EQ_MIN_FREQUENCY, Math.min(PARAMETRIC_EQ_MAX_FREQUENCY, frequency));
}

export function clampParametricEqGain(gain: number): number {
  return Math.max(PARAMETRIC_EQ_MIN_GAIN, Math.min(PARAMETRIC_EQ_MAX_GAIN, gain));
}

export function clampParametricEqQ(q: number): number {
  return Math.max(PARAMETRIC_EQ_MIN_Q, Math.min(PARAMETRIC_EQ_MAX_Q, q));
}

export function createParametricEqBand(
  overrides: Partial<ParametricEQBand> = {},
): ParametricEQBand {
  return {
    id: overrides.id ?? uuidv4(),
    enabled: overrides.enabled ?? true,
    type: overrides.type ?? 'peaking',
    frequency: clampParametricEqFrequency(overrides.frequency ?? 1000),
    gain: clampParametricEqGain(overrides.gain ?? 0),
    q: clampParametricEqQ(overrides.q ?? 1),
  };
}

export function createDefaultParametricEqBands(): ParametricEQBand[] {
  return [
    createParametricEqBand({ type: 'highpass', frequency: 40, gain: 0, q: 0.7 }),
    createParametricEqBand({ type: 'peaking', frequency: 220, gain: 0, q: 1.2 }),
    createParametricEqBand({ type: 'peaking', frequency: 2000, gain: 0, q: 1.2 }),
    createParametricEqBand({ type: 'highshelf', frequency: 8000, gain: 0, q: 0.7 }),
  ];
}

export function createSimpleParametricEqBands(
  low = 0,
  mid = 0,
  high = 0,
  lowFrequency = 250,
  highFrequency = 4000,
): ParametricEQBand[] {
  return [
    createParametricEqBand({ type: 'lowshelf', frequency: lowFrequency, gain: low, q: 0.7 }),
    createParametricEqBand({ type: 'peaking', frequency: 1000, gain: mid, q: 1 }),
    createParametricEqBand({ type: 'highshelf', frequency: highFrequency, gain: high, q: 0.7 }),
    createParametricEqBand({ type: 'highpass', frequency: 20, gain: 0, q: 0.7, enabled: false }),
  ];
}

export function frequencyToRatio(frequency: number): number {
  const clamped = clampParametricEqFrequency(frequency);
  return (
    Math.log10(clamped / PARAMETRIC_EQ_MIN_FREQUENCY) /
    Math.log10(PARAMETRIC_EQ_MAX_FREQUENCY / PARAMETRIC_EQ_MIN_FREQUENCY)
  );
}

export function ratioToFrequency(ratio: number): number {
  const clamped = Math.max(0, Math.min(1, ratio));
  return clampParametricEqFrequency(
    PARAMETRIC_EQ_MIN_FREQUENCY *
      Math.pow(PARAMETRIC_EQ_MAX_FREQUENCY / PARAMETRIC_EQ_MIN_FREQUENCY, clamped),
  );
}

type BiquadCoefficients = {
  b0: number;
  b1: number;
  b2: number;
  a0: number;
  a1: number;
  a2: number;
};

function createBypassCoefficients(): BiquadCoefficients {
  return { b0: 1, b1: 0, b2: 0, a0: 1, a1: 0, a2: 0 };
}

function getBandCoefficients(
  band: ParametricEQBand,
  sampleRate: number,
): BiquadCoefficients {
  if (!band.enabled) return createBypassCoefficients();

  const omega = (2 * Math.PI * clampParametricEqFrequency(band.frequency)) / sampleRate;
  const cosOmega = Math.cos(omega);
  const sinOmega = Math.sin(omega);
  const q = clampParametricEqQ(band.q);
  const gain = clampParametricEqGain(band.gain);
  const a = Math.pow(10, gain / 40);
  const alpha = sinOmega / (2 * q);
  const shelfSlope = 1;
  const shelfAlpha =
    (sinOmega / 2) *
    Math.sqrt((a + 1 / a) * (1 / shelfSlope - 1) + 2);
  const twoSqrtAAlpha = 2 * Math.sqrt(a) * shelfAlpha;

  switch (band.type) {
    case 'peaking':
      return {
        b0: 1 + alpha * a,
        b1: -2 * cosOmega,
        b2: 1 - alpha * a,
        a0: 1 + alpha / a,
        a1: -2 * cosOmega,
        a2: 1 - alpha / a,
      };
    case 'notch':
      return {
        b0: 1,
        b1: -2 * cosOmega,
        b2: 1,
        a0: 1 + alpha,
        a1: -2 * cosOmega,
        a2: 1 - alpha,
      };
    case 'highpass':
      return {
        b0: (1 + cosOmega) / 2,
        b1: -(1 + cosOmega),
        b2: (1 + cosOmega) / 2,
        a0: 1 + alpha,
        a1: -2 * cosOmega,
        a2: 1 - alpha,
      };
    case 'lowpass':
      return {
        b0: (1 - cosOmega) / 2,
        b1: 1 - cosOmega,
        b2: (1 - cosOmega) / 2,
        a0: 1 + alpha,
        a1: -2 * cosOmega,
        a2: 1 - alpha,
      };
    case 'lowshelf':
      return {
        b0: a * ((a + 1) - (a - 1) * cosOmega + twoSqrtAAlpha),
        b1: 2 * a * ((a - 1) - (a + 1) * cosOmega),
        b2: a * ((a + 1) - (a - 1) * cosOmega - twoSqrtAAlpha),
        a0: (a + 1) + (a - 1) * cosOmega + twoSqrtAAlpha,
        a1: -2 * ((a - 1) + (a + 1) * cosOmega),
        a2: (a + 1) + (a - 1) * cosOmega - twoSqrtAAlpha,
      };
    case 'highshelf':
      return {
        b0: a * ((a + 1) + (a - 1) * cosOmega + twoSqrtAAlpha),
        b1: -2 * a * ((a - 1) + (a + 1) * cosOmega),
        b2: a * ((a + 1) + (a - 1) * cosOmega - twoSqrtAAlpha),
        a0: (a + 1) - (a - 1) * cosOmega + twoSqrtAAlpha,
        a1: 2 * ((a - 1) - (a + 1) * cosOmega),
        a2: (a + 1) - (a - 1) * cosOmega - twoSqrtAAlpha,
      };
  }
}

function getBandMagnitudeAtFrequency(
  band: ParametricEQBand,
  frequency: number,
  sampleRate: number,
): number {
  const c = getBandCoefficients(band, sampleRate);
  const omega = (2 * Math.PI * clampParametricEqFrequency(frequency)) / sampleRate;
  const cos1 = Math.cos(omega);
  const sin1 = Math.sin(omega);
  const cos2 = Math.cos(2 * omega);
  const sin2 = Math.sin(2 * omega);

  const numeratorReal = c.b0 + c.b1 * cos1 + c.b2 * cos2;
  const numeratorImag = -c.b1 * sin1 - c.b2 * sin2;
  const denominatorReal = c.a0 + c.a1 * cos1 + c.a2 * cos2;
  const denominatorImag = -c.a1 * sin1 - c.a2 * sin2;

  const numeratorMagnitude = Math.hypot(numeratorReal, numeratorImag);
  const denominatorMagnitude = Math.max(1e-12, Math.hypot(denominatorReal, denominatorImag));
  return numeratorMagnitude / denominatorMagnitude;
}

export function getEqResponseAtFrequency(
  bands: ParametricEQBand[],
  frequency: number,
  sampleRate = PARAMETRIC_EQ_SAMPLE_RATE,
): number {
  const magnitude = bands.reduce(
    (product, band) => product * getBandMagnitudeAtFrequency(band, frequency, sampleRate),
    1,
  );
  return 20 * Math.log10(Math.max(1e-9, magnitude));
}

export function getBandControlLabel(type: ParametricEQBandType): string {
  switch (type) {
    case 'peaking':
      return 'Peak';
    case 'lowshelf':
      return 'Low Shelf';
    case 'highshelf':
      return 'High Shelf';
    case 'notch':
      return 'Notch';
    case 'highpass':
      return 'High Pass';
    case 'lowpass':
      return 'Low Pass';
  }
}
