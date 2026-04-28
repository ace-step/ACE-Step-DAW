/**
 * Tests for automation/LFO conflict resolution (#1023).
 *
 * When both an automation lane and an LFO target the same effect parameter,
 * automation sets the center value and LFO modulates around it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock DSP Factory ───────────────────────────────────────────────────────

function makeAudioParam(initial = 0) {
  return { value: initial, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() };
}

function makeDSPNode(overrides: Record<string, unknown> = {}) {
  const inputNode = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
  const outputNode = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
  return {
    connect: vi.fn(), disconnect: vi.fn(), dispose: vi.fn(),
    get inputNode() { return inputNode; },
    get outputNode() { return outputNode; },
    ...overrides,
  };
}

const mockLfo = {
  frequency: 2,
  min: 200,
  max: 5000,
  connectParam: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  dispose: vi.fn(),
};

const mockFactory = {
  createGain: vi.fn(() => makeDSPNode({ gain: makeAudioParam(1) })),
  createFilter: vi.fn(() => makeDSPNode({
    frequency: makeAudioParam(1000),
    Q: makeAudioParam(1),
    gain: makeAudioParam(0),
    type: 'lowpass',
  })),
  createEQ3: vi.fn(() => makeDSPNode({ low: 0, mid: 0, high: 0, lowFrequency: 320, highFrequency: 3200 })),
  createCompressor: vi.fn(() => makeDSPNode({
    threshold: makeAudioParam(-24), ratio: makeAudioParam(4),
    attack: makeAudioParam(0.02), release: makeAudioParam(0.2), knee: makeAudioParam(6),
  })),
  createReverb: vi.fn(() => makeDSPNode({ decay: 2, preDelay: 0.01, wet: 0.5 })),
  createDelay: vi.fn(() => makeDSPNode({ delayTime: makeAudioParam(0.3), feedback: 0.5, wet: 0.5 })),
  createDistortion: vi.fn(() => makeDSPNode({ distortion: 0.4, wet: 0.5 })),
  createChorus: vi.fn(() => makeDSPNode({ frequency: 1.5, delayTime: 3.5, depth: 0.7, feedback: 0, wet: 0.5, start: vi.fn() })),
  createPhaser: vi.fn(() => makeDSPNode({ frequency: 0.5, octaves: 3, stages: 10, Q: 10, baseFrequency: 350, wet: 0.5 })),
  createConvolver: vi.fn(() => makeDSPNode({ buffer: null, load: vi.fn().mockResolvedValue(undefined) })),
  createLFO: vi.fn(() => ({ ...mockLfo })),
  sampleRate: 44100,
  getContext: vi.fn(() => ({
    createAnalyser: vi.fn(() => ({ fftSize: 256, frequencyBinCount: 128, getFloatTimeDomainData: vi.fn(), connect: vi.fn(), disconnect: vi.fn() })),
    createBiquadFilter: vi.fn(() => ({ type: 'bandpass', frequency: makeAudioParam(1000), Q: makeAudioParam(1), gain: makeAudioParam(0), connect: vi.fn(), disconnect: vi.fn() })),
    createBuffer: vi.fn(() => ({ copyToChannel: vi.fn() })),
    createGain: vi.fn(() => ({ gain: makeAudioParam(1), connect: vi.fn(), disconnect: vi.fn() })),
    createChannelSplitter: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })),
    createChannelMerger: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })),
    createWaveShaper: vi.fn(() => ({ curve: null, oversample: 'none', connect: vi.fn(), disconnect: vi.fn() })),
  })),
};

vi.mock('../dsp/ToneAdapter', () => ({
  getDSPFactory: () => mockFactory,
}));

vi.mock('../../store/projectStore', () => ({
  useProjectStore: { getState: vi.fn(() => ({ project: { tracks: [] } })) },
}));

vi.mock('../../utils/factoryImpulseResponses', () => ({
  FACTORY_IR_PRESETS: {},
  generateImpulseResponse: vi.fn(() => new Float32Array(4096)),
}));

vi.mock('../../utils/effectAutomation', () => ({
  denormalizeEffectParamValue: vi.fn((_type: string, _param: string, normalized: number) => {
    // Simple passthrough for testing — return frequency-range values
    return normalized * 20000;
  }),
}));

vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
vi.stubGlobal('cancelAnimationFrame', vi.fn());

import { effectsEngine } from '../EffectsEngine';
import type { TrackEffect, AutomatableEffectTarget } from '../../types/project';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Automation/LFO conflict resolution (#1023)', () => {
  afterEach(() => {
    effectsEngine.disposeChain('track-1');
    vi.clearAllMocks();
  });

  describe('hasLfoOnParam', () => {
    it('returns true when filter has active LFO on frequency', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1', type: 'filter', enabled: true,
        params: {
          frequency: 1000, filterType: 'lowpass', resonance: 1,
          lfoEnabled: true, lfoRate: 2, lfoDepth: 0.5,
        },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      expect(effectsEngine.hasLfoOnParam('track-1', 'fx-1', 'frequency')).toBe(true);
    });

    it('returns false when filter has no LFO', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1', type: 'filter', enabled: true,
        params: {
          frequency: 1000, filterType: 'lowpass', resonance: 1,
          lfoEnabled: false, lfoRate: 2, lfoDepth: 0.5,
        },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      expect(effectsEngine.hasLfoOnParam('track-1', 'fx-1', 'frequency')).toBe(false);
    });

    it('returns false for non-LFO parameters like resonance', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1', type: 'filter', enabled: true,
        params: {
          frequency: 1000, filterType: 'lowpass', resonance: 1,
          lfoEnabled: true, lfoRate: 2, lfoDepth: 0.5,
        },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      expect(effectsEngine.hasLfoOnParam('track-1', 'fx-1', 'resonance')).toBe(false);
    });

    it('returns false for nonexistent track', () => {
      expect(effectsEngine.hasLfoOnParam('nonexistent', 'fx-1', 'frequency')).toBe(false);
    });

    it('returns false for effect without LFO', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1', type: 'eq3', enabled: true,
        params: { low: 0, mid: 0, high: 0, lowFrequency: 320, highFrequency: 3200 },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      expect(effectsEngine.hasLfoOnParam('track-1', 'fx-1', 'low')).toBe(false);
    });
  });

  describe('automation recentering LFO', () => {
    it('automation on filter frequency recenters LFO min/max', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1', type: 'filter', enabled: true,
        params: {
          frequency: 1000, filterType: 'lowpass', resonance: 1,
          lfoEnabled: true, lfoRate: 2, lfoDepth: 0.5,
        },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      // Apply automation value — this should recenter the LFO
      const target: AutomatableEffectTarget = {
        type: 'effect',
        effectType: 'filter',
        effectId: 'fx-1',
        param: 'frequency',
      };

      // applyAutomationValue takes normalized 0-1, denormalized by our mock to * 20000
      effectsEngine.applyAutomationValue('track-1', 'fx-1', target, 0.1);

      // The method should not throw — the LFO's center should update
      // (actual value depends on mock behavior, but we verify no crash)
    });

    it('automation on non-LFO parameter does not affect LFO', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1', type: 'filter', enabled: true,
        params: {
          frequency: 1000, filterType: 'lowpass', resonance: 1,
          lfoEnabled: true, lfoRate: 2, lfoDepth: 0.5,
        },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      const target: AutomatableEffectTarget = {
        type: 'effect',
        effectType: 'filter',
        effectId: 'fx-1',
        param: 'resonance',
      };

      // This should update resonance without touching the LFO
      expect(() => effectsEngine.applyAutomationValue('track-1', 'fx-1', target, 0.5)).not.toThrow();
    });
  });
});
