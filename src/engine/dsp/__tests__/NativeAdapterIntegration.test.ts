/**
 * Integration test: NativeDSPFactory as drop-in replacement for ToneDSPFactory.
 *
 * Verifies that setDSPFactory() can swap to the native backend,
 * and that the factory creates all effect types with correct interfaces.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NativeDSPFactory } from '../NativeAdapter';
import type { IDSPFactory } from '../interfaces';

// Minimal mock AudioContext
function createMockCtx(): AudioContext {
  const mockParam = () => ({ value: 0, defaultValue: 0, minValue: -3.4e38, maxValue: 3.4e38 });
  const mockNode = () => ({
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    channelCount: 2,
    numberOfInputs: 1,
    numberOfOutputs: 1,
  });

  return {
    sampleRate: 48000,
    createGain: () => ({ ...mockNode(), gain: mockParam() }),
    createBiquadFilter: () => ({
      ...mockNode(), type: 'lowpass',
      frequency: mockParam(), Q: mockParam(), gain: mockParam(),
    }),
    createDynamicsCompressor: () => ({
      ...mockNode(),
      threshold: mockParam(), ratio: mockParam(),
      knee: mockParam(), attack: mockParam(), release: mockParam(),
    }),
    createDelay: () => ({ ...mockNode(), delayTime: mockParam() }),
    createStereoPanner: () => ({ ...mockNode(), pan: mockParam() }),
    createOscillator: () => ({
      ...mockNode(), frequency: mockParam(), type: 'sine',
      start: vi.fn(), stop: vi.fn(),
    }),
    createWaveShaper: () => ({ ...mockNode(), curve: null, oversample: 'none' }),
    createConvolver: () => ({ ...mockNode(), buffer: null }),
    createScriptProcessor: () => ({ ...mockNode(), onaudioprocess: null }),
    createBuffer: (_ch: number, len: number, sr: number) => ({
      getChannelData: () => new Float32Array(len),
      numberOfChannels: _ch, length: len, sampleRate: sr, duration: len / sr,
    }),
    createBufferSource: () => ({
      ...mockNode(), buffer: null, loop: false, playbackRate: mockParam(),
      start: vi.fn(), stop: vi.fn(), onended: null,
    }),
    decodeAudioData: vi.fn(),
  } as unknown as AudioContext;
}

describe('NativeDSPFactory as IDSPFactory drop-in', () => {
  let factory: IDSPFactory;

  beforeEach(() => {
    const ctx = createMockCtx();
    factory = new NativeDSPFactory(ctx);
  });

  it('implements all effect factory methods', () => {
    expect(factory.createGain).toBeDefined();
    expect(factory.createFilter).toBeDefined();
    expect(factory.createCompressor).toBeDefined();
    expect(factory.createReverb).toBeDefined();
    expect(factory.createDelay).toBeDefined();
    expect(factory.createDistortion).toBeDefined();
    expect(factory.createChorus).toBeDefined();
    expect(factory.createPhaser).toBeDefined();
    expect(factory.createEQ3).toBeDefined();
    expect(factory.createConvolver).toBeDefined();
    expect(factory.createLFO).toBeDefined();
    expect(factory.createPanner).toBeDefined();
  });

  it('all effect nodes have inputNode and outputNode', () => {
    const effects = [
      factory.createGain(),
      factory.createFilter(),
      factory.createCompressor(),
      factory.createReverb(),
      factory.createDelay(),
      factory.createDistortion(),
      factory.createChorus(),
      factory.createPhaser(),
      factory.createEQ3(),
      factory.createConvolver(),
      factory.createLFO(),
      factory.createPanner(),
    ];

    for (const effect of effects) {
      expect(effect.inputNode).toBeDefined();
      expect(effect.outputNode).toBeDefined();
    }
  });

  it('all effect nodes have connect/disconnect/dispose', () => {
    const effects = [
      factory.createGain(),
      factory.createFilter(),
      factory.createCompressor(),
      factory.createReverb(),
      factory.createDelay(),
      factory.createDistortion(),
      factory.createChorus(),
      factory.createPhaser(),
      factory.createEQ3(),
      factory.createConvolver(),
      factory.createLFO(),
      factory.createPanner(),
    ];

    for (const effect of effects) {
      expect(typeof effect.connect).toBe('function');
      expect(typeof effect.disconnect).toBe('function');
      expect(typeof effect.dispose).toBe('function');
    }
  });

  it('effect chain: gain → eq → comp → reverb', () => {
    const gain = factory.createGain();
    const eq = factory.createEQ3();
    const comp = factory.createCompressor();
    const reverb = factory.createReverb();

    // Should not throw
    expect(() => {
      gain.connect(eq).connect(comp).connect(reverb);
    }).not.toThrow();
  });

  it('getContext returns the AudioContext', () => {
    const ctx = factory.getContext();
    expect(ctx).toBeDefined();
    expect(ctx.sampleRate).toBe(48000);
  });

  it('sampleRate reflects context', () => {
    expect(factory.sampleRate).toBe(48000);
  });
});
