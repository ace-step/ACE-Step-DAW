import { describe, it, expect } from 'vitest';
import {
  getEngineForInstrument,
  SynthEngineAdapter,
  SamplerEngineAdapter,
  FmEngineAdapter,
} from '../InstrumentFactory';
import type { InstrumentEngine } from '../InstrumentEngine';
import type {
  SubtractiveTrackInstrument,
  SamplerTrackInstrument,
  FmTrackInstrument,
} from '../../types/project';

// ── Fixtures ───────────────────────────────────────────────────────────────

const subtractiveInstrument: SubtractiveTrackInstrument = {
  kind: 'subtractive',
  preset: 'piano',
  name: 'Test Piano',
  settings: {
    oscillator: { waveform: 'triangle', octave: 0, detuneCents: 0, level: 1 },
    ampEnvelope: { attack: 0.005, decay: 0.3, sustain: 0.2, release: 1.2 },
    filter: { enabled: false, type: 'lowpass', cutoffHz: 20000, resonance: 1, drive: 0, keyTracking: 0 },
    filterEnvelope: { attack: 0.01, decay: 0.1, sustain: 1, release: 0.3, amount: 0 },
    lfo: { enabled: false, waveform: 'sine', target: 'off', rateHz: 1, depth: 0, retrigger: false },
    unison: { voices: 1, detuneCents: 0, stereoSpread: 0, blend: 0 },
    glideTime: 0,
    outputGain: 1,
  },
};

const samplerInstrument: SamplerTrackInstrument = {
  kind: 'sampler',
  preset: 'sampler',
  name: 'Test Sampler',
  settings: {
    audioKey: 'test-key',
    rootNote: 60,
    trimStart: 0,
    trimEnd: 1,
    playbackMode: 'classic',
    loopStart: 0,
    loopEnd: 1,
    ampEnvelope: { attack: 0.005, decay: 0.1, sustain: 1, release: 0.3 },
  },
};

const fmInstrument: FmTrackInstrument = {
  kind: 'fm',
  preset: 'fm',
  name: 'Test FM',
  fallbackPreset: 'organ',
  settings: {
    carrier: { waveform: 'sine', ratio: 1, level: 1 },
    modulator: { waveform: 'sine', ratio: 2, level: 0.5 },
    modulationIndex: 5,
    feedback: 0,
    ampEnvelope: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3 },
    outputGain: 1,
  },
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('getEngineForInstrument', () => {
  it('returns a SynthEngineAdapter for subtractive instruments', () => {
    const engine = getEngineForInstrument(subtractiveInstrument);
    expect(engine).toBeInstanceOf(SynthEngineAdapter);
  });

  it('returns a SamplerEngineAdapter for sampler instruments', () => {
    const engine = getEngineForInstrument(samplerInstrument);
    expect(engine).toBeInstanceOf(SamplerEngineAdapter);
  });

  it('returns a FmEngineAdapter for fm instruments', () => {
    const engine = getEngineForInstrument(fmInstrument);
    expect(engine).toBeInstanceOf(FmEngineAdapter);
  });

  it('returns the same instance for repeated calls with the same kind', () => {
    const a = getEngineForInstrument(subtractiveInstrument);
    const b = getEngineForInstrument(subtractiveInstrument);
    expect(a).toBe(b);
  });

  it('returns different instances for different instrument kinds', () => {
    const synth = getEngineForInstrument(subtractiveInstrument);
    const sampler = getEngineForInstrument(samplerInstrument);
    const fm = getEngineForInstrument(fmInstrument);
    expect(synth).not.toBe(sampler);
    expect(synth).not.toBe(fm);
    expect(sampler).not.toBe(fm);
  });
});

describe('InstrumentEngine interface conformance', () => {
  const engines: Array<[string, InstrumentEngine]> = [
    ['SynthEngineAdapter', getEngineForInstrument(subtractiveInstrument)],
    ['SamplerEngineAdapter', getEngineForInstrument(samplerInstrument)],
    ['FmEngineAdapter', getEngineForInstrument(fmInstrument)],
  ];

  it.each(engines)('%s implements all InstrumentEngine methods', (_name, engine) => {
    expect(typeof engine.noteOn).toBe('function');
    expect(typeof engine.noteOff).toBe('function');
    expect(typeof engine.triggerAttackRelease).toBe('function');
    expect(typeof engine.setParameter).toBe('function');
    expect(typeof engine.releaseAll).toBe('function');
    expect(typeof engine.removeTrack).toBe('function');
    expect(typeof engine.dispose).toBe('function');
  });

  it.each(engines)('%s.setParameter does not throw for unknown params', (_name, engine) => {
    expect(() => engine.setParameter('test-track', 'unknownParam', 42)).not.toThrow();
  });
});
