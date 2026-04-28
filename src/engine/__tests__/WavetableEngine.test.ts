/**
 * WavetableEngine — unit tests
 *
 * Phase 5J migration: the engine now runs its own NativeWavetableSynth
 * over `getAudioEngine().ctx`. Tests observe via the mocked context's
 * factory spies; most behaviour that used to assert on Tone class
 * calls becomes "did the right context method get invoked?".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockCtx, mocks } = vi.hoisted(() => {
  const makeAudioParam = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  });
  const mocks = {
    oscStart: vi.fn(),
    oscStop: vi.fn(),
    oscConnect: vi.fn(),
    oscDisconnect: vi.fn(),
    oscSetPeriodicWave: vi.fn(),
    gainConnect: vi.fn(),
    gainDisconnect: vi.fn(),
    createPeriodicWave: vi.fn(),
  };
  const makeGain = () => ({
    gain: makeAudioParam(),
    connect: mocks.gainConnect,
    disconnect: mocks.gainDisconnect,
  });
  const makeOsc = () => ({
    frequency: makeAudioParam(),
    start: mocks.oscStart,
    stop: mocks.oscStop,
    connect: mocks.oscConnect,
    disconnect: mocks.oscDisconnect,
    setPeriodicWave: mocks.oscSetPeriodicWave,
    onended: null as (() => void) | null,
  });
  return {
    mockCtx: {
      state: 'running' as AudioContextState,
      currentTime: 0,
      destination: {} as AudioNode,
      createGain: vi.fn(makeGain),
      createOscillator: vi.fn(makeOsc),
      createPeriodicWave: mocks.createPeriodicWave.mockReturnValue({} as PeriodicWave),
    },
    mocks,
  };
});

vi.mock('../../hooks/useAudioEngine', () => ({
  getAudioEngine: vi.fn(() => ({
    ctx: mockCtx,
    resume: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { wavetableEngine } from '../WavetableEngine';
import type { WavetableSettings } from '../../types/project';
import { WAVEFORM_SINE, WAVEFORM_SAW, WAVEFORM_SQUARE } from '../wavetablePresets';

const makeSettings = (overrides?: Partial<WavetableSettings>): WavetableSettings => ({
  waveforms: [WAVEFORM_SINE, WAVEFORM_SAW],
  position: 0,
  morphSpeed: 0,
  ampEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.3 },
  outputGain: 0.55,
  ...overrides,
});

describe('WavetableEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // mockReturnValue is re-applied after clearAllMocks to keep the
    // factory returning a valid PeriodicWave stand-in.
    mocks.createPeriodicWave.mockReturnValue({} as PeriodicWave);
  });

  afterEach(() => {
    wavetableEngine.removeTrackSynth('test-track');
  });

  describe('ensureTrackSynth', () => {
    it('creates a synth built from partials (via createPeriodicWave)', () => {
      const settings = makeSettings();
      const synth = wavetableEngine.ensureTrackSynth('test-track', settings);
      expect(synth).not.toBeUndefined();
      expect(mocks.createPeriodicWave).toHaveBeenCalled();
    });

    it('returns existing synth on second call', () => {
      const settings = makeSettings();
      const synth1 = wavetableEngine.ensureTrackSynth('test-track', settings);
      const synth2 = wavetableEngine.ensureTrackSynth('test-track', settings);
      expect(synth1).toBe(synth2);
    });

    it('connects to provided output node', () => {
      const settings = makeSettings();
      const mockOutput = {} as AudioNode;
      wavetableEngine.ensureTrackSynth('test-track', settings, mockOutput);
      // Last GainNode.connect() call should target the provided output.
      expect(mocks.gainConnect).toHaveBeenCalledWith(mockOutput);
    });
  });

  describe('setPosition', () => {
    it('rebuilds the periodic wave when position changes', () => {
      const settings = makeSettings({ waveforms: [WAVEFORM_SINE, WAVEFORM_SAW, WAVEFORM_SQUARE] });
      wavetableEngine.ensureTrackSynth('test-track', settings);
      mocks.createPeriodicWave.mockClear();
      mocks.createPeriodicWave.mockReturnValue({} as PeriodicWave);

      wavetableEngine.setPosition('test-track', 0.5);
      expect(mocks.createPeriodicWave).toHaveBeenCalledTimes(1);
      expect(wavetableEngine.getPosition('test-track')).toBe(0.5);
    });

    it('clamps position to 0-1 range', () => {
      wavetableEngine.ensureTrackSynth('test-track', makeSettings());
      wavetableEngine.setPosition('test-track', 1.5);
      expect(wavetableEngine.getPosition('test-track')).toBe(1);

      wavetableEngine.setPosition('test-track', -0.5);
      expect(wavetableEngine.getPosition('test-track')).toBe(0);
    });

    it('is a no-op for unknown track', () => {
      mocks.createPeriodicWave.mockClear();
      wavetableEngine.setPosition('nonexistent', 0.5);
      expect(mocks.createPeriodicWave).not.toHaveBeenCalled();
    });
  });

  describe('noteOn / noteOff', () => {
    it('starts an oscillator on note-on', () => {
      wavetableEngine.ensureTrackSynth('test-track', makeSettings());
      mocks.oscStart.mockClear();
      wavetableEngine.noteOn('test-track', 60, 100);
      expect(mocks.oscStart).toHaveBeenCalled();
      expect(mocks.oscSetPeriodicWave).toHaveBeenCalled();
    });

    it('stops the oscillator on note-off', () => {
      wavetableEngine.ensureTrackSynth('test-track', makeSettings());
      wavetableEngine.noteOn('test-track', 60, 100);
      mocks.oscStop.mockClear();
      wavetableEngine.noteOff('test-track', 60);
      expect(mocks.oscStop).toHaveBeenCalled();
    });

    it('is a no-op for unknown track', () => {
      mocks.oscStart.mockClear();
      wavetableEngine.noteOn('nonexistent', 60);
      wavetableEngine.noteOff('nonexistent', 60);
      expect(mocks.oscStart).not.toHaveBeenCalled();
    });
  });

  describe('removeTrackSynth', () => {
    it('disposes the synth and gain', () => {
      wavetableEngine.ensureTrackSynth('test-track', makeSettings());
      mocks.gainDisconnect.mockClear();
      wavetableEngine.removeTrackSynth('test-track');
      // Per-voice gain disconnects + per-instance gain disconnect: at least one.
      expect(mocks.gainDisconnect).toHaveBeenCalled();
    });

    it('makes getSynth return null after removal', () => {
      wavetableEngine.ensureTrackSynth('test-track', makeSettings());
      wavetableEngine.removeTrackSynth('test-track');
      expect(wavetableEngine.getSynth('test-track')).toBeNull();
    });
  });

  describe('getSynth', () => {
    it('returns null for unregistered track', () => {
      expect(wavetableEngine.getSynth('nonexistent')).toBeNull();
    });

    it('returns synth for registered track', () => {
      const synth = wavetableEngine.ensureTrackSynth('test-track', makeSettings());
      expect(wavetableEngine.getSynth('test-track')).toBe(synth);
    });
  });
});
