import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Tone.js
const mockFMSynthSet = vi.fn();
const mockFMSynthConnect = vi.fn();
const mockFMSynthDispose = vi.fn();
const mockFMSynthTriggerAttackRelease = vi.fn();
const mockFMSynthTriggerAttack = vi.fn();
const mockFMSynthTriggerRelease = vi.fn();
const mockFMSynthReleaseAll = vi.fn();

const mockGainConnect = vi.fn();
const mockGainToDestination = vi.fn();
const mockGainDispose = vi.fn();

vi.mock('tone', () => {
  return {
    FMSynth: class MockFMSynth {
      set = mockFMSynthSet;
      connect = mockFMSynthConnect;
      dispose = mockFMSynthDispose;
      triggerAttackRelease = mockFMSynthTriggerAttackRelease;
      triggerAttack = mockFMSynthTriggerAttack;
      triggerRelease = mockFMSynthTriggerRelease;
      releaseAll = mockFMSynthReleaseAll;
    },
    PolySynth: class MockPolySynth {
      set = vi.fn();
      connect = vi.fn();
      dispose = vi.fn();
      triggerAttackRelease = vi.fn();
      triggerAttack = vi.fn();
      triggerRelease = vi.fn();
      releaseAll = vi.fn();
    },
    Synth: class MockSynth {},
    Gain: class MockGain {
      connect = mockGainConnect;
      toDestination = mockGainToDestination;
      dispose = mockGainDispose;
    },
    Frequency: vi.fn().mockReturnValue({ toFrequency: () => 440 }),
    getContext: vi.fn().mockReturnValue({ state: 'running' }),
    start: vi.fn(),
  };
});

import { synthEngine } from '../SynthEngine';
import type { FmInstrumentSettings, FmAlgorithm } from '../../types/project';

