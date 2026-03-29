/**
 * Regression tests for issue #1188: intermittent silent playback requiring page refresh.
 *
 * Root causes:
 * 1. AudioEngine.resume() only handled 'suspended', not 'interrupted'
 * 2. extractPeaks in AddLayerPanel created unnecessary new AudioContext() instances
 * 3. Transport play() didn't call Tone.start() alongside engine.resume()
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal AudioContext mock for jsdom
// ---------------------------------------------------------------------------
function createMockAudioContext(initialState = 'running') {
  let _state = initialState;
  const mockCtx = {
    get state() { return _state; },
    _setState(s: string) { _state = s; },
    sampleRate: 48000,
    currentTime: 0,
    outputLatency: 0,
    baseLatency: 0,
    destination: { maxChannelCount: 2, channelCount: 2 },
    resume: vi.fn(async () => { _state = 'running'; }),
    suspend: vi.fn(async () => { _state = 'suspended'; }),
    close: vi.fn(async () => { _state = 'closed'; }),
    createGain: vi.fn(() => ({
      gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createBiquadFilter: vi.fn(() => ({
      type: 'lowpass',
      frequency: { value: 350 },
      Q: { value: 1 },
      gain: { value: 0 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createDynamicsCompressor: vi.fn(() => ({
      threshold: { value: -24 },
      ratio: { value: 12 },
      attack: { value: 0.003 },
      release: { value: 0.25 },
      knee: { value: 30 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createAnalyser: vi.fn(() => ({
      fftSize: 2048,
      frequencyBinCount: 1024,
      smoothingTimeConstant: 0.8,
      connect: vi.fn(),
      disconnect: vi.fn(),
      getByteFrequencyData: vi.fn(),
      getByteTimeDomainData: vi.fn(),
      getFloatFrequencyData: vi.fn(),
      getFloatTimeDomainData: vi.fn(),
    })),
    createChannelSplitter: vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createChannelMerger: vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createOscillator: vi.fn(() => ({
      frequency: { value: 440, setValueAtTime: vi.fn() },
      type: 'sine',
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    })),
    createMediaStreamDestination: vi.fn(),
    decodeAudioData: vi.fn(),
  };
  return mockCtx;
}

// ---------------------------------------------------------------------------
// AudioEngine.resume() should handle both 'suspended' and 'interrupted' states
// ---------------------------------------------------------------------------
describe('AudioEngine.resume() state handling', () => {
  let AudioEngine: typeof import('../../src/engine/AudioEngine').AudioEngine;
  let mockCtxInstance: ReturnType<typeof createMockAudioContext>;

  beforeEach(async () => {
    vi.resetModules();

    mockCtxInstance = createMockAudioContext('running');
    // @ts-expect-error mock
    globalThis.AudioContext = function () { return mockCtxInstance; };

    vi.doMock('tone', () => ({
      setContext: vi.fn(),
      getContext: vi.fn(() => ({ lookAhead: 0 })),
      start: vi.fn(),
      ToneAudioBuffer: class { static fromUrl = vi.fn(); },
    }));

    const mod = await import('../../src/engine/AudioEngine');
    AudioEngine = mod.AudioEngine;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resumes from suspended state', async () => {
    const engine = new AudioEngine();
    mockCtxInstance._setState('suspended');

    await engine.resume();
    expect(mockCtxInstance.resume).toHaveBeenCalled();
  });

  it('resumes from interrupted state', async () => {
    const engine = new AudioEngine();
    mockCtxInstance._setState('interrupted');

    await engine.resume();
    expect(mockCtxInstance.resume).toHaveBeenCalled();
  });

  it('does not call resume when already running', async () => {
    const engine = new AudioEngine();
    mockCtxInstance._setState('running');

    await engine.resume();
    expect(mockCtxInstance.resume).not.toHaveBeenCalled();
  });
});
