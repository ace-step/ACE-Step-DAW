/**
 * SynthEngine FM — unit tests
 *
 * Phase 5L migration: FM path uses a local `NativeFmSynth` wired
 * against `getAudioEngine().ctx`. Algorithm-specific parameter
 * mapping is exercised via the exported `buildFmSynthOptions`
 * helper (pure function) instead of spying on Tone.FMSynth.set.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockCtx } = vi.hoisted(() => {
  const makeParam = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    cancelAndHoldAtTime: vi.fn(),
  });
  const makeGain = () => ({
    gain: makeParam(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  });
  const makeOsc = () => ({
    type: 'sine' as OscillatorType,
    frequency: makeParam(),
    detune: makeParam(),
    start: vi.fn(),
    stop: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    onended: null as (() => void) | null,
  });
  return {
    mockCtx: {
      state: 'running' as AudioContextState,
      currentTime: 0,
      destination: {} as AudioNode,
      createGain: vi.fn(makeGain),
      createOscillator: vi.fn(makeOsc),
      createBiquadFilter: vi.fn(),
      createStereoPanner: vi.fn(() => ({
        pan: makeParam(),
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      createConstantSource: vi.fn(() => ({
        offset: makeParam(),
        start: vi.fn(),
        stop: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
    },
  };
});

vi.mock('../../hooks/useAudioEngine', () => ({
  getAudioEngine: vi.fn(() => ({
    ctx: mockCtx,
    resume: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { synthEngine, buildFmSynthOptions } from '../SynthEngine';
import type { FmInstrumentSettings, FmAlgorithm } from '../../types/project';

const baseParams: FmInstrumentSettings = {
  carrier: { waveform: 'sine', ratio: 1, level: 1 },
  modulator: { waveform: 'sine', ratio: 2, level: 0.75 },
  modulationIndex: 3,
  harmonicity: 2,
  feedback: 0,
  algorithm: 'serial',
  ampEnvelope: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.3 },
  outputGain: 0,
};

describe('SynthEngine FM integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    synthEngine.removeFmSynth('test-track');
  });

  describe('ensureFmSynth', () => {
    it('creates an FM synth instance', () => {
      const synth = synthEngine.ensureFmSynth('test-track', baseParams);
      expect(synth).not.toBeUndefined();
    });

    it('returns existing synth when params match', () => {
      const synth1 = synthEngine.ensureFmSynth('test-track', baseParams);
      const synth2 = synthEngine.ensureFmSynth('test-track', baseParams);
      expect(synth1).toBe(synth2);
    });

    it('recreates synth when params change', () => {
      const synth1 = synthEngine.ensureFmSynth('test-track', baseParams);
      const params2 = { ...baseParams, modulationIndex: 8, algorithm: 'parallel' as FmAlgorithm };
      const synth2 = synthEngine.ensureFmSynth('test-track', params2);
      expect(synth2).not.toBe(synth1);
    });
  });

  describe('buildFmSynthOptions algorithm mapping', () => {
    it('serial: pass-through', () => {
      const opts = buildFmSynthOptions({ ...baseParams, algorithm: 'serial', modulationIndex: 5, harmonicity: 4 });
      expect(opts.modulationIndex).toBe(5);
      expect(opts.harmonicity).toBe(4);
    });

    it('parallel: scales modulationIndex by 0.3', () => {
      const opts = buildFmSynthOptions({ ...baseParams, algorithm: 'parallel', modulationIndex: 10 });
      expect(opts.modulationIndex).toBeCloseTo(3, 2);
    });

    it('stack: scales modulationIndex by 1.5 and harmonicity by 0.5', () => {
      const opts = buildFmSynthOptions({ ...baseParams, algorithm: 'stack', modulationIndex: 4, harmonicity: 6 });
      expect(opts.modulationIndex).toBeCloseTo(6, 2);
      expect(opts.harmonicity).toBeCloseTo(3, 2);
    });

    it('feedback: scales modulationIndex by (1 + feedback)', () => {
      const opts = buildFmSynthOptions({ ...baseParams, algorithm: 'feedback', modulationIndex: 3, feedback: 0.5 });
      expect(opts.modulationIndex).toBeCloseTo(4.5, 2);
    });

    it('carries carrier / modulator waveforms through to the oscillator options', () => {
      const opts = buildFmSynthOptions({
        ...baseParams,
        carrier: { waveform: 'square', ratio: 1, level: 1 },
        modulator: { waveform: 'sawtooth', ratio: 3, level: 0.5 },
      });
      expect(opts.oscillator?.type).toBe('square');
      expect(opts.modulation?.type).toBe('sawtooth');
    });
  });

  describe('removeFmSynth', () => {
    it('removes an FM synth', () => {
      synthEngine.ensureFmSynth('test-track', baseParams);
      synthEngine.removeFmSynth('test-track');
      expect(synthEngine.getFmSynth('test-track')).toBeNull();
    });

    it('is a no-op for unknown trackId', () => {
      expect(() => synthEngine.removeFmSynth('nonexistent')).not.toThrow();
    });
  });

  describe('getFmSynth', () => {
    it('returns null for unregistered track', () => {
      expect(synthEngine.getFmSynth('nonexistent')).toBeNull();
    });

    it('returns the FM synth instance for a registered track', () => {
      const created = synthEngine.ensureFmSynth('test-track', baseParams);
      expect(synthEngine.getFmSynth('test-track')).toBe(created);
    });
  });
});
