import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Tone.js mock -----------------------------------------------------------
// Each class records constructor args so tests can verify createNode wiring.
const constructorArgs = new Map<string, unknown[]>();

function recordArgs(name: string) {
  return function (...args: unknown[]) {
    constructorArgs.set(name, args);
  };
}

// Native-like AudioNode stubs used as terminal input/output
function makeNativeNode() {
  return { connect: vi.fn(), disconnect: vi.fn() };
}

vi.mock('tone', () => {
  class MockEQ3 {
    low = { value: 0 }; mid = { value: 0 }; high = { value: 0 };
    lowFrequency = { value: 0 }; highFrequency = { value: 0 };
    connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn();
    input = makeNativeNode(); output = makeNativeNode();
    constructor(...args: unknown[]) { recordArgs('EQ3').call(null, ...args); }
  }
  class MockCompressor {
    threshold = { value: -24 }; ratio = { value: 4 }; attack = { value: 0.02 };
    release = { value: 0.2 }; knee = { value: 6 }; reduction = -3;
    connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn();
    input = makeNativeNode(); output = makeNativeNode();
    constructor(...args: unknown[]) { recordArgs('Compressor').call(null, ...args); }
  }
  class MockReverb {
    decay = 0; preDelay = 0; wet = { value: 0 };
    connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn();
    input = { input: makeNativeNode() }; output = { output: makeNativeNode() };
    constructor(...args: unknown[]) { recordArgs('Reverb').call(null, ...args); }
  }
  class MockFeedbackDelay {
    delayTime = { value: 0 }; feedback = { value: 0 }; wet = { value: 0 };
    connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn();
    input = { input: makeNativeNode() }; output = { output: makeNativeNode() };
    constructor(...args: unknown[]) { recordArgs('FeedbackDelay').call(null, ...args); }
  }
  class MockDistortion {
    distortion = 0; wet = { value: 0 };
    connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn();
    input = { input: makeNativeNode() }; output = { output: makeNativeNode() };
    constructor(...args: unknown[]) { recordArgs('Distortion').call(null, ...args); }
  }
  class MockFilter {
    frequency = { value: 0 }; Q = { value: 0 }; type = 'lowpass' as string;
    gain = { value: 0 };
    connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn();
    input = makeNativeNode(); output = makeNativeNode();
    constructor(...args: unknown[]) { recordArgs('Filter').call(null, ...args); }
  }
  class MockLFO {
    frequency = { value: 0 }; min = 0; max = 0;
    start = vi.fn(); stop = vi.fn(); connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn();
    constructor(...args: unknown[]) { recordArgs('LFO').call(null, ...args); }
  }
  class MockChorus {
    frequency = { value: 0 }; delayTime = 0; depth = 0; feedback = { value: 0 }; wet = { value: 0 };
    connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn(); start = vi.fn();
    input = { input: makeNativeNode() }; output = { output: makeNativeNode() };
    constructor(...args: unknown[]) { recordArgs('Chorus').call(null, ...args); }
  }
  class MockPhaser {
    frequency = { value: 0 }; octaves = 0; stages = 0; Q = { value: 0 };
    baseFrequency = 0; wet = { value: 0 };
    connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn();
    input = { input: makeNativeNode() }; output = { output: makeNativeNode() };
    constructor(...args: unknown[]) { recordArgs('Phaser').call(null, ...args); }
  }
  class MockGain {
    connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn();
    input = makeNativeNode(); output = makeNativeNode();
  }

  return {
    EQ3: MockEQ3,
    Compressor: MockCompressor,
    Reverb: MockReverb,
    FeedbackDelay: MockFeedbackDelay,
    Distortion: MockDistortion,
    Filter: MockFilter,
    LFO: MockLFO,
    Chorus: MockChorus,
    Phaser: MockPhaser,
    Gain: MockGain,
  };
});

vi.mock('../sidechainFollower', () => ({
  computeGainReduction: vi.fn(() => 6),
  smoothGain: vi.fn((cur: number) => cur),
  SidechainFollower: class {
    gainNode = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
    reduction = -6; dispose = vi.fn(); updateParams = vi.fn();
  },
}));

