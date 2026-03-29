import { describe, it, expect, vi, beforeEach } from 'vitest';

const nativeGainIn = { connect: vi.fn(), disconnect: vi.fn(), __native: true } as unknown as AudioNode;
const nativeGainOut = { connect: vi.fn(), disconnect: vi.fn(), __native: true } as unknown as AudioNode;

vi.mock('tone', () => {
  return {
    EQ3: class {
      low = { value: 0 }; mid = { value: 0 }; high = { value: 0 };
      lowFrequency = { value: 0 }; highFrequency = { value: 0 };
      connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn();
      input = nativeGainIn; output = nativeGainOut;
    },
    Reverb: class {
      decay = 0; preDelay = 0; wet = { value: 0 };
      connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn();
      input = { input: nativeGainIn, _gainNode: nativeGainIn };
      output = { output: nativeGainOut, _gainNode: nativeGainOut };
    },
    FeedbackDelay: class {
      delayTime = { value: 0 }; feedback = { value: 0 }; wet = { value: 0 };
      connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn();
      input = { input: nativeGainIn, _gainNode: nativeGainIn };
      output = { output: nativeGainOut, _gainNode: nativeGainOut };
    },
    Compressor: class {
      threshold = { value: -24 }; ratio = { value: 4 }; attack = { value: 0.02 };
      release = { value: 0.2 }; knee = { value: 6 }; reduction = 0;
      connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn();
      input = nativeGainIn; output = nativeGainOut;
    },
    Distortion: class {
      distortion = 0; wet = { value: 0 };
      connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn();
      input = { input: nativeGainIn, _gainNode: nativeGainIn };
      output = { output: nativeGainOut, _gainNode: nativeGainOut };
    },
    Filter: class {
      frequency = { value: 0 }; Q = { value: 0 }; type = 'lowpass';
      connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn();
      input = nativeGainIn; output = nativeGainOut;
    },
    Gain: class {
      gain = { value: 1 };
      connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn();
      input = nativeGainIn; output = nativeGainOut;
      _gainNode = nativeGainIn;
    },
    LFO: class {
      frequency = { value: 0 }; min = 0; max = 0;
      start = vi.fn(); stop = vi.fn(); connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn();
    },
    Phaser: class {
      frequency = { value: 0 }; octaves = 0; stages = 0; Q = { value: 0 };
      baseFrequency = { value: 0 }; wet = { value: 0 };
      connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn();
      input = { input: nativeGainIn, _gainNode: nativeGainIn };
      output = { output: nativeGainOut, _gainNode: nativeGainOut };
    },
    Chorus: class {
      frequency = { value: 0 }; delayTime = 0; depth = 0; wet = { value: 0 };
      connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn(); start = vi.fn();
      input = { input: nativeGainIn, _gainNode: nativeGainIn };
      output = { output: nativeGainOut, _gainNode: nativeGainOut };
    },
    Convolver: class {
      normalize = true;
      buffer = null;
      connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn();
      input = { input: nativeGainIn, _gainNode: nativeGainIn };
      output = { output: nativeGainOut, _gainNode: nativeGainOut };
      load = vi.fn().mockResolvedValue(undefined);
    },
    ToneAudioBuffer: class {
      constructor() {}
    },
    getContext: () => ({
      sampleRate: 44100,
      createBuffer: (_channels: number, length: number, sampleRate: number) => ({
        copyToChannel: vi.fn(),
        length,
        sampleRate,
      }),
    }),
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

import { effectsEngine } from '../EffectsEngine';
import type { TrackEffect, ConvolverParams } from '../../types/project';

describe('EffectsEngine convolver', () => {
  beforeEach(() => {
    effectsEngine.disposeChain('track-conv');
  });

  function makeConvolverEffect(params?: Partial<ConvolverParams>): TrackEffect {
    return {
      id: 'effect-convolver',
      type: 'convolver',
      enabled: true,
      params: {
        irType: 'hall',
        wet: 0.5,
        preDelay: 0,
        ...params,
      },
    };
  }

  it('creates a convolver effect node and can get input/output', () => {
    const effect = makeConvolverEffect();
    effectsEngine.rebuildChain('track-conv', [effect]);

    const inputNode = effectsEngine.getInputNode('track-conv');
    const outputNode = effectsEngine.getOutputNode('track-conv');
    expect(inputNode).not.toBeNull();
    expect(outputNode).not.toBeNull();
  });

  it('builds a chain with convolver and another effect', () => {
    const reverb: TrackEffect = {
      id: 'effect-reverb',
      type: 'reverb',
      enabled: true,
      params: { decay: 1.5, preDelay: 0.01, wet: 0.5 },
    };
    const convolver = makeConvolverEffect();
    effectsEngine.rebuildChain('track-conv', [reverb, convolver]);

    const chain = effectsEngine.getChain('track-conv');
    expect(chain).toHaveLength(2);
    expect(chain[0].type).toBe('reverb');
    expect(chain[1].type).toBe('convolver');
  });

  it('disposes convolver cleanly', () => {
    const effect = makeConvolverEffect();
    effectsEngine.rebuildChain('track-conv', [effect]);
    expect(effectsEngine.getChain('track-conv')).toHaveLength(1);

    effectsEngine.disposeChain('track-conv');
    expect(effectsEngine.getChain('track-conv')).toHaveLength(0);
  });

  it('updates convolver params (wet)', () => {
    const effect = makeConvolverEffect({ wet: 0.3 });
    effectsEngine.rebuildChain('track-conv', [effect]);

    // Should not throw when updating params
    effectsEngine.updateEffectParams(
      'track-conv',
      'effect-convolver',
      { irType: 'largeHall', wet: 0.8, preDelay: 10 } satisfies ConvolverParams,
      'convolver',
    );
  });

  it('handles custom IR type with URL', () => {
    const effect = makeConvolverEffect({ irType: 'custom', irUrl: 'https://example.com/ir.wav' });
    effectsEngine.rebuildChain('track-conv', [effect]);

    const chain = effectsEngine.getChain('track-conv');
    expect(chain).toHaveLength(1);
    expect(chain[0].type).toBe('convolver');
  });
});
