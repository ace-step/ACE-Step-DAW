import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSynthSet = vi.fn();
const mockSynthConnect = vi.fn();
const mockSynthDispose = vi.fn();
const mockSynthTriggerAttackRelease = vi.fn();
const mockSynthTriggerAttack = vi.fn();
const mockSynthTriggerRelease = vi.fn();
const mockSynthReleaseAll = vi.fn();

const mockGainConnect = vi.fn();
const mockGainToDestination = vi.fn();
const mockGainDispose = vi.fn();
const mockGainValue = { value: 0 };

vi.mock('tone', () => {
  return {
    PolySynth: class MockPolySynth {
      set = mockSynthSet;
      connect = mockSynthConnect;
      dispose = mockSynthDispose;
      triggerAttackRelease = mockSynthTriggerAttackRelease;
      triggerAttack = mockSynthTriggerAttack;
      triggerRelease = mockSynthTriggerRelease;
      releaseAll = mockSynthReleaseAll;
    },
    Synth: class MockSynth {},
    Gain: class MockGain {
      gain = mockGainValue;
      connect = mockGainConnect;
      toDestination = mockGainToDestination;
      dispose = mockGainDispose;
    },
    Frequency: vi.fn().mockReturnValue({ toFrequency: () => 440 }),
    getContext: vi.fn().mockReturnValue({ state: 'running' }),
    start: vi.fn(),
  };
});

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
  });

  afterEach(() => {
    wavetableEngine.removeTrackSynth('test-track');
  });

  describe('ensureTrackSynth', () => {
    it('creates a synth with custom partials', () => {
      const settings = makeSettings();
      const synth = wavetableEngine.ensureTrackSynth('test-track', settings);
      expect(synth).toBeDefined();
      expect(mockSynthSet).toHaveBeenCalledWith(
        expect.objectContaining({
          oscillator: expect.objectContaining({ type: 'custom' }),
        }),
      );
    });

    it('returns existing synth on second call', () => {
      const settings = makeSettings();
      const synth1 = wavetableEngine.ensureTrackSynth('test-track', settings);
      const synth2 = wavetableEngine.ensureTrackSynth('test-track', settings);
      expect(synth1).toBe(synth2);
    });

    it('connects to provided output node', () => {
      const settings = makeSettings();
      const mockOutput = {} as unknown as import('tone').InputNode;
      wavetableEngine.ensureTrackSynth('test-track', settings, mockOutput);
      expect(mockGainConnect).toHaveBeenCalledWith(mockOutput);
    });
  });

  describe('setPosition', () => {
    it('updates partials when position changes', () => {
      const settings = makeSettings({ waveforms: [WAVEFORM_SINE, WAVEFORM_SAW, WAVEFORM_SQUARE] });
      wavetableEngine.ensureTrackSynth('test-track', settings);
      vi.clearAllMocks();

      wavetableEngine.setPosition('test-track', 0.5);
      expect(mockSynthSet).toHaveBeenCalledWith(
        expect.objectContaining({
          oscillator: expect.objectContaining({ type: 'custom' }),
        }),
      );
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
      wavetableEngine.setPosition('nonexistent', 0.5);
      expect(mockSynthSet).not.toHaveBeenCalled();
    });
  });

  describe('noteOn / noteOff', () => {
    it('triggers attack on note-on', () => {
      wavetableEngine.ensureTrackSynth('test-track', makeSettings());
      wavetableEngine.noteOn('test-track', 60, 100);
      expect(mockSynthTriggerAttack).toHaveBeenCalled();
    });

    it('triggers release on note-off', () => {
      wavetableEngine.ensureTrackSynth('test-track', makeSettings());
      wavetableEngine.noteOff('test-track', 60);
      expect(mockSynthTriggerRelease).toHaveBeenCalled();
    });

    it('is a no-op for unknown track', () => {
      wavetableEngine.noteOn('nonexistent', 60);
      wavetableEngine.noteOff('nonexistent', 60);
      expect(mockSynthTriggerAttack).not.toHaveBeenCalled();
    });
  });

  describe('removeTrackSynth', () => {
    it('disposes synth and gain', () => {
      wavetableEngine.ensureTrackSynth('test-track', makeSettings());
      wavetableEngine.removeTrackSynth('test-track');
      expect(mockSynthReleaseAll).toHaveBeenCalled();
      expect(mockSynthDispose).toHaveBeenCalled();
      expect(mockGainDispose).toHaveBeenCalled();
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