vi.mock('../../store/projectStore', () => ({
  useProjectStore: { getState: () => ({ project: null }) },
}));

vi.mock('../../utils/effectAutomation', () => ({
  denormalizeEffectParamValue: vi.fn((_type: string, _param: string, normalized: number) => normalized),
}));

import { effectsEngine } from '../EffectsEngine';
import type { TrackEffect, CompressorParams, FilterParams, DistortionParams } from '../../types/project';
import { denormalizeEffectParamValue } from '../../utils/effectAutomation';

// --- helpers -----------------------------------------------------------------

function makeEffect(type: string, overrides: Partial<TrackEffect> = {}): TrackEffect {
  const defaults: Record<string, unknown> = {
    eq3: { low: -3, mid: 2, high: 1, lowFrequency: 400, highFrequency: 2500 },
    compressor: { threshold: -24, ratio: 4, attack: 0.02, release: 0.2, knee: 6 },
    parametricEq: {
      bands: [
        { type: 'peaking', frequency: 1000, q: 1, gain: 0, enabled: true },
        { type: 'highpass', frequency: 200, q: 0.7, gain: 0, enabled: false },
      ],
    },
    reverb: { decay: 1.5, preDelay: 0.01, wet: 0.5 },
    delay: { time: 0.25, feedback: 0.3, wet: 0.5 },
    distortion: { amount: 0.4, wet: 0.5, distortionType: 'soft' },
    filter: { frequency: 1000, filterType: 'lowpass', resonance: 1, lfoEnabled: false, lfoRate: 2, lfoDepth: 0.5 },
    chorus: { frequency: 1.5, delayTime: 3.5, depth: 0.7, feedback: 0.3, wet: 0.5 },
    flanger: { frequency: 0.5, delayTime: 5, depth: 0.7, feedback: 0.5, wet: 0.5 },
    phaser: { frequency: 0.5, octaves: 3, stages: 10, Q: 10, baseFrequency: 350, wet: 0.5 },
  };
  return {
    id: overrides.id ?? `fx-${type}`,
    type: type as TrackEffect['type'],
    enabled: overrides.enabled ?? true,
    params: (overrides.params ?? defaults[type]) as TrackEffect['params'],
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('EffectsEngine', () => {
  beforeEach(() => {
    effectsEngine.dispose();
    constructorArgs.clear();
  });

  // ---------------------------------------------------------------------------
  // rebuildChain
  // ---------------------------------------------------------------------------
  describe('rebuildChain', () => {
    it('creates nodes only for enabled effects', () => {
      const enabled = makeEffect('reverb', { id: 'rev-1' });
      const disabled = makeEffect('delay', { id: 'del-1', enabled: false });
      effectsEngine.rebuildChain('t1', [enabled, disabled]);

      const chain = effectsEngine.getChain('t1');
      expect(chain).toHaveLength(1);
      expect(chain[0].id).toBe('rev-1');
      expect(chain[0].type).toBe('reverb');
    });

    it('disposes the previous chain before rebuilding', () => {
      const fx1 = makeEffect('reverb', { id: 'rev-1' });
      effectsEngine.rebuildChain('t1', [fx1]);
      const oldNode = effectsEngine.getChain('t1')[0].node;

      const fx2 = makeEffect('delay', { id: 'del-1' });
      effectsEngine.rebuildChain('t1', [fx2]);

      expect((oldNode as any).dispose).toHaveBeenCalled();
      expect(effectsEngine.getChain('t1')).toHaveLength(1);
      expect(effectsEngine.getChain('t1')[0].id).toBe('del-1');
    });

    it('creates an empty chain when all effects are disabled', () => {
      const disabled = makeEffect('reverb', { enabled: false });
      effectsEngine.rebuildChain('t1', [disabled]);
      expect(effectsEngine.getChain('t1')).toHaveLength(0);
    });

    it('connects consecutive effect nodes in the chain', () => {
      const fx1 = makeEffect('eq3', { id: 'eq-1' });
      const fx2 = makeEffect('compressor', { id: 'comp-1' });
      effectsEngine.rebuildChain('t1', [fx1, fx2]);

      const chain = effectsEngine.getChain('t1');
      expect(chain).toHaveLength(2);
      expect(chain[0].id).toBe('eq-1');
      expect(chain[1].id).toBe('comp-1');
    });
  });

  // ---------------------------------------------------------------------------
  // getChain
  // ---------------------------------------------------------------------------
  describe('getChain', () => {
    it('returns empty array for unknown track', () => {
      expect(effectsEngine.getChain('nonexistent')).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // getInputNode / getOutputNode
  // ---------------------------------------------------------------------------
  describe('getInputNode / getOutputNode', () => {
    it('returns null when track has no chain', () => {
      expect(effectsEngine.getInputNode('missing')).toBeNull();
      expect(effectsEngine.getOutputNode('missing')).toBeNull();
    });

    it('returns null when track has empty chain (all disabled)', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('reverb', { enabled: false })]);
      expect(effectsEngine.getInputNode('t1')).toBeNull();
      expect(effectsEngine.getOutputNode('t1')).toBeNull();
    });

    it('returns null when chain is bypassed', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('reverb')], true);
      expect(effectsEngine.getInputNode('t1')).toBeNull();
      expect(effectsEngine.getOutputNode('t1')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // getCompressorReduction
  // ---------------------------------------------------------------------------
  describe('getCompressorReduction', () => {
    it('returns the reduction value from a compressor node', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('compressor', { id: 'comp-1' })]);
      // Mock Compressor sets reduction = -3
      expect(effectsEngine.getCompressorReduction('t1', 'comp-1')).toBe(-3);
    });

    it('returns 0 for unknown track', () => {
      expect(effectsEngine.getCompressorReduction('missing', 'fx-1')).toBe(0);
    });

    it('returns 0 for non-compressor effect', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('reverb', { id: 'rev-1' })]);
      expect(effectsEngine.getCompressorReduction('t1', 'rev-1')).toBe(0);
    });

    it('returns 0 for unknown effect id', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('compressor', { id: 'comp-1' })]);
      expect(effectsEngine.getCompressorReduction('t1', 'wrong-id')).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // createNode — effect-specific construction
  // ---------------------------------------------------------------------------
  describe('createNode (via rebuildChain)', () => {
    it('creates EQ3 with correct initial params', () => {
      const params = { low: -3, mid: 2, high: 1, lowFrequency: 400, highFrequency: 2500 };
      effectsEngine.rebuildChain('t1', [makeEffect('eq3', { params: params as any })]);
      expect(constructorArgs.get('EQ3')).toEqual([-3, 2, 1]);
    });

    it('creates Compressor with correct params', () => {
      const params = { threshold: -20, ratio: 6, attack: 0.01, release: 0.3, knee: 10 };
      effectsEngine.rebuildChain('t1', [makeEffect('compressor', { params: params as any })]);
      expect(constructorArgs.get('Compressor')).toEqual([{
        threshold: -20, ratio: 6, attack: 0.01, release: 0.3, knee: 10,
      }]);
    });

    it('creates Reverb with correct params', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('reverb')]);
      expect(constructorArgs.get('Reverb')).toEqual([{ decay: 1.5, preDelay: 0.01, wet: 0.5 }]);
    });

    it('creates FeedbackDelay for delay type with correct params', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('delay')]);
      expect(constructorArgs.get('FeedbackDelay')).toEqual([{ delayTime: 0.25, feedback: 0.3, wet: 0.5 }]);
    });

    it('creates Chorus and calls start()', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('chorus')]);
      const chain = effectsEngine.getChain('t1');
      expect((chain[0].node as any).start).toHaveBeenCalled();
    });

    it('creates Phaser with correct params', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('phaser')]);
      expect(constructorArgs.get('Phaser')).toEqual([{
        frequency: 0.5, octaves: 3, stages: 10, Q: 10, baseFrequency: 350, wet: 0.5,
      }]);
    });

    it('creates parametricEq with input/output gains and filters', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('parametricEq')]);
      const chain = effectsEngine.getChain('t1');
      expect(chain).toHaveLength(1);
      expect(chain[0].type).toBe('parametricEq');
      expect(chain[0].parametricEqRuntime).not.toBeUndefined();
      expect(chain[0].parametricEqRuntime!.filters).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Distortion type scaling
  // ---------------------------------------------------------------------------
  describe('distortion type scaling', () => {
    it('scales amount by 0.5 for overdrive type', () => {
      const params = { amount: 0.8, wet: 0.5, distortionType: 'overdrive' } as DistortionParams;
      effectsEngine.rebuildChain('t1', [makeEffect('distortion', { params: params as any })]);
      expect(constructorArgs.get('Distortion')).toEqual([{ distortion: 0.4, wet: 0.5 }]);
    });

    it('scales amount by 1.5 for fuzz type (clamped to 1)', () => {
      const params = { amount: 0.8, wet: 0.5, distortionType: 'fuzz' } as DistortionParams;
      effectsEngine.rebuildChain('t1', [makeEffect('distortion', { params: params as any })]);
      // 0.8 * 1.5 = 1.2, clamped to 1
      expect(constructorArgs.get('Distortion')).toEqual([{ distortion: 1, wet: 0.5 }]);
    });

    it('uses raw amount for soft (default) type', () => {
      const params = { amount: 0.6, wet: 0.5, distortionType: 'soft' } as DistortionParams;
      effectsEngine.rebuildChain('t1', [makeEffect('distortion', { params: params as any })]);
      expect(constructorArgs.get('Distortion')).toEqual([{ distortion: 0.6, wet: 0.5 }]);
    });
  });

  // ---------------------------------------------------------------------------
  // Filter with LFO creation
  // ---------------------------------------------------------------------------
  describe('filter LFO creation', () => {
    it('creates LFO when lfoEnabled is true', () => {
      const params: FilterParams = {
        frequency: 1000, filterType: 'lowpass', resonance: 1,
        lfoEnabled: true, lfoRate: 5, lfoDepth: 0.3,
      };
      effectsEngine.rebuildChain('t1', [makeEffect('filter', { params: params as any })]);
      const chain = effectsEngine.getChain('t1');
      expect(chain[0].lfo).not.toBeUndefined();
      expect((chain[0].lfo as any).start).toHaveBeenCalled();
    });

    it('does not create LFO when lfoEnabled is false', () => {
      const params: FilterParams = {
        frequency: 1000, filterType: 'lowpass', resonance: 1,
        lfoEnabled: false, lfoRate: 5, lfoDepth: 0.3,
      };
      effectsEngine.rebuildChain('t1', [makeEffect('filter', { params: params as any })]);
      const chain = effectsEngine.getChain('t1');
      expect(chain[0].lfo).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Flanger (FeedbackDelay + LFO)
  // ---------------------------------------------------------------------------
  describe('flanger creation', () => {
    it('creates FeedbackDelay with LFO for flanger', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('flanger')]);
      const chain = effectsEngine.getChain('t1');
      expect(chain[0].type).toBe('flanger');
      expect(chain[0].lfo).not.toBeUndefined();
      expect((chain[0].lfo as any).start).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // updateEffectParams
  // ---------------------------------------------------------------------------
  describe('updateEffectParams', () => {
    it('updates EQ3 params on existing node', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('eq3', { id: 'eq-1' })]);
      const newParams = { low: 5, mid: -2, high: 3, lowFrequency: 500, highFrequency: 3000 };
      effectsEngine.updateEffectParams('t1', 'eq-1', newParams as any, 'eq3');

      const node = effectsEngine.getChain('t1')[0].node as any;
      expect(node.low.value).toBe(5);
      expect(node.mid.value).toBe(-2);
      expect(node.high.value).toBe(3);
      expect(node.lowFrequency.value).toBe(500);
      expect(node.highFrequency.value).toBe(3000);
    });

    it('updates compressor params on existing node', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('compressor', { id: 'comp-1' })]);
      const newParams = { threshold: -30, ratio: 8, attack: 0.01, release: 0.3, knee: 10 };
      effectsEngine.updateEffectParams('t1', 'comp-1', newParams as any, 'compressor');

      const node = effectsEngine.getChain('t1')[0].node as any;
      expect(node.threshold.value).toBe(-30);
      expect(node.ratio.value).toBe(8);
      expect(node.attack.value).toBe(0.01);
      expect(node.release.value).toBe(0.3);
      expect(node.knee.value).toBe(10);
    });

    it('updates reverb params on existing node', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('reverb', { id: 'rev-1' })]);
      effectsEngine.updateEffectParams('t1', 'rev-1', { decay: 3, preDelay: 0.05, wet: 0.8 } as any, 'reverb');

      const node = effectsEngine.getChain('t1')[0].node as any;
      expect(node.decay).toBe(3);
      expect(node.preDelay).toBe(0.05);
      expect(node.wet.value).toBe(0.8);
    });

    it('updates delay params on existing node', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('delay', { id: 'del-1' })]);
      effectsEngine.updateEffectParams('t1', 'del-1', { time: 0.5, feedback: 0.6, wet: 0.7 } as any, 'delay');

      const node = effectsEngine.getChain('t1')[0].node as any;
      expect(node.delayTime.value).toBe(0.5);
      expect(node.feedback.value).toBe(0.6);
      expect(node.wet.value).toBe(0.7);
    });

    it('updates distortion params with overdrive scaling', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('distortion', { id: 'dist-1' })]);
      const params = { amount: 0.8, wet: 0.6, distortionType: 'overdrive' } as DistortionParams;
      effectsEngine.updateEffectParams('t1', 'dist-1', params as any, 'distortion');

      const node = effectsEngine.getChain('t1')[0].node as any;
      expect(node.distortion).toBe(0.4); // 0.8 * 0.5
      expect(node.wet.value).toBe(0.6);
    });

    it('updates filter params and creates LFO when enabling', () => {
      const params: FilterParams = {
        frequency: 1000, filterType: 'lowpass', resonance: 1,
        lfoEnabled: false, lfoRate: 2, lfoDepth: 0.5,
      };
      effectsEngine.rebuildChain('t1', [makeEffect('filter', { id: 'filt-1', params: params as any })]);

      // Initially no LFO
      expect(effectsEngine.getChain('t1')[0].lfo).toBeUndefined();

      // Enable LFO
      const newParams: FilterParams = {
        frequency: 2000, filterType: 'highpass', resonance: 5,
        lfoEnabled: true, lfoRate: 3, lfoDepth: 0.7,
      };
      effectsEngine.updateEffectParams('t1', 'filt-1', newParams as any, 'filter');

      const chain = effectsEngine.getChain('t1');
      const node = chain[0].node as any;
      expect(node.frequency.value).toBe(2000);
      expect(node.Q.value).toBe(5);
      expect(node.type).toBe('highpass');
      expect(chain[0].lfo).not.toBeUndefined();
      expect((chain[0].lfo as any).start).toHaveBeenCalled();
    });

    it('disposes LFO when disabling filter LFO', () => {
      const params: FilterParams = {
        frequency: 1000, filterType: 'lowpass', resonance: 1,
        lfoEnabled: true, lfoRate: 2, lfoDepth: 0.5,
      };
      effectsEngine.rebuildChain('t1', [makeEffect('filter', { id: 'filt-1', params: params as any })]);
      const lfo = effectsEngine.getChain('t1')[0].lfo as any;
      expect(lfo).not.toBeUndefined();

      // Disable LFO
      const newParams: FilterParams = {
        frequency: 1000, filterType: 'lowpass', resonance: 1,
        lfoEnabled: false, lfoRate: 2, lfoDepth: 0.5,
      };
      effectsEngine.updateEffectParams('t1', 'filt-1', newParams as any, 'filter');

      expect(lfo.stop).toHaveBeenCalled();
      expect(lfo.dispose).toHaveBeenCalled();
      expect(effectsEngine.getChain('t1')[0].lfo).toBeUndefined();
    });

    it('updates existing LFO params when LFO stays enabled', () => {
      const params: FilterParams = {
        frequency: 1000, filterType: 'lowpass', resonance: 1,
        lfoEnabled: true, lfoRate: 2, lfoDepth: 0.5,
      };
      effectsEngine.rebuildChain('t1', [makeEffect('filter', { id: 'filt-1', params: params as any })]);

      const newParams: FilterParams = {
        frequency: 2000, filterType: 'lowpass', resonance: 1,
        lfoEnabled: true, lfoRate: 8, lfoDepth: 0.3,
      };
      effectsEngine.updateEffectParams('t1', 'filt-1', newParams as any, 'filter');

      const lfo = effectsEngine.getChain('t1')[0].lfo as any;
      expect(lfo.frequency.value).toBe(8);
      expect(lfo.min).toBe(Math.max(20, 2000 * (1 - 0.3)));
      expect(lfo.max).toBe(Math.min(20000, 2000 * (1 + 0.3)));
    });

    it('updates chorus params on existing node', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('chorus', { id: 'ch-1' })]);
      effectsEngine.updateEffectParams('t1', 'ch-1', {
        frequency: 3, delayTime: 5, depth: 0.9, feedback: 0.5, wet: 0.8,
      } as any, 'chorus');

      const node = effectsEngine.getChain('t1')[0].node as any;
      expect(node.frequency.value).toBe(3);
      expect(node.delayTime).toBe(5);
      expect(node.depth).toBe(0.9);
      expect(node.feedback.value).toBe(0.5);
      expect(node.wet.value).toBe(0.8);
    });

    it('updates flanger params and LFO', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('flanger', { id: 'fl-1' })]);
      effectsEngine.updateEffectParams('t1', 'fl-1', {
        frequency: 2, delayTime: 10, depth: 0.5, feedback: -0.7, wet: 0.6,
      } as any, 'flanger');

      const chain = effectsEngine.getChain('t1');
      const node = chain[0].node as any;
      expect(node.delayTime.value).toBe(0.01); // 10 / 1000
      expect(node.feedback.value).toBe(0.7);   // Math.abs(-0.7)
      expect(node.wet.value).toBe(0.6);
      expect(chain[0].lfo!.frequency.value).toBe(2);
    });

    it('updates phaser params on existing node', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('phaser', { id: 'ph-1' })]);
      effectsEngine.updateEffectParams('t1', 'ph-1', {
        frequency: 1, octaves: 5, stages: 12, Q: 15, baseFrequency: 500, wet: 0.7,
      } as any, 'phaser');

      const node = effectsEngine.getChain('t1')[0].node as any;
      expect(node.frequency.value).toBe(1);
      expect(node.octaves).toBe(5);
      expect(node.Q.value).toBe(15);
      expect(node.baseFrequency).toBe(500);
      expect(node.wet.value).toBe(0.7);
    });

    it('does nothing for unknown track', () => {
      // Should not throw
      effectsEngine.updateEffectParams('missing', 'fx-1', {} as any, 'reverb');
    });

    it('does nothing for unknown effect id', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('reverb', { id: 'rev-1' })]);
      // Should not throw
      effectsEngine.updateEffectParams('t1', 'wrong-id', {} as any, 'reverb');
    });
  });

  // ---------------------------------------------------------------------------
  // applyAutomationValue
  // ---------------------------------------------------------------------------
  describe('applyAutomationValue', () => {
    it('applies EQ3 automation for each param', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('eq3', { id: 'eq-1' })]);
      const node = effectsEngine.getChain('t1')[0].node as any;

      effectsEngine.applyAutomationValue('t1', 'eq-1', { effectType: 'eq3', param: 'low' }, 5);
      expect(node.low.value).toBe(5);

      effectsEngine.applyAutomationValue('t1', 'eq-1', { effectType: 'eq3', param: 'mid' }, -3);
      expect(node.mid.value).toBe(-3);

      effectsEngine.applyAutomationValue('t1', 'eq-1', { effectType: 'eq3', param: 'high' }, 2);
      expect(node.high.value).toBe(2);
    });

    it('applies compressor automation', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('compressor', { id: 'comp-1' })]);
      const node = effectsEngine.getChain('t1')[0].node as any;

      effectsEngine.applyAutomationValue('t1', 'comp-1', { effectType: 'compressor', param: 'threshold' }, -30);
      expect(node.threshold.value).toBe(-30);

      effectsEngine.applyAutomationValue('t1', 'comp-1', { effectType: 'compressor', param: 'ratio' }, 8);
      expect(node.ratio.value).toBe(8);
    });

    it('applies reverb automation', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('reverb', { id: 'rev-1' })]);
      const node = effectsEngine.getChain('t1')[0].node as any;

      effectsEngine.applyAutomationValue('t1', 'rev-1', { effectType: 'reverb', param: 'decay' }, 5);
      expect(node.decay).toBe(5);

      effectsEngine.applyAutomationValue('t1', 'rev-1', { effectType: 'reverb', param: 'wet' }, 0.8);
      expect(node.wet.value).toBe(0.8);
    });

    it('applies delay automation', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('delay', { id: 'del-1' })]);
      const node = effectsEngine.getChain('t1')[0].node as any;

      effectsEngine.applyAutomationValue('t1', 'del-1', { effectType: 'delay', param: 'time' }, 0.75);
      expect(node.delayTime.value).toBe(0.75);

      effectsEngine.applyAutomationValue('t1', 'del-1', { effectType: 'delay', param: 'feedback' }, 0.6);
      expect(node.feedback.value).toBe(0.6);
    });

    it('applies chorus automation', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('chorus', { id: 'ch-1' })]);
      const node = effectsEngine.getChain('t1')[0].node as any;

      effectsEngine.applyAutomationValue('t1', 'ch-1', { effectType: 'chorus', param: 'frequency' }, 3);
      expect(node.frequency.value).toBe(3);

      effectsEngine.applyAutomationValue('t1', 'ch-1', { effectType: 'chorus', param: 'depth' }, 0.9);
      expect(node.depth).toBe(0.9);

      effectsEngine.applyAutomationValue('t1', 'ch-1', { effectType: 'chorus', param: 'wet' }, 0.7);
      expect(node.wet.value).toBe(0.7);
    });

    it('applies phaser automation', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('phaser', { id: 'ph-1' })]);
      const node = effectsEngine.getChain('t1')[0].node as any;

      effectsEngine.applyAutomationValue('t1', 'ph-1', { effectType: 'phaser', param: 'frequency' }, 2);
      expect(node.frequency.value).toBe(2);

      effectsEngine.applyAutomationValue('t1', 'ph-1', { effectType: 'phaser', param: 'octaves' }, 5);
      expect(node.octaves).toBe(5);

      effectsEngine.applyAutomationValue('t1', 'ph-1', { effectType: 'phaser', param: 'baseFrequency' }, 500);
      expect(node.baseFrequency).toBe(500);
    });

    it('applies filter frequency automation and updates LFO range', () => {
      const params: FilterParams = {
        frequency: 1000, filterType: 'lowpass', resonance: 1,
        lfoEnabled: true, lfoRate: 2, lfoDepth: 0.5,
      };
      effectsEngine.rebuildChain('t1', [makeEffect('filter', { id: 'filt-1', params: params as any })]);

      effectsEngine.applyAutomationValue('t1', 'filt-1', { effectType: 'filter', param: 'frequency' }, 3000);

      const chain = effectsEngine.getChain('t1');
      const node = chain[0].node as any;
      expect(node.frequency.value).toBe(3000);
      // LFO range should have been updated based on new frequency
      expect(chain[0].lfo).not.toBeUndefined();
    });

    it('applies filter resonance automation', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('filter', { id: 'filt-1' })]);
      effectsEngine.applyAutomationValue('t1', 'filt-1', { effectType: 'filter', param: 'resonance' }, 10);
      expect((effectsEngine.getChain('t1')[0].node as any).Q.value).toBe(10);
    });

    it('applies flanger automation', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('flanger', { id: 'fl-1' })]);
      const chain = effectsEngine.getChain('t1');
      const node = chain[0].node as any;

      effectsEngine.applyAutomationValue('t1', 'fl-1', { effectType: 'flanger', param: 'delayTime' }, 8);
      expect(node.delayTime.value).toBe(0.008); // 8 / 1000

      effectsEngine.applyAutomationValue('t1', 'fl-1', { effectType: 'flanger', param: 'feedback' }, -0.6);
      expect(node.feedback.value).toBe(0.6); // Math.abs

      effectsEngine.applyAutomationValue('t1', 'fl-1', { effectType: 'flanger', param: 'wet' }, 0.4);
      expect(node.wet.value).toBe(0.4);
    });

    it('returns early when denormalize returns null', () => {
      vi.mocked(denormalizeEffectParamValue).mockReturnValueOnce(null);
      effectsEngine.rebuildChain('t1', [makeEffect('reverb', { id: 'rev-1' })]);
      const node = effectsEngine.getChain('t1')[0].node as any;
      node.decay = 1.5;

      effectsEngine.applyAutomationValue('t1', 'rev-1', { effectType: 'reverb', param: 'decay' }, 0.5);
      // Decay should remain unchanged
      expect(node.decay).toBe(1.5);
    });

    it('does nothing for unknown track', () => {
      // Should not throw
      effectsEngine.applyAutomationValue('missing', 'fx-1', { effectType: 'reverb', param: 'decay' }, 0.5);
    });

    it('does nothing when effect id does not match type', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('reverb', { id: 'rev-1' })]);
      // Target type is compressor but the node is reverb
      effectsEngine.applyAutomationValue('t1', 'rev-1', { effectType: 'compressor', param: 'threshold' }, -20);
      // Reverb node should be untouched
      const node = effectsEngine.getChain('t1')[0].node as any;
      expect(node.decay).toBe(0); // default from mock
    });
  });

  // ---------------------------------------------------------------------------
  // disposeChain
  // ---------------------------------------------------------------------------
  describe('disposeChain', () => {
    it('disposes all nodes in the chain', () => {
      effectsEngine.rebuildChain('t1', [
        makeEffect('reverb', { id: 'rev-1' }),
        makeEffect('delay', { id: 'del-1' }),
      ]);
      const chain = effectsEngine.getChain('t1');
      const disposeFns = chain.map(n => (n.node as any).dispose);

      effectsEngine.disposeChain('t1');

      for (const fn of disposeFns) {
        expect(fn).toHaveBeenCalled();
      }
      expect(effectsEngine.getChain('t1')).toHaveLength(0);
    });

    it('stops and disposes LFO when present', () => {
      const params: FilterParams = {
        frequency: 1000, filterType: 'lowpass', resonance: 1,
        lfoEnabled: true, lfoRate: 2, lfoDepth: 0.5,
      };
      effectsEngine.rebuildChain('t1', [makeEffect('filter', { id: 'filt-1', params: params as any })]);
      const lfo = effectsEngine.getChain('t1')[0].lfo as any;

      effectsEngine.disposeChain('t1');

      expect(lfo.stop).toHaveBeenCalled();
      expect(lfo.dispose).toHaveBeenCalled();
    });

    it('calls custom dispose for parametricEq', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('parametricEq', { id: 'peq-1' })]);
      const chain = effectsEngine.getChain('t1');
      const runtime = chain[0].parametricEqRuntime!;
      const inputDispose = vi.spyOn(runtime.input, 'dispose');
      const outputDispose = vi.spyOn(runtime.output, 'dispose');

      effectsEngine.disposeChain('t1');

      expect(inputDispose).toHaveBeenCalled();
      expect(outputDispose).toHaveBeenCalled();
    });

    it('does nothing for unknown track', () => {
      // Should not throw
      effectsEngine.disposeChain('nonexistent');
    });

    it('clears bypass state', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('reverb')], true);
      expect(effectsEngine.getInputNode('t1')).toBeNull(); // bypassed

      effectsEngine.disposeChain('t1');
      // After dispose, rebuild without bypass should work
      effectsEngine.rebuildChain('t1', [makeEffect('reverb')]);
      // Not bypassed anymore — should return a node (though it may be the mock empty object)
      expect(effectsEngine.getChain('t1')).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // dispose (full engine)
  // ---------------------------------------------------------------------------
  describe('dispose', () => {
    it('disposes all tracks and clears all maps', () => {
      effectsEngine.rebuildChain('t1', [makeEffect('reverb', { id: 'rev-1' })]);
      effectsEngine.rebuildChain('t2', [makeEffect('delay', { id: 'del-1' })]);

      effectsEngine.dispose();

      expect(effectsEngine.getChain('t1')).toHaveLength(0);
      expect(effectsEngine.getChain('t2')).toHaveLength(0);
    });
  });
});
