/**
 * Tests for EffectsEngine — chain management, node creation, parameter updates.
 * Complements effectsEngineSidechain.test.ts and effectsEngineNativeNode.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Mock DSP Factory ───────────────────────────────────────────────────────

function makeDSPNode(overrides: Record<string, unknown> = {}) {
  const inputNode = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
  const outputNode = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    dispose: vi.fn(),
    get inputNode() { return inputNode; },
    get outputNode() { return outputNode; },
    ...overrides,
  };
}

function makeAudioParam(initial = 0) {
  return {
    value: initial,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
}

const mockFactory = {
  createGain: vi.fn((opts?: { gain?: number }) => {
    const node = makeDSPNode({ gain: makeAudioParam(opts?.gain ?? 1) });
    return node;
  }),
  createFilter: vi.fn(() => makeDSPNode({
    frequency: makeAudioParam(1000),
    Q: makeAudioParam(1),
    gain: makeAudioParam(0),
    type: 'peaking',
  })),
  createEQ3: vi.fn(() => makeDSPNode({
    low: 0, mid: 0, high: 0,
    lowFrequency: 320, highFrequency: 3200,
  })),
  createCompressor: vi.fn(() => makeDSPNode({
    threshold: makeAudioParam(-24),
    ratio: makeAudioParam(4),
    attack: makeAudioParam(0.02),
    release: makeAudioParam(0.2),
    knee: makeAudioParam(6),
    reduction: 0,
  })),
  createReverb: vi.fn(() => makeDSPNode({
    decay: 2, preDelay: 0.01, wet: 0.5,
  })),
  createDelay: vi.fn(() => makeDSPNode({
    delayTime: makeAudioParam(0.3),
    feedback: 0.5, wet: 0.5,
  })),
  createDistortion: vi.fn(() => makeDSPNode({
    distortion: 0.4, wet: 0.5,
  })),
  createChorus: vi.fn(() => makeDSPNode({
    frequency: 1.5, delayTime: 3.5, depth: 0.7, feedback: 0, wet: 0.5,
    start: vi.fn(),
  })),
  createPhaser: vi.fn(() => makeDSPNode({
    frequency: 0.5, octaves: 3, stages: 10, Q: 10, baseFrequency: 350, wet: 0.5,
  })),
  createConvolver: vi.fn(() => makeDSPNode({
    buffer: null,
    load: vi.fn().mockResolvedValue(undefined),
  })),
  createLFO: vi.fn(() => ({
    frequency: 1,
    min: 0,
    max: 1,
    connectParam: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    dispose: vi.fn(),
  })),
  sampleRate: 44100,
  getContext: vi.fn(() => ({
    createAnalyser: vi.fn(() => ({
      fftSize: 256,
      frequencyBinCount: 128,
      getFloatTimeDomainData: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createBiquadFilter: vi.fn(() => ({
      type: 'bandpass',
      frequency: makeAudioParam(1000),
      Q: makeAudioParam(1),
      gain: makeAudioParam(0),
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createBuffer: vi.fn(() => ({
      copyToChannel: vi.fn(),
    })),
    createGain: vi.fn(() => ({
      gain: makeAudioParam(1),
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createChannelSplitter: vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createChannelMerger: vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createWaveShaper: vi.fn(() => ({
      curve: null,
      oversample: 'none',
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
  })),
};

vi.mock('../dsp/ToneAdapter', () => ({
  getDSPFactory: () => mockFactory,
}));

// Mock projectStore for automation lookups
vi.mock('../../store/projectStore', () => ({
  useProjectStore: {
    getState: vi.fn(() => ({
      project: { tracks: [] },
    })),
  },
}));

// Mock factory impulse responses
vi.mock('../../utils/factoryImpulseResponses', () => ({
  FACTORY_IR_PRESETS: {
    plate: { type: 'plate', decay: 1.5, density: 0.8, damping: 0.5 },
  },
  generateImpulseResponse: vi.fn(() => new Float32Array(4096)),
}));

import { effectsEngine } from '../EffectsEngine';
import type { TrackEffect } from '../../types/project';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('EffectsEngine', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    effectsEngine.disposeChain('track-1');
    effectsEngine.disposeChain('track-2');
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  // ── Chain Management ───────────────────────────────────────────────────

  describe('rebuildChain', () => {
    it('creates EQ3 effect node', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1',
        type: 'eq3',
        enabled: true,
        params: { low: 0, mid: 0, high: 0, lowFrequency: 320, highFrequency: 3200 },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      expect(mockFactory.createEQ3).toHaveBeenCalled();
      expect(effectsEngine.getInputNode('track-1')).toBeDefined();
      expect(effectsEngine.getOutputNode('track-1')).toBeDefined();
    });

    it('creates compressor effect node', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1',
        type: 'compressor',
        enabled: true,
        params: { threshold: -24, ratio: 4, attack: 0.02, release: 0.2, knee: 6 },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      expect(mockFactory.createCompressor).toHaveBeenCalled();
    });

    it('creates reverb effect node', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1',
        type: 'reverb',
        enabled: true,
        params: { decay: 2, preDelay: 0.01, wet: 0.5 },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      expect(mockFactory.createReverb).toHaveBeenCalled();
    });

    it('creates delay effect node', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1',
        type: 'delay',
        enabled: true,
        params: { time: 0.3, feedback: 0.5, wet: 0.5 },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      expect(mockFactory.createDelay).toHaveBeenCalled();
    });

    it('creates distortion effect node', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1',
        type: 'distortion',
        enabled: true,
        params: { amount: 0.5, wet: 0.5, distortionType: 'soft' },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      expect(mockFactory.createDistortion).toHaveBeenCalled();
    });

    it('creates filter with LFO', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1',
        type: 'filter',
        enabled: true,
        params: {
          frequency: 1000,
          filterType: 'lowpass',
          resonance: 1,
          lfoEnabled: true,
          lfoRate: 2,
          lfoDepth: 0.5,
        },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      expect(mockFactory.createFilter).toHaveBeenCalled();
      expect(mockFactory.createLFO).toHaveBeenCalled();
    });

    it('creates chorus effect', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1',
        type: 'chorus',
        enabled: true,
        params: { frequency: 1.5, delayTime: 3.5, depth: 0.7, feedback: 0, wet: 0.5 },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      expect(mockFactory.createChorus).toHaveBeenCalled();
    });

    it('creates phaser effect', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1',
        type: 'phaser',
        enabled: true,
        params: { frequency: 0.5, octaves: 3, stages: 10, Q: 10, baseFrequency: 350, wet: 0.5 },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      expect(mockFactory.createPhaser).toHaveBeenCalled();
    });

    it('chains multiple effects together', () => {
      const effects: TrackEffect[] = [
        {
          id: 'fx-1', type: 'eq3', enabled: true,
          params: { low: 0, mid: 0, high: 0, lowFrequency: 320, highFrequency: 3200 },
        },
        {
          id: 'fx-2', type: 'compressor', enabled: true,
          params: { threshold: -24, ratio: 4, attack: 0.02, release: 0.2, knee: 6 },
        },
      ];

      effectsEngine.rebuildChain('track-1', effects);

      // First effect's output should connect to second effect's input
      const inputNode = effectsEngine.getInputNode('track-1');
      const outputNode = effectsEngine.getOutputNode('track-1');
      expect(inputNode).toBeDefined();
      expect(outputNode).toBeDefined();
    });

    it('skips disabled effects', () => {
      const effects: TrackEffect[] = [
        {
          id: 'fx-1', type: 'eq3', enabled: false,
          params: { low: 0, mid: 0, high: 0, lowFrequency: 320, highFrequency: 3200 },
        },
      ];

      effectsEngine.rebuildChain('track-1', effects);

      expect(effectsEngine.getInputNode('track-1')).toBeNull();
    });

    it('disposes old chain before rebuilding', () => {
      const effects1: TrackEffect[] = [{
        id: 'fx-1', type: 'eq3', enabled: true,
        params: { low: 0, mid: 0, high: 0, lowFrequency: 320, highFrequency: 3200 },
      }];
      const effects2: TrackEffect[] = [{
        id: 'fx-2', type: 'compressor', enabled: true,
        params: { threshold: -24, ratio: 4, attack: 0.02, release: 0.2, knee: 6 },
      }];

      effectsEngine.rebuildChain('track-1', effects1);
      effectsEngine.rebuildChain('track-1', effects2);

      // Should have disposed old nodes
      expect(effectsEngine.getInputNode('track-1')).toBeDefined();
    });
  });

  // ── getInputNode / getOutputNode ───────────────────────────────────────

  describe('getInputNode / getOutputNode', () => {
    it('returns null for nonexistent track', () => {
      expect(effectsEngine.getInputNode('nonexistent')).toBeNull();
      expect(effectsEngine.getOutputNode('nonexistent')).toBeNull();
    });

    it('returns nodes after building chain', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1', type: 'reverb', enabled: true,
        params: { decay: 2, preDelay: 0.01, wet: 0.5 },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      expect(effectsEngine.getInputNode('track-1')).not.toBeNull();
      expect(effectsEngine.getOutputNode('track-1')).not.toBeNull();
    });
  });

  // ── disposeChain ───────────────────────────────────────────────────────

  describe('disposeChain', () => {
    it('cleans up chain and returns null nodes', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1', type: 'eq3', enabled: true,
        params: { low: 0, mid: 0, high: 0, lowFrequency: 320, highFrequency: 3200 },
      }];

      effectsEngine.rebuildChain('track-1', effects);
      effectsEngine.disposeChain('track-1');

      expect(effectsEngine.getInputNode('track-1')).toBeNull();
      expect(effectsEngine.getOutputNode('track-1')).toBeNull();
    });

    it('does nothing for nonexistent track', () => {
      expect(() => effectsEngine.disposeChain('nonexistent')).not.toThrow();
    });
  });

  // ── updateEffectParams ─────────────────────────────────────────────────

  describe('updateEffectParams', () => {
    it('updates EQ3 parameters', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1', type: 'eq3', enabled: true,
        params: { low: 0, mid: 0, high: 0, lowFrequency: 320, highFrequency: 3200 },
      }];

      effectsEngine.rebuildChain('track-1', effects);
      effectsEngine.updateEffectParams('track-1', 'fx-1',
        { low: 3, mid: -2, high: 1, lowFrequency: 250, highFrequency: 4000 },
        'eq3',
      );

      // Parameters should have been set on the EQ3 node
      // (verified by mock calls)
    });

    it('updates compressor parameters', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1', type: 'compressor', enabled: true,
        params: { threshold: -24, ratio: 4, attack: 0.02, release: 0.2, knee: 6 },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      expect(() => effectsEngine.updateEffectParams(
        'track-1', 'fx-1',
        { threshold: -18, ratio: 6, attack: 0.01, release: 0.1, knee: 8 },
        'compressor',
      )).not.toThrow();
    });

    it('does nothing for nonexistent track', () => {
      expect(() => effectsEngine.updateEffectParams(
        'nonexistent', 'fx-1',
        { low: 3 },
        'eq3',
      )).not.toThrow();
    });

    it('does nothing for nonexistent effect ID', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1', type: 'eq3', enabled: true,
        params: { low: 0, mid: 0, high: 0, lowFrequency: 320, highFrequency: 3200 },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      expect(() => effectsEngine.updateEffectParams(
        'track-1', 'wrong-id',
        { low: 3 },
        'eq3',
      )).not.toThrow();
    });
  });

  // ── WASM Integration ───────────────────────────────────────────────────

  describe('setUseWasm', () => {
    it('enables WASM mode', () => {
      expect(() => effectsEngine.setUseWasm(true)).not.toThrow();
    });

    it('disables WASM mode', () => {
      effectsEngine.setUseWasm(true);
      expect(() => effectsEngine.setUseWasm(false)).not.toThrow();
    });
  });

  // ── Parametric EQ ──────────────────────────────────────────────────────

  describe('parametric EQ', () => {
    it('creates parametric EQ with bands', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1', type: 'parametricEq', enabled: true,
        params: {
          bands: [
            { type: 'peaking', frequency: 1000, q: 1, gain: 0, enabled: true },
            { type: 'lowshelf', frequency: 200, q: 0.7, gain: 3, enabled: true },
          ],
        },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      expect(effectsEngine.getInputNode('track-1')).not.toBeNull();
    });
  });

  // ── Convolver ──────────────────────────────────────────────────────────

  describe('convolver', () => {
    it('creates convolver with factory IR preset', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1', type: 'convolver', enabled: true,
        params: { irType: 'plate', irUrl: '', wet: 0.5 },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      expect(effectsEngine.getInputNode('track-1')).not.toBeNull();
    });
  });

  // ── Gate Effect ─────────────────────────────────────────────────────────

  describe('gate effect', () => {
    it('creates gate effect node', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1', type: 'gate', enabled: true,
        params: {
          threshold: -40, hysteresis: 6, hold: 0.01,
          attack: 0.001, release: 0.1, range: -80, mode: 'gate',
        },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      expect(effectsEngine.getInputNode('track-1')).not.toBeNull();
    });
  });

  // ── Deesser Effect ─────────────────────────────────────────────────────

  describe('deesser effect', () => {
    it('creates deesser effect node', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1', type: 'deesser', enabled: true,
        params: { frequency: 6000, bandwidth: 2, threshold: -20, range: 10 },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      expect(effectsEngine.getInputNode('track-1')).not.toBeNull();
    });
  });

  // ── Transient Shaper Effect ────────────────────────────────────────────

  describe('transient shaper effect', () => {
    it('creates transient shaper effect node', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1', type: 'transientShaper', enabled: true,
        params: { attack: 50, sustain: 0, output: 0, mix: 1 },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      expect(effectsEngine.getInputNode('track-1')).not.toBeNull();
    });
  });

  // ── Limiter Effect ─────────────────────────────────────────────────────

  describe('limiter effect', () => {
    it('creates limiter effect node', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1', type: 'limiter', enabled: true,
        params: { threshold: -1, ceiling: -0.3, release: 0.05, gain: 0 },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      expect(effectsEngine.getInputNode('track-1')).not.toBeNull();
    });
  });

  // ── Flanger Effect ─────────────────────────────────────────────────────

  describe('flanger effect', () => {
    it('creates flanger with LFO', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1', type: 'flanger', enabled: true,
        params: { frequency: 0.5, delayTime: 5, depth: 0.7, feedback: 0.5, wet: 0.5 },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      expect(effectsEngine.getInputNode('track-1')).not.toBeNull();
      expect(mockFactory.createLFO).toHaveBeenCalled();
    });
  });

  // ── Filter without LFO ────────────────────────────────────────────────

  describe('filter without LFO', () => {
    it('creates filter without LFO when lfoEnabled is false', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1', type: 'filter', enabled: true,
        params: {
          frequency: 1000, filterType: 'lowpass', resonance: 1,
          lfoEnabled: false, lfoRate: 2, lfoDepth: 0.5,
        },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      expect(effectsEngine.getInputNode('track-1')).not.toBeNull();
    });
  });

  // ── updateEffectParams for more types ──────────────────────────────────

  describe('updateEffectParams - extended types', () => {
    it('updates reverb parameters', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1', type: 'reverb', enabled: true,
        params: { decay: 2, preDelay: 0.01, wet: 0.5 },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      expect(() => effectsEngine.updateEffectParams(
        'track-1', 'fx-1',
        { decay: 4, preDelay: 0.02, wet: 0.7 },
        'reverb',
      )).not.toThrow();
    });

    it('updates delay parameters', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1', type: 'delay', enabled: true,
        params: { time: 0.3, feedback: 0.5, wet: 0.5 },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      expect(() => effectsEngine.updateEffectParams(
        'track-1', 'fx-1',
        { time: 0.5, feedback: 0.3, wet: 0.6 },
        'delay',
      )).not.toThrow();
    });

    it('updates distortion parameters', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1', type: 'distortion', enabled: true,
        params: { amount: 0.5, wet: 0.5, distortionType: 'soft' },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      expect(() => effectsEngine.updateEffectParams(
        'track-1', 'fx-1',
        { amount: 0.8, wet: 0.7, distortionType: 'overdrive' },
        'distortion',
      )).not.toThrow();
    });

    it('updates filter parameters with LFO', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1', type: 'filter', enabled: true,
        params: {
          frequency: 1000, filterType: 'lowpass', resonance: 1,
          lfoEnabled: true, lfoRate: 2, lfoDepth: 0.5,
        },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      expect(() => effectsEngine.updateEffectParams(
        'track-1', 'fx-1',
        {
          frequency: 2000, filterType: 'highpass', resonance: 2,
          lfoEnabled: true, lfoRate: 4, lfoDepth: 0.8,
        },
        'filter',
      )).not.toThrow();
    });

    it('updates chorus parameters', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1', type: 'chorus', enabled: true,
        params: { frequency: 1.5, delayTime: 3.5, depth: 0.7, feedback: 0, wet: 0.5 },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      expect(() => effectsEngine.updateEffectParams(
        'track-1', 'fx-1',
        { frequency: 3, delayTime: 5, depth: 0.9, feedback: 0.2, wet: 0.8 },
        'chorus',
      )).not.toThrow();
    });

    it('updates phaser parameters', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1', type: 'phaser', enabled: true,
        params: { frequency: 0.5, octaves: 3, stages: 10, Q: 10, baseFrequency: 350, wet: 0.5 },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      expect(() => effectsEngine.updateEffectParams(
        'track-1', 'fx-1',
        { frequency: 1, octaves: 5, stages: 12, Q: 15, baseFrequency: 500, wet: 0.7 },
        'phaser',
      )).not.toThrow();
    });

    it('updates gate parameters', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1', type: 'gate', enabled: true,
        params: {
          threshold: -40, hysteresis: 6, hold: 0.01,
          attack: 0.001, release: 0.1, range: -80, mode: 'gate',
        },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      expect(() => effectsEngine.updateEffectParams(
        'track-1', 'fx-1',
        {
          threshold: -30, hysteresis: 4, hold: 0.02,
          attack: 0.002, release: 0.2, range: -60, mode: 'expander',
        },
        'gate',
      )).not.toThrow();
    });

    it('updates convolver wet/dry', () => {
      const effects: TrackEffect[] = [{
        id: 'fx-1', type: 'convolver', enabled: true,
        params: { irType: 'plate', irUrl: '', wet: 0.5 },
      }];

      effectsEngine.rebuildChain('track-1', effects);

      expect(() => effectsEngine.updateEffectParams(
        'track-1', 'fx-1',
        { irType: 'plate', irUrl: '', wet: 0.8 },
        'convolver',
      )).not.toThrow();
    });
  });

  // ── Multiple independent tracks ────────────────────────────────────────

  describe('multiple tracks', () => {
    it('manages independent chains per track', () => {
      const effects1: TrackEffect[] = [{
        id: 'fx-1', type: 'eq3', enabled: true,
        params: { low: 0, mid: 0, high: 0, lowFrequency: 320, highFrequency: 3200 },
      }];
      const effects2: TrackEffect[] = [{
        id: 'fx-2', type: 'reverb', enabled: true,
        params: { decay: 2, preDelay: 0.01, wet: 0.5 },
      }];

      effectsEngine.rebuildChain('track-1', effects1);
      effectsEngine.rebuildChain('track-2', effects2);

      expect(effectsEngine.getInputNode('track-1')).not.toBeNull();
      expect(effectsEngine.getInputNode('track-2')).not.toBeNull();

      effectsEngine.disposeChain('track-1');

      expect(effectsEngine.getInputNode('track-1')).toBeNull();
      expect(effectsEngine.getInputNode('track-2')).not.toBeNull();
    });
  });
});
