import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockLfoStart = vi.fn();
const mockLfoStop = vi.fn();
const mockLfoDispose = vi.fn();
const mockLfoConnect = vi.fn();
const mockLfoFrequency = { value: 1 };

const mockSignalDispose = vi.fn();
const mockSignalConnect = vi.fn();
let mockSignalValue = 0;

const mockMultiplyConnect = vi.fn();
const mockMultiplyDispose = vi.fn();

vi.mock('tone', () => {
  return {
    LFO: class MockLFO {
      frequency = mockLfoFrequency;
      start = mockLfoStart;
      stop = mockLfoStop;
      dispose = mockLfoDispose;
      connect = mockLfoConnect;
    },
    Signal: class MockSignal {
      constructor(v: number) { mockSignalValue = v; }
      get value() { return mockSignalValue; }
      set value(v: number) { mockSignalValue = v; }
      dispose = mockSignalDispose;
      connect = mockSignalConnect;
    },
    Multiply: class MockMultiply {
      constructor(public factor: number) {}
      connect = mockMultiplyConnect;
      dispose = mockMultiplyDispose;
    },
    Param: class MockParam {},
  };
});

import { modulationEngine } from '../ModulationEngine';
import type { ModulationSettings } from '../../types/project';
import type { ModulationTargets } from '../ModulationEngine';

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
  return {
    filterCutoff: {} as ModulationTargets['filterCutoff'],
    amp: {} as ModulationTargets['amp'],
  };
}

describe('ModulationEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignalValue = 0;
  });

  afterEach(() => {
    modulationEngine.removeTrack('test-track');
  });

  describe('applyModulation', () => {
    it('does nothing with empty slots', () => {
      const settings = makeSettings({ slots: [] });
      modulationEngine.applyModulation('test-track', settings, makeMockTargets());
      // No LFOs should be created
      expect(mockLfoStart).not.toHaveBeenCalled();
    });

    it('creates LFO1 source and connects to filter cutoff', () => {
      const settings = makeSettings({
        slots: [{ source: 'lfo1', destination: 'filterCutoff', amount: 0.5, bipolar: true }],
      });
      modulationEngine.applyModulation('test-track', settings, makeMockTargets());
      expect(mockLfoStart).toHaveBeenCalled();
      expect(mockLfoConnect).toHaveBeenCalled();
      expect(mockMultiplyConnect).toHaveBeenCalled();
    });

    it('creates LFO2 source when used', () => {
      const settings = makeSettings({
        slots: [{ source: 'lfo2', destination: 'amp', amount: 0.3, bipolar: false }],
      });
      modulationEngine.applyModulation('test-track', settings, makeMockTargets());
      expect(mockLfoStart).toHaveBeenCalled();
    });

    it('creates macro source as Signal', () => {
      const settings = makeSettings({
        macros: [0.75, 0, 0, 0],
        slots: [{ source: 'macro1', destination: 'filterCutoff', amount: 1, bipolar: false }],
      });
      modulationEngine.applyModulation('test-track', settings, makeMockTargets());
      expect(mockSignalValue).toBe(0.75);
      expect(mockSignalConnect).toHaveBeenCalled();
    });

    it('reuses same source for multiple slots', () => {
      const settings = makeSettings({
        slots: [
          { source: 'lfo1', destination: 'filterCutoff', amount: 0.5, bipolar: true },
          { source: 'lfo1', destination: 'amp', amount: 0.3, bipolar: false },
        ],
      });
      modulationEngine.applyModulation('test-track', settings, makeMockTargets());
      // LFO should only be created once, but connected twice via two scalers
      expect(mockLfoStart).toHaveBeenCalledTimes(1);
      expect(mockMultiplyConnect).toHaveBeenCalledTimes(2);
    });

    it('skips slots with unavailable targets', () => {
      const settings = makeSettings({
        slots: [{ source: 'lfo1', destination: 'pan', amount: 0.5, bipolar: true }],
      });
      // Targets don't include 'pan'
      modulationEngine.applyModulation('test-track', settings, { filterCutoff: {} as never });
      // LFO created but no Multiply connected to target
      expect(mockMultiplyConnect).not.toHaveBeenCalled();
    });

    it('skips unsupported sources (velocity, modWheel, envelopes)', () => {
      const settings = makeSettings({
        slots: [{ source: 'velocity', destination: 'filterCutoff', amount: 0.5, bipolar: false }],
      });
      modulationEngine.applyModulation('test-track', settings, makeMockTargets());
      // No source created, no connection
      expect(mockLfoStart).not.toHaveBeenCalled();
      expect(mockMultiplyConnect).not.toHaveBeenCalled();
    });
  });

  describe('setMacro', () => {
    it('updates macro signal value', () => {
      const settings = makeSettings({
        macros: [0.5, 0, 0, 0],
        slots: [{ source: 'macro1', destination: 'filterCutoff', amount: 1, bipolar: false }],
      });
      modulationEngine.applyModulation('test-track', settings, makeMockTargets());
      modulationEngine.setMacro('test-track', 0, 0.8);
      expect(mockSignalValue).toBe(0.8);
    });

    it('clamps macro value to 0-1', () => {
      const settings = makeSettings({
        macros: [0, 0, 0, 0],
        slots: [{ source: 'macro1', destination: 'filterCutoff', amount: 1, bipolar: false }],
      });
      modulationEngine.applyModulation('test-track', settings, makeMockTargets());
      modulationEngine.setMacro('test-track', 0, 1.5);
      expect(mockSignalValue).toBe(1);
    });

    it('is a no-op for unknown track', () => {
      modulationEngine.setMacro('nonexistent', 0, 0.5);
      // Should not throw
    });
  });

  describe('setLfoRate', () => {
    it('updates LFO frequency', () => {
      const settings = makeSettings({
        slots: [{ source: 'lfo1', destination: 'filterCutoff', amount: 0.5, bipolar: true }],
      });
      modulationEngine.applyModulation('test-track', settings, makeMockTargets());
      modulationEngine.setLfoRate('test-track', 0, 5);
      expect(mockLfoFrequency.value).toBe(5);
    });
  });

  describe('removeTrack', () => {
    it('disposes all sources and connections', () => {
      const settings = makeSettings({
        slots: [
          { source: 'lfo1', destination: 'filterCutoff', amount: 0.5, bipolar: true },
          { source: 'macro1', destination: 'amp', amount: 0.3, bipolar: false },
        ],
      });
      modulationEngine.applyModulation('test-track', settings, makeMockTargets());
      modulationEngine.removeTrack('test-track');
      expect(mockLfoStop).toHaveBeenCalled();
      expect(mockLfoDispose).toHaveBeenCalled();
      expect(mockSignalDispose).toHaveBeenCalled();
      expect(mockMultiplyDispose).toHaveBeenCalledTimes(2);
    });

    it('is a no-op for unknown track', () => {
      modulationEngine.removeTrack('nonexistent');
      // Should not throw
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
      expect(mockLfoStop).toHaveBeenCalledTimes(2);
    });
  });
});
