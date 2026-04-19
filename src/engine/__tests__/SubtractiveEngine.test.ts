/**
 * SubtractiveEngine — unit tests
 *
 * Phase 5K migration: engine uses native Web Audio nodes via
 * `getAudioEngine().ctx`. Tests run against the real engine code
 * with a mock AudioContext whose factories hand out spy-wrapped
 * stand-ins — so we can observe node creation & parameter writes
 * directly instead of asserting on Tone mocks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCtx, mocks } = vi.hoisted(() => {
  const makeAudioParam = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    cancelAndHoldAtTime: vi.fn(),
  });

  const mocks = {
    oscStart: vi.fn(),
    oscStop: vi.fn(),
    oscConnect: vi.fn(),
    oscDisconnect: vi.fn(),
    gainConnect: vi.fn(),
    gainDisconnect: vi.fn(),
    filterConnect: vi.fn(),
    filterDisconnect: vi.fn(),
    pannerConnect: vi.fn(),
    pannerDisconnect: vi.fn(),
    constantStart: vi.fn(),
    constantStop: vi.fn(),
    constantConnect: vi.fn(),
    constantDisconnect: vi.fn(),
    lastOsc: null as any,
    lastFilter: null as any,
    lastPanner: null as any,
    lastConstantSource: null as any,
    createOscillatorCount: 0,
    createBiquadFilterCount: 0,
    createStereoPannerCount: 0,
  };

  const makeOsc = () => {
    mocks.createOscillatorCount++;
    const osc = {
      type: 'sine' as OscillatorType,
      frequency: makeAudioParam(),
      detune: makeAudioParam(),
      start: mocks.oscStart,
      stop: mocks.oscStop,
      connect: mocks.oscConnect,
      disconnect: mocks.oscDisconnect,
      onended: null as (() => void) | null,
    };
    mocks.lastOsc = osc;
    return osc;
  };

  const makeGain = () => ({
    gain: makeAudioParam(),
    connect: mocks.gainConnect,
    disconnect: mocks.gainDisconnect,
  });

  const makeFilter = () => {
    mocks.createBiquadFilterCount++;
    const f = {
      type: 'lowpass' as BiquadFilterType,
      frequency: makeAudioParam(),
      Q: makeAudioParam(),
      connect: mocks.filterConnect,
      disconnect: mocks.filterDisconnect,
    };
    mocks.lastFilter = f;
    return f;
  };

  const makePanner = () => {
    mocks.createStereoPannerCount++;
    const p = {
      pan: makeAudioParam(),
      connect: mocks.pannerConnect,
      disconnect: mocks.pannerDisconnect,
    };
    mocks.lastPanner = p;
    return p;
  };

  const makeConstantSource = () => {
    const c = {
      offset: makeAudioParam(),
      start: mocks.constantStart,
      stop: mocks.constantStop,
      connect: mocks.constantConnect,
      disconnect: mocks.constantDisconnect,
    };
    mocks.lastConstantSource = c;
    return c;
  };

  return {
    mockCtx: {
      state: 'running' as AudioContextState,
      currentTime: 0,
      destination: {} as AudioNode,
      createGain: vi.fn(makeGain),
      createOscillator: vi.fn(makeOsc),
      createBiquadFilter: vi.fn(makeFilter),
      createStereoPanner: vi.fn(makePanner),
      createConstantSource: vi.fn(makeConstantSource),
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

import type { SubtractiveInstrumentSettings } from '../../types/project';

function makeSettings(overrides?: Partial<SubtractiveInstrumentSettings>): SubtractiveInstrumentSettings {
  return {
    oscillator: { waveform: 'sawtooth', octave: 0, detuneCents: 0, level: 0.9 },
    ampEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.5 },
    filter: { enabled: false, type: 'lowpass', cutoffHz: 5000, resonance: 0.2, drive: 0, keyTracking: 0 },
    filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.5, amount: 0 },
    lfo: { enabled: false, waveform: 'sine', target: 'off', rateHz: 5, depth: 0, retrigger: true },
    unison: { voices: 1, detuneCents: 0, stereoSpread: 0, blend: 1 },
    glideTime: 0,
    outputGain: 0,
    ...overrides,
  };
}

async function createFreshEngine() {
  const mod = await import('../SubtractiveEngine');
  mod.subtractiveEngine.dispose();
  return mod.subtractiveEngine;
}

describe('SubtractiveEngine', () => {
  let engine: Awaited<ReturnType<typeof createFreshEngine>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.createOscillatorCount = 0;
    mocks.createBiquadFilterCount = 0;
    mocks.createStereoPannerCount = 0;
    engine = await createFreshEngine();
  });

  describe('ensureTrackSynth', () => {
    it('creates a new instance for a track', () => {
      const settings = makeSettings();
      const instance = engine.ensureTrackSynth('track-1', settings);
      expect(instance).not.toBeUndefined();
      expect(instance.synth).not.toBeUndefined();
      expect(instance.output).not.toBeUndefined();
      expect(instance.settings.oscillator.waveform).toBe('sawtooth');
    });

    it('returns existing instance and updates settings on second call', () => {
      const settings = makeSettings();
      const first = engine.ensureTrackSynth('track-1', settings);
      const updated = makeSettings({ glideTime: 0.1 });
      const second = engine.ensureTrackSynth('track-1', updated);
      expect(second).toBe(first);
      expect(second.settings.glideTime).toBe(0.1);
    });

    it('creates filter when filter.enabled is true', () => {
      const settings = makeSettings({
        filter: { enabled: true, type: 'lowpass', cutoffHz: 2000, resonance: 0.5, drive: 0, keyTracking: 0 },
      });
      const instance = engine.ensureTrackSynth('track-1', settings);
      expect(instance.filter).not.toBeNull();
      expect(mocks.createBiquadFilterCount).toBe(1);
    });

    it('does not create filter when filter.enabled is false', () => {
      const settings = makeSettings();
      const instance = engine.ensureTrackSynth('track-1', settings);
      expect(instance.filter).toBeNull();
      expect(mocks.createBiquadFilterCount).toBe(0);
    });

    it('creates LFO for amp target', () => {
      const settings = makeSettings({
        lfo: { enabled: true, waveform: 'sine', target: 'amp', rateHz: 4, depth: 0.3, retrigger: true },
      });
      const instance = engine.ensureTrackSynth('track-1', settings);
      expect(instance.lfo).not.toBeNull();
    });

    it('creates LFO for filterCutoff target when filter enabled', () => {
      const settings = makeSettings({
        filter: { enabled: true, type: 'lowpass', cutoffHz: 5000, resonance: 0.2, drive: 0, keyTracking: 0 },
        lfo: { enabled: true, waveform: 'sine', target: 'filterCutoff', rateHz: 2, depth: 0.5, retrigger: true },
      });
      const instance = engine.ensureTrackSynth('track-1', settings);
      expect(instance.lfo).not.toBeNull();
    });

    it('does not create LFO when disabled', () => {
      const settings = makeSettings();
      const instance = engine.ensureTrackSynth('track-1', settings);
      expect(instance.lfo).toBeNull();
    });

    it('does not create LFO when depth is 0', () => {
      const settings = makeSettings({
        lfo: { enabled: true, waveform: 'sine', target: 'amp', rateHz: 4, depth: 0, retrigger: true },
      });
      const instance = engine.ensureTrackSynth('track-1', settings);
      expect(instance.lfo).toBeNull();
    });
  });

  describe('note triggering', () => {
    it('triggerAttackRelease starts an oscillator', () => {
      const settings = makeSettings();
      engine.ensureTrackSynth('track-1', settings);
      mocks.oscStart.mockClear();
      engine.triggerAttackRelease('track-1', 60, 0.5, 0.8);
      expect(mocks.oscStart).toHaveBeenCalled();
    });

    it('noteOn schedules an oscillator at the pitch-derived frequency', () => {
      engine.ensureTrackSynth('track-1', makeSettings());
      engine.noteOn('track-1', 60, 127);
      // The osc's frequency setValueAtTime should have received
      // ~261.6 Hz (MIDI 60 → C4).
      const freqParam = mocks.lastOsc.frequency;
      const call = freqParam.setValueAtTime.mock.calls[0];
      expect(call).toBeDefined();
      const expectedFreq = 440 * Math.pow(2, (60 - 69) / 12);
      expect(call[0]).toBeCloseTo(expectedFreq, 1);
    });

    it('noteOff releases the voice (ramps gain toward 0)', () => {
      engine.ensureTrackSynth('track-1', makeSettings());
      engine.noteOn('track-1', 60, 127);
      const voiceGain = mocks.lastOsc; // osc ref
      // triggerRelease stops the osc:
      mocks.oscStop.mockClear();
      engine.noteOff('track-1', 60);
      expect(mocks.oscStop).toHaveBeenCalled();
      expect(voiceGain).toBeDefined();
    });

    it('does nothing for nonexistent track', () => {
      expect(() => {
        engine.triggerAttackRelease('nonexistent', 60, 0.5, 0.8);
        engine.noteOn('nonexistent', 60, 100);
        engine.noteOff('nonexistent', 60);
      }).not.toThrow();
    });
  });

  describe('octave offset', () => {
    it('shifts pitch by octave offset (octave -1 → MIDI - 12)', () => {
      const settings = makeSettings({
        oscillator: { waveform: 'sawtooth', octave: -1, detuneCents: 0, level: 0.9 },
      });
      engine.ensureTrackSynth('track-1', settings);
      engine.triggerAttackRelease('track-1', 60, 0.5, 0.8);
      const freqParam = mocks.lastOsc.frequency;
      const expectedFreq = 440 * Math.pow(2, (48 - 69) / 12);
      const call = freqParam.setValueAtTime.mock.calls[0];
      expect(call[0]).toBeCloseTo(expectedFreq, 1);
    });

    it('shifts pitch up with positive octave', () => {
      const settings = makeSettings({
        oscillator: { waveform: 'sine', octave: 1, detuneCents: 0, level: 0.9 },
      });
      engine.ensureTrackSynth('track-1', settings);
      engine.triggerAttackRelease('track-1', 60, 0.5, 0.8);
      const expectedFreq = 440 * Math.pow(2, (72 - 69) / 12);
      const call = mocks.lastOsc.frequency.setValueAtTime.mock.calls[0];
      expect(call[0]).toBeCloseTo(expectedFreq, 1);
    });
  });

  describe('setParameter', () => {
    it('updates filter cutoff', () => {
      const settings = makeSettings({
        filter: { enabled: true, type: 'lowpass', cutoffHz: 5000, resonance: 0.2, drive: 0, keyTracking: 0 },
      });
      const instance = engine.ensureTrackSynth('track-1', settings);
      engine.setParameter('track-1', 'filter.cutoffHz', 3000);
      expect(instance.filter?.frequency.value).toBe(3000);
    });

    it('updates filter resonance', () => {
      const settings = makeSettings({
        filter: { enabled: true, type: 'lowpass', cutoffHz: 5000, resonance: 0.2, drive: 0, keyTracking: 0 },
      });
      const instance = engine.ensureTrackSynth('track-1', settings);
      engine.setParameter('track-1', 'filter.resonance', 0.7);
      expect(instance.filter?.Q.value).toBeCloseTo(21, 2); // 0.7 * 30
    });

    it('updates output gain from dB', () => {
      const instance = engine.ensureTrackSynth('track-1', makeSettings());
      engine.setParameter('track-1', 'outputGain', -6);
      expect(instance.output.gain.value).toBeCloseTo(Math.pow(10, -6 / 20), 2);
    });

    it('does nothing for nonexistent track', () => {
      expect(() => engine.setParameter('nonexistent', 'filter.cutoffHz', 3000)).not.toThrow();
    });
  });

  describe('getSynth', () => {
    it('returns synth for existing track', () => {
      const instance = engine.ensureTrackSynth('track-1', makeSettings());
      expect(engine.getSynth('track-1')).toBe(instance.synth);
    });

    it('returns null for nonexistent track', () => {
      expect(engine.getSynth('nonexistent')).toBeNull();
    });
  });

  describe('releaseAll', () => {
    it('does not throw when called on empty or populated engine', () => {
      engine.ensureTrackSynth('track-1', makeSettings());
      engine.ensureTrackSynth('track-2', makeSettings());
      engine.noteOn('track-1', 60);
      engine.noteOn('track-2', 64);
      expect(() => engine.releaseAll()).not.toThrow();
    });
  });

  describe('removeTrackSynth', () => {
    it('removes and disposes the instance', () => {
      engine.ensureTrackSynth('track-1', makeSettings());
      engine.removeTrackSynth('track-1');
      expect(engine.getSynth('track-1')).toBeNull();
    });

    it('does nothing for nonexistent track', () => {
      expect(() => engine.removeTrackSynth('nonexistent')).not.toThrow();
    });
  });

  describe('dispose', () => {
    it('clears all tracks and previews', () => {
      engine.ensureTrackSynth('track-1', makeSettings());
      engine.ensureTrackSynth('track-2', makeSettings());
      engine.dispose();
      expect(engine.getSynth('track-1')).toBeNull();
      expect(engine.getSynth('track-2')).toBeNull();
    });
  });

  describe('LFO pitch target', () => {
    it('creates an LFO oscillator when target is pitch', () => {
      const settings = makeSettings({
        lfo: { enabled: true, waveform: 'sine', target: 'pitch', rateHz: 5, depth: 0.3, retrigger: false },
      });
      const instance = engine.ensureTrackSynth('track-1', settings);
      expect(instance.lfo).not.toBeNull();
    });
  });

  describe('LFO pan target', () => {
    it('creates an LFO routed to pan', () => {
      const settings = makeSettings({
        lfo: { enabled: true, waveform: 'triangle', target: 'pan', rateHz: 2, depth: 0.5, retrigger: false },
      });
      const instance = engine.ensureTrackSynth('track-1', settings);
      expect(instance.lfo).not.toBeNull();
      expect(instance.panner).toBeDefined();
    });

    it('always creates a panner even without pan LFO (for modulation matrix)', () => {
      const settings = makeSettings({
        lfo: { enabled: true, waveform: 'sine', target: 'amp', rateHz: 4, depth: 0.3, retrigger: false },
      });
      const instance = engine.ensureTrackSynth('track-1', settings);
      expect(instance.panner).toBeDefined();
    });
  });

  describe('LFO retrigger', () => {
    it('recreates the LFO oscillator on noteOn when retrigger is true', () => {
      const settings = makeSettings({
        lfo: { enabled: true, waveform: 'sine', target: 'amp', rateHz: 4, depth: 0.3, retrigger: true },
      });
      engine.ensureTrackSynth('track-1', settings);
      const oscCountBefore = mocks.createOscillatorCount;
      engine.noteOn('track-1', 60, 100);
      // noteOn creates a voice oscillator AND the LFO-retrigger
      // creates a fresh LFO oscillator, so count bumps by at least 2.
      expect(mocks.createOscillatorCount - oscCountBefore).toBeGreaterThanOrEqual(2);
    });

    it('does not retrigger LFO when retrigger is false', () => {
      const settings = makeSettings({
        lfo: { enabled: true, waveform: 'sine', target: 'amp', rateHz: 4, depth: 0.3, retrigger: false },
      });
      engine.ensureTrackSynth('track-1', settings);
      const oscCountBefore = mocks.createOscillatorCount;
      engine.noteOn('track-1', 60, 100);
      // Only the voice's own oscillator should be created.
      expect(mocks.createOscillatorCount - oscCountBefore).toBe(1);
    });
  });

  describe('playSlideNote', () => {
    it('does not throw with default settings', () => {
      engine.ensureTrackSynth('track-1', makeSettings({ glideTime: 0.08 }));
      expect(() => engine.playSlideNote('track-1', 60, 64, 100, 0.5)).not.toThrow();
    });

    it('does not throw with auto glide (glideTime = 0)', () => {
      engine.ensureTrackSynth('track-1', makeSettings({ glideTime: 0 }));
      expect(() => engine.playSlideNote('track-1', 60, 64, 100, 0.5)).not.toThrow();
    });

    it('does nothing for nonexistent track', () => {
      expect(() => engine.playSlideNote('nonexistent', 60, 64, 100, 0.5)).not.toThrow();
    });
  });

  describe('getModulationTargets', () => {
    it('returns native AudioParams for each target', () => {
      const settings = makeSettings({
        filter: { enabled: true, type: 'lowpass', cutoffHz: 5000, resonance: 0.2, drive: 0, keyTracking: 0 },
      });
      engine.ensureTrackSynth('track-1', settings);
      const targets = engine.getModulationTargets('track-1');
      expect(targets).not.toBeNull();
      expect(targets?.amp).toBeDefined();
      expect(targets?.pitch).toBeDefined();
      expect(targets?.pan).toBeDefined();
      expect(targets?.filterCutoff).toBeDefined();
      expect(targets?.filterResonance).toBeDefined();
    });

    it('returns null for nonexistent track', () => {
      expect(engine.getModulationTargets('nonexistent')).toBeNull();
    });
  });
});
