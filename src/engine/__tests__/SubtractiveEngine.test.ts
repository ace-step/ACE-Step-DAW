import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create factory functions for mock instances
function createMockSynth() {
  return {
    set: vi.fn(),
    connect: vi.fn(),
    triggerAttack: vi.fn(),
    triggerRelease: vi.fn(),
    triggerAttackRelease: vi.fn(),
    releaseAll: vi.fn(),
    dispose: vi.fn(),
    detune: { value: 0 }, // Expose detune param for pitch LFO
  };
}

function createMockFilter() {
  return {
    connect: vi.fn(),
    dispose: vi.fn(),
    frequency: { value: 1000 },
    Q: { value: 0 },
    type: 'lowpass' as string,
  };
}

function createMockLFO() {
  return {
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    dispose: vi.fn(),
    frequency: { value: 5 },
    min: 0,
    max: 1,
  };
}

function createMockGain() {
  return {
    connect: vi.fn(),
    toDestination: vi.fn(),
    dispose: vi.fn(),
    gain: { value: 1 },
  };
}

function createMockPanner() {
  return {
    connect: vi.fn(),
    toDestination: vi.fn(),
    dispose: vi.fn(),
    pan: { value: 0 },
  };
}

// Track created instances for assertions
let lastCreatedSynth: ReturnType<typeof createMockSynth>;
let lastCreatedFilter: ReturnType<typeof createMockFilter>;
let lastCreatedLFO: ReturnType<typeof createMockLFO>;
let lastCreatedPanner: ReturnType<typeof createMockPanner>;
const polySynthCalls: unknown[][] = [];

vi.mock('tone', () => {
  // PolySynth must be a proper constructor
  function MockPolySynth(...args: unknown[]) {
    polySynthCalls.push(args);
    lastCreatedSynth = createMockSynth();
    return lastCreatedSynth;
  }
  function MockSynth() {}

  return {
    PolySynth: MockPolySynth,
    Synth: MockSynth,
    Filter: function MockFilter() {
      lastCreatedFilter = createMockFilter();
      return lastCreatedFilter;
    },
    LFO: function MockLFO() {
      lastCreatedLFO = createMockLFO();
      return lastCreatedLFO;
    },
    Gain: function MockGain() {
      return createMockGain();
    },
    Panner: function MockPanner() {
      lastCreatedPanner = createMockPanner();
      return lastCreatedPanner;
    },
    Frequency: vi.fn((pitch: number, _type: string) => ({
      toFrequency: () => 440 * Math.pow(2, (pitch - 69) / 12),
    })),
    getContext: vi.fn(() => ({
      state: 'running',
    })),
    getDestination: vi.fn(() => ({})),
    start: vi.fn(),
    now: vi.fn(() => 0),
  };
});

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

// We need a fresh engine for each test — the module is a singleton
// so we dynamically import it
async function createFreshEngine() {
  // Clear module cache by appending a query param trick won't work in vitest
  // Instead, just use the exported singleton and manually dispose/reset between tests
  const mod = await import('../SubtractiveEngine');
  mod.subtractiveEngine.dispose();
  return mod.subtractiveEngine;
}