describe('SynthEngine FM integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    synthEngine.removeFmSynth('test-track');
  });

  describe('ensureFmSynth', () => {
    it('creates a Tone.FMSynth for an FM instrument', () => {
      const params: FmInstrumentSettings = {
        carrier: { waveform: 'sine', ratio: 1, level: 1 },
        modulator: { waveform: 'sine', ratio: 2, level: 0.75 },
        modulationIndex: 3,
        harmonicity: 2,
        feedback: 0,
        algorithm: 'serial',
        ampEnvelope: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.3 },
        outputGain: 0,
      };
      const synth = synthEngine.ensureFmSynth('test-track', params);
      expect(synth).not.toBeNull();
      expect(mockFMSynthSet).toHaveBeenCalled();
    });

    it('applies carrier waveform and modulation index via set()', () => {
      const params: FmInstrumentSettings = {
        carrier: { waveform: 'triangle', ratio: 1, level: 1 },
        modulator: { waveform: 'sawtooth', ratio: 3, level: 0.8 },
        modulationIndex: 5,
        harmonicity: 3,
        feedback: 0.2,
        algorithm: 'serial',
        ampEnvelope: { attack: 0.05, decay: 0.2, sustain: 0.6, release: 0.5 },
        outputGain: 0,
      };
      synthEngine.ensureFmSynth('test-track', params);

      expect(mockFMSynthSet).toHaveBeenCalledWith(
        expect.objectContaining({
          modulationIndex: 5,
          harmonicity: 3,
        }),
      );
    });

    it('returns existing synth when params match', () => {
      const params: FmInstrumentSettings = {
        carrier: { waveform: 'sine', ratio: 1, level: 1 },
        modulator: { waveform: 'sine', ratio: 2, level: 0.75 },
        modulationIndex: 2,
        harmonicity: 2,
        feedback: 0,
        algorithm: 'serial',
        ampEnvelope: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.3 },
        outputGain: 0,
      };
      const synth1 = synthEngine.ensureFmSynth('test-track', params);
      const synth2 = synthEngine.ensureFmSynth('test-track', params);
      // Should return same instance without recreating
      expect(synth1).toBe(synth2);
    });

    it('recreates synth when params change', () => {
      const params1: FmInstrumentSettings = {
        carrier: { waveform: 'sine', ratio: 1, level: 1 },
        modulator: { waveform: 'sine', ratio: 2, level: 0.75 },
        modulationIndex: 2,
        harmonicity: 2,
        feedback: 0,
        algorithm: 'serial',
        ampEnvelope: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.3 },
        outputGain: 0,
      };
      const synth1 = synthEngine.ensureFmSynth('test-track', params1);

      const params2: FmInstrumentSettings = {
        ...params1,
        modulationIndex: 8,
        algorithm: 'parallel',
      };
      const synth2 = synthEngine.ensureFmSynth('test-track', params2);
      expect(synth2).not.toBe(synth1);
      expect(mockFMSynthDispose).toHaveBeenCalled();
    });
  });

  describe('FM algorithms', () => {
    const baseParams: FmInstrumentSettings = {
      carrier: { waveform: 'sine', ratio: 1, level: 1 },
      modulator: { waveform: 'sine', ratio: 2, level: 0.75 },
      modulationIndex: 2,
      harmonicity: 2,
      feedback: 0,
      algorithm: 'serial',
      ampEnvelope: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.3 },
      outputGain: 0,
    };

    it.each<FmAlgorithm>(['serial', 'parallel', 'stack', 'feedback'])(
      'accepts algorithm "%s"',
      (algorithm) => {
        const params = { ...baseParams, algorithm };
        const synth = synthEngine.ensureFmSynth(`test-${algorithm}`, params);
        expect(synth).not.toBeNull();
        synthEngine.removeFmSynth(`test-${algorithm}`);
      },
    );

    it('configures harmonicity for serial algorithm', () => {
      const params = { ...baseParams, algorithm: 'serial' as const, harmonicity: 4 };
      synthEngine.ensureFmSynth('test-track', params);
      expect(mockFMSynthSet).toHaveBeenCalledWith(
        expect.objectContaining({ harmonicity: 4 }),
      );
    });

    it('configures feedback amount for feedback algorithm', () => {
      const params = { ...baseParams, algorithm: 'feedback' as const, feedback: 0.5, modulationIndex: 3 };
      synthEngine.ensureFmSynth('test-track', params);
      // feedback algorithm: modulationIndex * (1 + feedback) = 3 * 1.5 = 4.5
      expect(mockFMSynthSet).toHaveBeenCalledWith(
        expect.objectContaining({ modulationIndex: 4.5 }),
      );
    });
  });

  describe('removeFmSynth', () => {
    it('disposes and removes an FM synth', () => {
      const params: FmInstrumentSettings = {
        carrier: { waveform: 'sine', ratio: 1, level: 1 },
        modulator: { waveform: 'sine', ratio: 2, level: 0.75 },
        modulationIndex: 2,
        harmonicity: 2,
        feedback: 0,
        algorithm: 'serial',
        ampEnvelope: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.3 },
        outputGain: 0,
      };
      synthEngine.ensureFmSynth('test-track', params);
      synthEngine.removeFmSynth('test-track');

      expect(mockFMSynthDispose).toHaveBeenCalled();
      expect(mockGainDispose).toHaveBeenCalled();
    });

    it('is a no-op for unknown trackId', () => {
      synthEngine.removeFmSynth('nonexistent');
      // Should not throw
    });
  });

  describe('getFmSynth', () => {
    it('returns null for unregistered track', () => {
      expect(synthEngine.getFmSynth('nonexistent')).toBeNull();
    });

    it('returns the FM synth instance for a registered track', () => {
      const params: FmInstrumentSettings = {
        carrier: { waveform: 'sine', ratio: 1, level: 1 },
        modulator: { waveform: 'sine', ratio: 2, level: 0.75 },
        modulationIndex: 2,
        harmonicity: 2,
        feedback: 0,
        algorithm: 'serial',
        ampEnvelope: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.3 },
        outputGain: 0,
      };
      const created = synthEngine.ensureFmSynth('test-track', params);
      expect(synthEngine.getFmSynth('test-track')).toBe(created);
    });
  });
});
