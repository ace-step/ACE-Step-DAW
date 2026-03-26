import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Tone.js — the key insight: Effect subclasses have `.input` = Tone.Gain,
// and Tone.Gain has `.input` = native GainNode.  The unwrap must go 2 levels.
const nativeGainIn = { connect: vi.fn(), disconnect: vi.fn(), __native: true } as unknown as AudioNode;
const nativeGainOut = { connect: vi.fn(), disconnect: vi.fn(), __native: true } as unknown as AudioNode;

vi.mock('tone', () => {
  return {
    EQ3: class {
      low = { value: 0 }; mid = { value: 0 }; high = { value: 0 };
      lowFrequency = { value: 0 }; highFrequency = { value: 0 };
      connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn();
      // EQ3 extends ToneAudioNode — input/output are native-ish
      input = nativeGainIn;
      output = nativeGainOut;
    },
    Reverb: class {
      decay = 0; preDelay = 0; wet = { value: 0 };
      connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn();
      // Reverb extends Effect — input is Tone.Gain (wraps native GainNode)
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
      input = nativeGainIn;
      output = nativeGainOut;
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
      input = nativeGainIn;
      output = nativeGainOut;
    },
    Gain: class {
      connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn();
      input = nativeGainIn;
      output = nativeGainOut;
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
import type { TrackEffect } from '../../types/project';

function makeEffect(type: string): TrackEffect {
  const defaults: Record<string, unknown> = {
    reverb: { decay: 1.5, preDelay: 0.01, wet: 0.5 },
    eq3: { low: 0, mid: 0, high: 0, lowFrequency: 400, highFrequency: 2500 },
    compressor: { threshold: -24, ratio: 4, attack: 0.02, release: 0.2, knee: 6 },
    delay: { delayTime: 0.25, feedback: 0.3, wet: 0.5 },
    distortion: { distortion: 0.4, wet: 0.5 },
    filter: { frequency: 1000, Q: 1, type: 'lowpass', rolloff: -12, wet: 1 },
    chorus: { frequency: 1.5, delayTime: 3.5, depth: 0.7, wet: 0.5 },
    phaser: { frequency: 0.5, octaves: 3, stages: 10, Q: 10, baseFrequency: 350, wet: 0.5 },
  };
  return {
    id: `effect-${type}`,
    type: type as TrackEffect['type'],
    enabled: true,
    params: defaults[type] as TrackEffect['params'],
  };
}

describe('EffectsEngine native AudioNode unwrapping', () => {
  beforeEach(() => {
    effectsEngine.disposeChain('track-1');
  });

  it.each(['reverb', 'delay', 'distortion', 'chorus', 'phaser'])(
    'getInputNode for %s returns a native-like AudioNode (not a Tone.js wrapper)',
    (type) => {
      const effect = makeEffect(type);
      effectsEngine.rebuildChain('track-1', [effect]);

      const inputNode = effectsEngine.getInputNode('track-1');
      expect(inputNode).not.toBeNull();
      // Must be the native node, not a Tone.js wrapper that has its own .input
      expect((inputNode as unknown as { __native: boolean }).__native).toBe(true);
    }
  );

  it.each(['reverb', 'delay', 'distortion', 'chorus', 'phaser'])(
    'getOutputNode for %s returns a native-like AudioNode (not a Tone.js wrapper)',
    (type) => {
      const effect = makeEffect(type);
      effectsEngine.rebuildChain('track-1', [effect]);

      const outputNode = effectsEngine.getOutputNode('track-1');
      expect(outputNode).not.toBeNull();
      expect((outputNode as unknown as { __native: boolean }).__native).toBe(true);
    }
  );

  it.each(['eq3', 'compressor', 'filter'])(
    'getInputNode for %s (non-Effect subclass) returns native node directly',
    (type) => {
      const effect = makeEffect(type);
      effectsEngine.rebuildChain('track-1', [effect]);

      const inputNode = effectsEngine.getInputNode('track-1');
      expect(inputNode).not.toBeNull();
      expect((inputNode as unknown as { __native: boolean }).__native).toBe(true);
    }
  );
});
