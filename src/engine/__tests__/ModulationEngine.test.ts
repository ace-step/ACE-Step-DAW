/**
 * ModulationEngine — unit tests
 *
 * Phase 5I migration: engine pulls its AudioContext from
 * `getAudioEngine().ctx` instead of creating Tone nodes. We mock that
 * context and track the native nodes via vi spies.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We expose the mock factories via hoisted refs so individual tests
// can reach in and assert behaviour on the most-recently-created node.
const {
  mockCtx,
  makeMockAudioParam,
  mocks,
} = vi.hoisted(() => {
  type MockParam = {
    value: number;
    setValueAtTime: ReturnType<typeof vi.fn>;
  };
  const makeMockAudioParam = (): MockParam => ({
    value: 0,
    setValueAtTime: vi.fn(),
  });

  // Shared mock handles — cleared between tests via vi.clearAllMocks().
  const mocks = {
    oscStart: vi.fn(),
    oscStop: vi.fn(),
    oscConnect: vi.fn(),
    oscDisconnect: vi.fn(),
    constantStart: vi.fn(),
    constantStop: vi.fn(),
    constantConnect: vi.fn(),
    constantDisconnect: vi.fn(),
    gainConnect: vi.fn(),
    gainDisconnect: vi.fn(),
    shaperConnect: vi.fn(),
    shaperDisconnect: vi.fn(),
    // Handles kept in mutable slots so tests can inspect them.
    lastOsc: null as any,
    lastConstant: null as any,
  };

  const makeOsc = () => {
    const osc = {
      type: 'sine',
      frequency: makeMockAudioParam(),
      start: mocks.oscStart,
      stop: mocks.oscStop,
      connect: mocks.oscConnect,
      disconnect: mocks.oscDisconnect,
    };
    mocks.lastOsc = osc;
    return osc;
  };
  const makeConstant = () => {
    const c = {
      offset: makeMockAudioParam(),
      start: mocks.constantStart,
      stop: mocks.constantStop,
      connect: mocks.constantConnect,
      disconnect: mocks.constantDisconnect,
    };
    mocks.lastConstant = c;
    return c;
  };
  const makeGain = () => ({
    gain: makeMockAudioParam(),
    connect: mocks.gainConnect,
    disconnect: mocks.gainDisconnect,
  });
  const makeShaper = () => ({
    curve: null as Float32Array | null,
    connect: mocks.shaperConnect,
    disconnect: mocks.shaperDisconnect,
  });

  return {
    mockCtx: {
      state: 'running' as AudioContextState,
      currentTime: 0,
      createOscillator: vi.fn(makeOsc),
      createConstantSource: vi.fn(makeConstant),
      createGain: vi.fn(makeGain),
      createWaveShaper: vi.fn(makeShaper),
    },
    makeMockAudioParam,
    mocks,
  };
});

vi.mock('../../hooks/useAudioEngine', () => ({
  getAudioEngine: vi.fn(() => ({
    ctx: mockCtx,
    resume: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { modulationEngine } from '../ModulationEngine';
import type { ModulationSettings } from '../../types/project';
import type { ModulationTargets, ModulationTarget } from '../ModulationEngine';

function makeSettings(overrides?: Partial<ModulationSettings>): ModulationSettings {
  return {
    lfo1: { waveform: 'sine', rateHz: 2, retrigger: false },
    lfo2: { waveform: 'triangle', rateHz: 0.5, retrigger: false },
    modEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.5 },
    slots: [],
    macros: [0, 0, 0, 0],
    ...overrides,
  };
}

function makeMockTargets(): ModulationTargets {
  // We use plain objects as AudioParam/AudioNode stand-ins. The
  // engine only ever connects nodes into these — it doesn't read
  // properties off them — so opaque object identity is enough.
  return {
    filterCutoff: {} as unknown as ModulationTarget,
    amp: {} as unknown as ModulationTarget,
  };
}

describe('ModulationEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lastOsc = null;
    mocks.lastConstant = null;
  });

  afterEach(() => {
    modulationEngine.removeTrack('test-track');
    modulationEngine.removeTrack('track-1');
    modulationEngine.removeTrack('track-2');
  });

  describe('applyModulation', () => {
    it('does nothing with empty slots', () => {
      const settings = makeSettings({ slots: [] });
      modulationEngine.applyModulation('test-track', settings, makeMockTargets());
      expect(mocks.oscStart).not.toHaveBeenCalled();
    });

    it('creates LFO1 source and wires it through a gain scaler to the target', () => {
      const settings = makeSettings({
        slots: [{ source: 'lfo1', destination: 'filterCutoff', amount: 0.5, bipolar: true }],
      });
      modulationEngine.applyModulation('test-track', settings, makeMockTargets());
      expect(mocks.oscStart).toHaveBeenCalledTimes(1);
      expect(mocks.oscConnect).toHaveBeenCalled();       // osc → scaler
      expect(mocks.gainConnect).toHaveBeenCalled();      // scaler → target
    });

    it('creates LFO2 source when used', () => {
      const settings = makeSettings({
        slots: [{ source: 'lfo2', destination: 'amp', amount: 0.3, bipolar: false }],
      });
      modulationEngine.applyModulation('test-track', settings, makeMockTargets());
      expect(mocks.oscStart).toHaveBeenCalledTimes(1);
      // bipolar=false + LFO source → WaveShaper is created to fold [-1,1]→[0,1]
      expect(mockCtx.createWaveShaper).toHaveBeenCalledTimes(1);
    });

    it('creates macro source as ConstantSourceNode with initial offset', () => {
      const settings = makeSettings({
        macros: [0.75, 0, 0, 0],
        slots: [{ source: 'macro1', destination: 'filterCutoff', amount: 1, bipolar: false }],
      });
      modulationEngine.applyModulation('test-track', settings, makeMockTargets());
      expect(mockCtx.createConstantSource).toHaveBeenCalledTimes(1);
      expect(mocks.lastConstant.offset.value).toBe(0.75);
      expect(mocks.constantStart).toHaveBeenCalled();
      expect(mocks.constantConnect).toHaveBeenCalled();
    });

    it('reuses the same source for multiple slots', () => {
      const settings = makeSettings({
        slots: [
          { source: 'lfo1', destination: 'filterCutoff', amount: 0.5, bipolar: true },
          { source: 'lfo1', destination: 'amp', amount: 0.3, bipolar: false },
        ],
      });
      modulationEngine.applyModulation('test-track', settings, makeMockTargets());
      // Only one OscillatorNode is created — the second slot reuses it.
      expect(mockCtx.createOscillator).toHaveBeenCalledTimes(1);
      // Two scaler gains though — one per slot.
      expect(mockCtx.createGain).toHaveBeenCalledTimes(2);
    });

    it('skips slots with unavailable targets', () => {
      const settings = makeSettings({
        slots: [{ source: 'lfo1', destination: 'pan', amount: 0.5, bipolar: true }],
      });
      modulationEngine.applyModulation('test-track', settings, { filterCutoff: {} as ModulationTarget });
      // No scaler gain created because we bailed before that step.
      expect(mockCtx.createGain).not.toHaveBeenCalled();
    });

    it('skips unsupported sources (velocity, modWheel, envelopes)', () => {
      const settings = makeSettings({
        slots: [{ source: 'velocity', destination: 'filterCutoff', amount: 0.5, bipolar: false }],
      });
      modulationEngine.applyModulation('test-track', settings, makeMockTargets());
      expect(mockCtx.createOscillator).not.toHaveBeenCalled();
      expect(mockCtx.createGain).not.toHaveBeenCalled();
    });
  });

  describe('setMacro', () => {
    it('updates the macro source offset', () => {
      const settings = makeSettings({
        macros: [0.5, 0, 0, 0],
        slots: [{ source: 'macro1', destination: 'filterCutoff', amount: 1, bipolar: false }],
      });
      modulationEngine.applyModulation('test-track', settings, makeMockTargets());
      modulationEngine.setMacro('test-track', 0, 0.8);
      expect(mocks.lastConstant.offset.value).toBe(0.8);
    });

    it('clamps macro value to [0, 1]', () => {
      const settings = makeSettings({
        macros: [0, 0, 0, 0],
        slots: [{ source: 'macro1', destination: 'filterCutoff', amount: 1, bipolar: false }],
      });
      modulationEngine.applyModulation('test-track', settings, makeMockTargets());
      modulationEngine.setMacro('test-track', 0, 1.5);
      expect(mocks.lastConstant.offset.value).toBe(1);
    });

    it('is a no-op for unknown track', () => {
      expect(() => modulationEngine.setMacro('nonexistent', 0, 0.5)).not.toThrow();
    });
  });

  describe('setLfoRate', () => {
    it('updates the LFO oscillator frequency', () => {
      const settings = makeSettings({
        slots: [{ source: 'lfo1', destination: 'filterCutoff', amount: 0.5, bipolar: true }],
      });
      modulationEngine.applyModulation('test-track', settings, makeMockTargets());
      modulationEngine.setLfoRate('test-track', 0, 5);
      expect(mocks.lastOsc.frequency.value).toBe(5);
    });
  });

  describe('removeTrack', () => {
    it('stops and disconnects all sources', () => {
      const settings = makeSettings({
        slots: [
          { source: 'lfo1', destination: 'filterCutoff', amount: 0.5, bipolar: true },
          { source: 'macro1', destination: 'amp', amount: 0.3, bipolar: false },
        ],
      });
      modulationEngine.applyModulation('test-track', settings, makeMockTargets());
      modulationEngine.removeTrack('test-track');
      // Each source is `stop()`ed exactly once (per source, not per slot).
      expect(mocks.oscStop).toHaveBeenCalledTimes(1);
      expect(mocks.constantStop).toHaveBeenCalledTimes(1);
      // Disconnect assertions are "at least once" — the slot's dispose
      // path and the source's dispose path both ask the upstream node
      // to disconnect, which is fine (native disconnect is idempotent).
      expect(mocks.oscDisconnect).toHaveBeenCalled();
      expect(mocks.constantDisconnect).toHaveBeenCalled();
    });

    it('is a no-op for unknown track', () => {
      expect(() => modulationEngine.removeTrack('nonexistent')).not.toThrow();
    });
  });

  describe('releaseAll', () => {
    it('removes all tracks', () => {
      const settings = makeSettings({
        slots: [{ source: 'lfo1', destination: 'filterCutoff', amount: 0.5, bipolar: true }],
      });
      modulationEngine.applyModulation('track-1', settings, makeMockTargets());
      modulationEngine.applyModulation('track-2', settings, makeMockTargets());
      modulationEngine.releaseAll();
      expect(mocks.oscStop).toHaveBeenCalledTimes(2);
    });
  });
});
