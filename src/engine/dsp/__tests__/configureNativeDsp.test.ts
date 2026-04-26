/**
 * configureNativeDsp — unit tests
 *
 * Phase 5Q: Tone.js is uninstalled; `ToneDSPFactory` and
 * `revertToToneDsp` are gone (the latter is a preserved no-op for
 * external callers). Tests now only cover the install path.
 */
import { describe, it, expect, vi } from 'vitest';
import { configureNativeDsp, isNativeDsp } from '../configureNativeDsp';
import { getDSPFactory } from '../ToneAdapter';
import { NativeDSPFactory } from '../NativeAdapter';

function createMockCtx(): AudioContext {
  const mockParam = () => ({
    value: 0, defaultValue: 0, minValue: -3.4e38, maxValue: 3.4e38,
    cancelScheduledValues: vi.fn().mockReturnThis(),
    setValueAtTime: vi.fn().mockReturnThis(),
    linearRampToValueAtTime: vi.fn().mockReturnThis(),
    exponentialRampToValueAtTime: vi.fn().mockReturnThis(),
  });
  const mockNode = () => ({
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
  });

  return {
    sampleRate: 44100,
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
    createBuffer: () => ({ getChannelData: () => new Float32Array(1) }),
    createBufferSource: () => ({
      ...mockNode(),
      buffer: null,
      playbackRate: mockParam(),
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      onended: null,
      start: vi.fn(),
      stop: vi.fn(),
    }),
    decodeAudioData: vi.fn(),
  } as unknown as AudioContext;
}

describe('configureNativeDsp', () => {
  it('installs NativeDSPFactory as the global factory', () => {
    const ctx = createMockCtx();
    configureNativeDsp(ctx);
    expect(getDSPFactory()).toBeInstanceOf(NativeDSPFactory);
    expect(isNativeDsp()).toBe(true);
  });

  it('returns the installed NativeDSPFactory instance', () => {
    const ctx = createMockCtx();
    const factory = configureNativeDsp(ctx);
    expect(factory).toBeInstanceOf(NativeDSPFactory);
    expect(factory.sampleRate).toBe(44100);
  });

  it('exposes working effect nodes via the global factory', () => {
    const ctx = createMockCtx();
    configureNativeDsp(ctx);
    const factory = getDSPFactory();
    const gain = factory.createGain({ gain: 0.5 });
    expect(gain).toBeDefined();
    expect(gain.gain).toBeDefined();
  });

  it('exposes working synth nodes via the global factory', () => {
    const ctx = createMockCtx();
    configureNativeDsp(ctx);
    const factory = getDSPFactory();
    const synth = factory.createPolySynth();
    expect(synth).toBeDefined();
    expect(() => synth.triggerAttackRelease('C4', 0.5)).not.toThrow();
  });
});
