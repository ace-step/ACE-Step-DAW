/**
 * Shared test helpers for effect card tests.
 * Provides factory functions for creating mock effects.
 */
import type { TrackEffect } from '../../../../types/project';

// ─── Effect data factories ───────────────────────────────────────────────────

export function makeEffect<T extends TrackEffect['type']>(
  type: T,
  params: Record<string, unknown>,
  id = 'fx-1',
): TrackEffect & { type: T } {
  return { id, type, enabled: true, params } as unknown as TrackEffect & { type: T };
}

export const MOCK_TRACK_ID = 'track-1';

export function makeCompressorEffect(overrides: Record<string, unknown> = {}) {
  return makeEffect('compressor', {
    threshold: -24, ratio: 4, attack: 0.02, release: 0.2, knee: 6,
    sidechainSourceTrackId: undefined, ...overrides,
  });
}

export function makeLimiterEffect(overrides: Record<string, unknown> = {}) {
  return makeEffect('limiter', {
    ceiling: -0.3, release: 0.1, lookahead: 0.005, gain: 0, style: 'transparent',
    ...overrides,
  });
}

export function makeGateEffect(overrides: Record<string, unknown> = {}) {
  return makeEffect('gate', {
    threshold: -40, range: -80, attack: 0.001, hold: 0.01, release: 0.05,
    hysteresis: 3, mode: 'gate', sidechainHpf: 20, sidechainLpf: 20000,
    ...overrides,
  });
}

export function makeEQ3Effect(overrides: Record<string, unknown> = {}) {
  return makeEffect('eq3', {
    low: 0, mid: 0, high: 0, lowFrequency: 400, highFrequency: 2500,
    ...overrides,
  });
}

export function makeFilterEffect(overrides: Record<string, unknown> = {}) {
  return makeEffect('filter', {
    frequency: 1800, resonance: 1, filterType: 'lowpass',
    lfoEnabled: false, lfoRate: 2, lfoDepth: 0.25, ...overrides,
  });
}

export function makeDelayEffect(overrides: Record<string, unknown> = {}) {
  return makeEffect('delay', {
    time: 0.3, feedback: 0.4, wet: 0.3, ...overrides,
  });
}

export function makeReverbEffect(overrides: Record<string, unknown> = {}) {
  return makeEffect('reverb', {
    decay: 2.5, preDelay: 0.01, wet: 0.3, ...overrides,
  });
}

export function makeChorusEffect(overrides: Record<string, unknown> = {}) {
  return makeEffect('chorus', {
    frequency: 1.5, delayTime: 3.5, depth: 0.7, feedback: 0, wet: 0.5,
    ...overrides,
  });
}

export function makeFlangerEffect(overrides: Record<string, unknown> = {}) {
  return makeEffect('flanger', {
    frequency: 0.5, delayTime: 3, depth: 0.7, feedback: 0.5, wet: 0.5,
    ...overrides,
  });
}

export function makePhaserEffect(overrides: Record<string, unknown> = {}) {
  return makeEffect('phaser', {
    frequency: 1, octaves: 3, stages: 4, Q: 2, baseFrequency: 1000, wet: 0.5,
    ...overrides,
  });
}

export function makeDistortionEffect(overrides: Record<string, unknown> = {}) {
  return makeEffect('distortion', {
    amount: 0.5, wet: 0.5, distortionType: 'soft', ...overrides,
  });
}

export function makeSaturationEffect(overrides: Record<string, unknown> = {}) {
  return makeEffect('saturation', {
    drive: 0.5, saturationType: 'tape', harmonicMix: 0, inputGain: 0, outputGain: 0, mix: 0.5,
    ...overrides,
  });
}

export function makeDeEsserEffect(overrides: Record<string, unknown> = {}) {
  return makeEffect('deesser', {
    frequency: 6000, bandwidth: 2, threshold: -20, mode: 'wideband',
    listen: false, range: 10, ...overrides,
  });
}

export function makeTransientShaperEffect(overrides: Record<string, unknown> = {}) {
  return makeEffect('transientShaper', {
    attack: 0, sustain: 0, mix: 1, output: 0, ...overrides,
  });
}

export function makeStereoImagerEffect(overrides: Record<string, unknown> = {}) {
  return makeEffect('stereoImager', {
    width: 1, midGain: 0, sideGain: 0, monoFreq: 0, pan: 0, ...overrides,
  });
}

export function makeAlgorithmicReverbEffect(overrides: Record<string, unknown> = {}) {
  return makeEffect('algorithmicReverb', {
    reverbType: 'plate', decay: 2, preDelay: 20, damping: 0.5, size: 0.5,
    modRate: 0.5, modDepth: 0.3, erLevel: 0.5, lowCut: 200, highCut: 8000, mix: 0.3,
    ...overrides,
  });
}

export function makeConvolverEffect(overrides: Record<string, unknown> = {}) {
  return makeEffect('convolver', {
    irType: 'smallRoom', wet: 0.3, preDelay: 10, ...overrides,
  });
}

export function makeNoiseReductionEffect(overrides: Record<string, unknown> = {}) {
  return makeEffect('noiseReduction', {
    amount: 0.5, threshold: -40, mode: 'fast', hfEmphasis: 0.3, mix: 1,
    ...overrides,
  });
}

export function makeSpectralFreezeEffect(overrides: Record<string, unknown> = {}) {
  return makeEffect('spectralFreeze', {
    frozen: false, mix: 0.5, decay: 0.8, brightness: 0, fftSize: 4096,
    ...overrides,
  });
}

export function makeSpectralBlurEffect(overrides: Record<string, unknown> = {}) {
  return makeEffect('spectralBlur', {
    blurAmount: 0.5, frequencySpread: 0.3, mix: 0.5, brightness: 0, fftSize: 4096,
    ...overrides,
  });
}

export function makeSpectralFilterEffect(overrides: Record<string, unknown> = {}) {
  return makeEffect('spectralFilter', {
    points: [{ frequency: 1000, gain: 0 }], resolution: 0.5, mix: 1, fftSize: 4096,
    ...overrides,
  });
}

export function makeSpectralMorphEffect(overrides: Record<string, unknown> = {}) {
  return makeEffect('spectralMorph', {
    morphAmount: 0.5, sourceTrackId: undefined, frozen: false, mix: 0.5, fftSize: 4096,
    ...overrides,
  });
}

export function makeParametricEQEffect(overrides: Record<string, unknown> = {}) {
  return makeEffect('parametricEq', {
    mode: 'simple',
    bands: [
      { id: 'b1', enabled: true, type: 'lowshelf', frequency: 200, gain: 0, q: 0.7 },
      { id: 'b2', enabled: true, type: 'peaking', frequency: 1000, gain: 0, q: 1 },
      { id: 'b3', enabled: true, type: 'highshelf', frequency: 8000, gain: 0, q: 0.7 },
    ],
    ...overrides,
  });
}
