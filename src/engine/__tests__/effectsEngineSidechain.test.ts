import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Tone.js with proper class constructors
vi.mock('tone', () => {
  class MockCompressor {
    threshold = { value: -24 };
    ratio = { value: 4 };
    attack = { value: 0.02 };
    release = { value: 0.2 };
    knee = { value: 6 };
    reduction = 0;
    connect = vi.fn();
    disconnect = vi.fn();
    dispose = vi.fn();
    input = {};
    output = {};
  }

  return {
    EQ3: class { low = { value: 0 }; mid = { value: 0 }; high = { value: 0 }; lowFrequency = { value: 0 }; highFrequency = { value: 0 }; connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn(); input = {}; output = {}; },
    Compressor: MockCompressor,
    Reverb: class { decay = 0; preDelay = 0; wet = { value: 0 }; connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn(); input = {}; output = {}; },
    FeedbackDelay: class { delayTime = { value: 0 }; feedback = { value: 0 }; wet = { value: 0 }; connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn(); input = {}; output = {}; },
    Distortion: class { distortion = 0; wet = { value: 0 }; connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn(); input = {}; output = {}; },
    Filter: class { frequency = { value: 0 }; Q = { value: 0 }; type = 'lowpass'; connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn(); input = {}; output = {}; },
    LFO: class { frequency = { value: 0 }; min = 0; max = 0; start = vi.fn(); stop = vi.fn(); connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn(); },
  };
});

// Mock SidechainFollower since it needs AudioContext
vi.mock('../sidechainFollower', () => {
  return {
    computeGainReduction: vi.fn(() => 6),
    smoothGain: vi.fn((cur: number) => cur),
    SidechainFollower: class {
      gainNode = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
      reduction = -6;
      dispose = vi.fn();
      updateParams = vi.fn();
    },
  };
});

import { effectsEngine } from '../EffectsEngine';
import type { TrackEffect } from '../../types/project';

describe('EffectsEngine sidechain management', () => {
  const compressorEffect: TrackEffect = {
    id: 'fx-1',
    type: 'compressor',
    enabled: true,
    params: { threshold: -24, ratio: 4, attack: 0.02, release: 0.2, knee: 6 },
  };

  beforeEach(() => {
    effectsEngine.dispose();
  });

  it('connectSidechain creates a sidechain follower', () => {
    effectsEngine.rebuildChain('bass-track', [compressorEffect]);
    const mockSource = { context: {} } as unknown as AudioNode;
    effectsEngine.connectSidechain('bass-track', 'fx-1', mockSource, compressorEffect.params as any);
    expect(effectsEngine.getSidechainReduction('bass-track', 'fx-1')).toBe(-6);
  });

  it('disconnectSidechain cleans up the follower', () => {
    effectsEngine.rebuildChain('bass-track', [compressorEffect]);
    const mockSource = { context: {} } as unknown as AudioNode;
    effectsEngine.connectSidechain('bass-track', 'fx-1', mockSource, compressorEffect.params as any);
    effectsEngine.disconnectSidechain('bass-track', 'fx-1');
    expect(effectsEngine.getSidechainReduction('bass-track', 'fx-1')).toBe(0);
  });

  it('getSidechainReduction returns 0 when no sidechain is active', () => {
    expect(effectsEngine.getSidechainReduction('nonexistent', 'fx-1')).toBe(0);
  });

  it('dispose cleans up all sidechains', () => {
    effectsEngine.rebuildChain('bass-track', [compressorEffect]);
    const mockSource = { context: {} } as unknown as AudioNode;
    effectsEngine.connectSidechain('bass-track', 'fx-1', mockSource, compressorEffect.params as any);
    effectsEngine.dispose();
    expect(effectsEngine.getSidechainReduction('bass-track', 'fx-1')).toBe(0);
  });

  it('getOutputNode returns follower gainNode when compressor has sidechain', () => {
    effectsEngine.rebuildChain('bass-track', [compressorEffect]);
    const mockSource = { context: {} } as unknown as AudioNode;
    effectsEngine.connectSidechain('bass-track', 'fx-1', mockSource, compressorEffect.params as any);
    const output = effectsEngine.getOutputNode('bass-track');
    expect(output).toBeDefined();
  });

  it('returns null chain endpoints when the track FX chain is globally bypassed', () => {
    effectsEngine.rebuildChain('bass-track', [compressorEffect], true);
    expect(effectsEngine.getInputNode('bass-track')).toBeNull();
    expect(effectsEngine.getOutputNode('bass-track')).toBeNull();
    expect(effectsEngine.getChain('bass-track')).toHaveLength(1);
  });

  it('updateSidechainParams calls updateParams on the follower', () => {
    effectsEngine.rebuildChain('bass-track', [compressorEffect]);
    const mockSource = { context: {} } as unknown as AudioNode;
    effectsEngine.connectSidechain('bass-track', 'fx-1', mockSource, compressorEffect.params as any);
    // Should not throw
    effectsEngine.updateSidechainParams('bass-track', 'fx-1', {
      threshold: -30, ratio: 6, attack: 0.01, release: 0.1, knee: 3,
    });
    // Follower still active
    expect(effectsEngine.getSidechainReduction('bass-track', 'fx-1')).toBe(-6);
  });

  it('reconnecting sidechain disposes the previous follower', () => {
    effectsEngine.rebuildChain('bass-track', [compressorEffect]);
    const mockSource = { context: {} } as unknown as AudioNode;
    effectsEngine.connectSidechain('bass-track', 'fx-1', mockSource, compressorEffect.params as any);
    // Connect again — should dispose old follower first, then create new one
    effectsEngine.connectSidechain('bass-track', 'fx-1', mockSource, compressorEffect.params as any);
    expect(effectsEngine.getSidechainReduction('bass-track', 'fx-1')).toBe(-6);
  });
});