describe('SubtractiveEngine', () => {
  let engine: Awaited<ReturnType<typeof createFreshEngine>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    polySynthCalls.length = 0;
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
    });

    it('does not create filter when filter.enabled is false', () => {
      const settings = makeSettings();
      const instance = engine.ensureTrackSynth('track-1', settings);
      expect(instance.filter).toBeNull();
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
    it('triggerAttackRelease calls synth with computed frequency', () => {
      const settings = makeSettings();
      engine.ensureTrackSynth('track-1', settings);
      engine.triggerAttackRelease('track-1', 60, 0.5, 0.8);
      // C4 = MIDI 60 → freq ≈ 261.6 Hz
      const expectedFreq = 440 * Math.pow(2, (60 - 69) / 12);
      expect(lastCreatedSynth.triggerAttackRelease).toHaveBeenCalledWith(
        expectedFreq, 0.5, undefined, 0.8,
      );
    });

    it('noteOn calls synth triggerAttack with velocity / 127', () => {
      const settings = makeSettings();
      engine.ensureTrackSynth('track-1', settings);
      engine.noteOn('track-1', 60, 127);
      const expectedFreq = 440 * Math.pow(2, (60 - 69) / 12);
      expect(lastCreatedSynth.triggerAttack).toHaveBeenCalledWith(
        expectedFreq, undefined, 1, // 127/127
      );
    });

    it('noteOff calls synth triggerRelease', () => {
      const settings = makeSettings();
      engine.ensureTrackSynth('track-1', settings);
      engine.noteOff('track-1', 60);
      const expectedFreq = 440 * Math.pow(2, (60 - 69) / 12);
      expect(lastCreatedSynth.triggerRelease).toHaveBeenCalledWith(expectedFreq);
    });

    it('does nothing for nonexistent track', () => {
      engine.triggerAttackRelease('nonexistent', 60, 0.5, 0.8);
      engine.noteOn('nonexistent', 60, 100);
      engine.noteOff('nonexistent', 60);
      // No error thrown
    });
  });

  describe('octave offset', () => {
    it('shifts pitch by octave offset (octave -1 means MIDI note - 12)', () => {
      const settings = makeSettings({
        oscillator: { waveform: 'sawtooth', octave: -1, detuneCents: 0, level: 0.9 },
      });
      engine.ensureTrackSynth('track-1', settings);
      engine.triggerAttackRelease('track-1', 60, 0.5, 0.8);
      // MIDI 60 with octave -1 → effectively MIDI 48
      const expectedFreq = 440 * Math.pow(2, (48 - 69) / 12);
      expect(lastCreatedSynth.triggerAttackRelease).toHaveBeenCalledWith(
        expectedFreq, 0.5, undefined, 0.8,
      );
    });

    it('shifts pitch up with positive octave', () => {
      const settings = makeSettings({
        oscillator: { waveform: 'sine', octave: 1, detuneCents: 0, level: 0.9 },
      });
      engine.ensureTrackSynth('track-1', settings);
      engine.triggerAttackRelease('track-1', 60, 0.5, 0.8);
      const expectedFreq = 440 * Math.pow(2, (72 - 69) / 12);
      expect(lastCreatedSynth.triggerAttackRelease).toHaveBeenCalledWith(
        expectedFreq, 0.5, undefined, 0.8,
      );
    });
  });

  describe('setParameter', () => {
    it('updates oscillator waveform', () => {
      engine.ensureTrackSynth('track-1', makeSettings());
      engine.setParameter('track-1', 'oscillator.waveform', 'square');
      expect(lastCreatedSynth.set).toHaveBeenCalledWith(
        expect.objectContaining({ oscillator: { type: 'square' } }),
      );
    });

    it('updates amp envelope attack', () => {
      engine.ensureTrackSynth('track-1', makeSettings());
      engine.setParameter('track-1', 'ampEnvelope.attack', 0.1);
      expect(lastCreatedSynth.set).toHaveBeenCalledWith(
        expect.objectContaining({ envelope: { attack: 0.1 } }),
      );
    });

    it('updates filter cutoff', () => {
      const settings = makeSettings({
        filter: { enabled: true, type: 'lowpass', cutoffHz: 5000, resonance: 0.2, drive: 0, keyTracking: 0 },
      });
      engine.ensureTrackSynth('track-1', settings);
      engine.setParameter('track-1', 'filter.cutoffHz', 3000);
      expect(lastCreatedFilter.frequency.value).toBe(3000);
    });

    it('updates filter resonance', () => {
      const settings = makeSettings({
        filter: { enabled: true, type: 'lowpass', cutoffHz: 5000, resonance: 0.2, drive: 0, keyTracking: 0 },
      });
      engine.ensureTrackSynth('track-1', settings);
      engine.setParameter('track-1', 'filter.resonance', 0.7);
      expect(lastCreatedFilter.Q.value).toBe(21); // 0.7 * 30
    });

    it('updates glide time via portamento', () => {
      engine.ensureTrackSynth('track-1', makeSettings());
      engine.setParameter('track-1', 'glideTime', 0.05);
      expect(lastCreatedSynth.set).toHaveBeenCalledWith({ portamento: 0.05 });
    });

    it('updates output gain from dB', () => {
      const instance = engine.ensureTrackSynth('track-1', makeSettings());
      engine.setParameter('track-1', 'outputGain', -6);
      // -6 dB → ~0.501
      expect(instance.output.gain.value).toBeCloseTo(Math.pow(10, -6 / 20), 2);
    });

    it('does nothing for nonexistent track', () => {
      engine.setParameter('nonexistent', 'oscillator.waveform', 'square');
      // No error
    });
  });

  describe('getSynth', () => {
    it('returns synth for existing track', () => {
      engine.ensureTrackSynth('track-1', makeSettings());
      expect(engine.getSynth('track-1')).toBe(lastCreatedSynth);
    });

    it('returns null for nonexistent track', () => {
      expect(engine.getSynth('nonexistent')).toBeNull();
    });
  });

  describe('releaseAll', () => {
    it('calls releaseAll on all instances', () => {
      engine.ensureTrackSynth('track-1', makeSettings());
      const synth1 = lastCreatedSynth;
      engine.ensureTrackSynth('track-2', makeSettings());
      const synth2 = lastCreatedSynth;

      engine.releaseAll();
      expect(synth1.releaseAll).toHaveBeenCalled();
      expect(synth2.releaseAll).toHaveBeenCalled();
    });
  });

  describe('removeTrackSynth', () => {
    it('disposes and removes the instance', () => {
      engine.ensureTrackSynth('track-1', makeSettings());
      const synth = lastCreatedSynth;

      engine.removeTrackSynth('track-1');
      expect(synth.releaseAll).toHaveBeenCalled();
      expect(synth.dispose).toHaveBeenCalled();
      expect(engine.getSynth('track-1')).toBeNull();
    });

    it('does nothing for nonexistent track', () => {
      engine.removeTrackSynth('nonexistent');
      // No error
    });
  });

  describe('dispose', () => {
    it('disposes all track instances', () => {
      engine.ensureTrackSynth('track-1', makeSettings());
      const synth1 = lastCreatedSynth;
      engine.ensureTrackSynth('track-2', makeSettings());
      const synth2 = lastCreatedSynth;

      engine.dispose();
      expect(synth1.dispose).toHaveBeenCalled();
      expect(synth2.dispose).toHaveBeenCalled();
    });
  });

  describe('LFO pitch target', () => {
    it('creates LFO for pitch target and connects to synth detune', () => {
      const settings = makeSettings({
        lfo: { enabled: true, waveform: 'sine', target: 'pitch', rateHz: 5, depth: 0.3, retrigger: false },
      });
      const instance = engine.ensureTrackSynth('track-1', settings);
      expect(instance.lfo).not.toBeNull();
      expect(lastCreatedLFO.start).toHaveBeenCalled();
      expect(lastCreatedLFO.connect).toHaveBeenCalled();
    });
  });

  describe('LFO pan target', () => {
    it('creates LFO for pan target and connects to panner pan', () => {
      const settings = makeSettings({
        lfo: { enabled: true, waveform: 'triangle', target: 'pan', rateHz: 2, depth: 0.5, retrigger: false },
      });
      const instance = engine.ensureTrackSynth('track-1', settings);
      expect(instance.lfo).not.toBeNull();
      expect(instance.panner).toBeDefined();
      expect(lastCreatedLFO.start).toHaveBeenCalled();
      expect(lastCreatedLFO.connect).toHaveBeenCalled();
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
    it('restarts LFO on noteOn when retrigger is true', () => {
      const settings = makeSettings({
        lfo: { enabled: true, waveform: 'sine', target: 'amp', rateHz: 4, depth: 0.3, retrigger: true },
      });
      engine.ensureTrackSynth('track-1', settings);
      // start called once during creation
      expect(lastCreatedLFO.start).toHaveBeenCalledTimes(1);
      engine.noteOn('track-1', 60, 100);
      // stop + start = retrigger
      expect(lastCreatedLFO.stop).toHaveBeenCalledTimes(1);
      expect(lastCreatedLFO.start).toHaveBeenCalledTimes(2);
    });

    it('does not retrigger LFO when retrigger is false', () => {
      const settings = makeSettings({
        lfo: { enabled: true, waveform: 'sine', target: 'amp', rateHz: 4, depth: 0.3, retrigger: false },
      });
      engine.ensureTrackSynth('track-1', settings);
      engine.noteOn('track-1', 60, 100);
      // Only the initial start, no retrigger
      expect(lastCreatedLFO.stop).not.toHaveBeenCalled();
      expect(lastCreatedLFO.start).toHaveBeenCalledTimes(1);
    });
  });

  describe('playSlideNote', () => {
    it('uses glideTime from settings when > 0', () => {
      const settings = makeSettings({ glideTime: 0.08 });
      engine.ensureTrackSynth('track-1', settings);
      engine.playSlideNote('track-1', 60, 64, 100, 0.5);
      expect(lastCreatedSynth.set).toHaveBeenCalledWith(
        expect.objectContaining({ portamento: 0.08 }),
      );
    });

    it('computes auto glide time when glideTime is 0', () => {
      const settings = makeSettings({ glideTime: 0 });
      engine.ensureTrackSynth('track-1', settings);
      engine.playSlideNote('track-1', 60, 64, 100, 0.5);
      // Auto: max(0.03, min(0.12, 0.5 * 0.35)) = 0.175 → clamped to 0.12
      expect(lastCreatedSynth.set).toHaveBeenCalledWith(
        expect.objectContaining({ portamento: 0.12 }),
      );
    });

    it('does nothing for nonexistent track', () => {
      engine.playSlideNote('nonexistent', 60, 64, 100, 0.5);
      // No error
    });
  });
});
