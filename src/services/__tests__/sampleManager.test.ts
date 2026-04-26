import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getSample,
  cacheUserSample,
  getBuiltInSampleIds,
  clearSampleCache,
} from '../sampleManager';

// ── Web Audio mocks ─────────────────────────────────────────────

function makeAudioBuffer(duration = 0.5): AudioBuffer {
  return {
    duration,
    length: Math.ceil(duration * 44100),
    numberOfChannels: 1,
    sampleRate: 44100,
    getChannelData: vi.fn(() => new Float32Array(Math.ceil(duration * 44100))),
    copyFromChannel: vi.fn(),
    copyToChannel: vi.fn(),
  } as unknown as AudioBuffer;
}

function makeAudioParam(defaultValue = 0): AudioParam {
  return {
    value: defaultValue,
    defaultValue,
    minValue: -3.4028235e38,
    maxValue: 3.4028235e38,
    setValueAtTime: vi.fn().mockReturnThis(),
    linearRampToValueAtTime: vi.fn().mockReturnThis(),
    exponentialRampToValueAtTime: vi.fn().mockReturnThis(),
    setTargetAtTime: vi.fn().mockReturnThis(),
    setValueCurveAtTime: vi.fn().mockReturnThis(),
    cancelScheduledValues: vi.fn().mockReturnThis(),
    cancelAndHoldAtTime: vi.fn().mockReturnThis(),
    automationRate: 'a-rate',
  } as unknown as AudioParam;
}

function makeOscillatorNode(): OscillatorNode {
  return {
    type: 'sine',
    frequency: makeAudioParam(440),
    detune: makeAudioParam(0),
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as OscillatorNode;
}

function makeGainNode(): GainNode {
  return {
    gain: makeAudioParam(1),
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
  } as unknown as GainNode;
}

function makeBiquadFilterNode(): BiquadFilterNode {
  return {
    type: 'lowpass',
    frequency: makeAudioParam(350),
    Q: makeAudioParam(1),
    gain: makeAudioParam(0),
    detune: makeAudioParam(0),
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
  } as unknown as BiquadFilterNode;
}

function makeBufferSource(): AudioBufferSourceNode {
  return {
    buffer: null,
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    playbackRate: makeAudioParam(1),
    loop: false,
    loopStart: 0,
    loopEnd: 0,
  } as unknown as AudioBufferSourceNode;
}

const renderedBuffer = makeAudioBuffer(0.5);

vi.stubGlobal('OfflineAudioContext', vi.fn().mockImplementation(function (this: Record<string, unknown>, channels: number, length: number, sampleRate: number) {
  const ctx = {
    sampleRate,
    length,
    destination: { maxChannelCount: channels } as AudioDestinationNode,
    createOscillator: vi.fn(() => makeOscillatorNode()),
    createGain: vi.fn(() => makeGainNode()),
    createBiquadFilter: vi.fn(() => makeBiquadFilterNode()),
    createBufferSource: vi.fn(() => makeBufferSource()),
    createBuffer: vi.fn((ch: number, len: number, sr: number) => makeAudioBuffer(len / sr)),
    startRendering: vi.fn(async () => renderedBuffer),
  };
  Object.assign(this, ctx);
  return this;
}));

// ── Tests ─────────────────────────────────────────────────────────

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('sampleManager', () => {
  beforeEach(() => {
    clearSampleCache();
  });

  describe('getBuiltInSampleIds', () => {
    it('returns all built-in drum sample keys', () => {
      const ids = getBuiltInSampleIds();
      expect(ids).toContain('kick');
      expect(ids).toContain('snare');
      expect(ids).toContain('closed_hh');
      expect(ids).toContain('open_hh');
      expect(ids).toContain('clap');
      expect(ids).toContain('rim');
      expect(ids).toContain('low_tom');
      expect(ids).toContain('high_tom');
      expect(ids).toHaveLength(8);
    });
  });

  describe('getSample', () => {
    const ctx = { sampleRate: 44100 } as AudioContext;

    it('returns AudioBuffer for built-in sample', async () => {
      const buf = await getSample(ctx, 'kick');
      expect(buf).toBeTruthy();
    });

    it('returns null for unknown sample key', async () => {
      const buf = await getSample(ctx, 'nonexistent_sample');
      expect(buf).toBeNull();
    });

    it('caches samples after first synthesis', async () => {
      const offlineCtxMock = globalThis.OfflineAudioContext as unknown as { mock: { calls: unknown[][] } };
      const callsBefore = offlineCtxMock.mock.calls.length;

      const buf1 = await getSample(ctx, 'snare');
      const buf2 = await getSample(ctx, 'snare');

      expect(buf1).toBe(buf2); // Same reference = cached
      // OfflineAudioContext should only have been called once (not twice)
      expect(offlineCtxMock.mock.calls.length).toBe(callsBefore + 1);
    });

    it('synthesizes all built-in samples without error', async () => {
      const ids = getBuiltInSampleIds();
      for (const id of ids) {
        const buf = await getSample(ctx, id);
        expect(buf).toBeTruthy();
      }
    });
  });

  describe('cacheUserSample', () => {
    it('stores a user-provided sample', async () => {
      const customBuffer = makeAudioBuffer(1.0);
      cacheUserSample('user-custom-kick', customBuffer);

      const ctx = { sampleRate: 44100 } as AudioContext;
      const retrieved = await getSample(ctx, 'user-custom-kick');
      expect(retrieved).toBe(customBuffer);
    });

    it('overwrites existing cache entry', async () => {
      const buf1 = makeAudioBuffer(0.5);
      const buf2 = makeAudioBuffer(1.0);
      cacheUserSample('user-sample', buf1);
      cacheUserSample('user-sample', buf2);

      const ctx = { sampleRate: 44100 } as AudioContext;
      const retrieved = await getSample(ctx, 'user-sample');
      expect(retrieved).toBe(buf2);
    });
  });

  describe('clearSampleCache', () => {
    it('clears all cached samples and re-synthesizes on next request', async () => {
      const ctx = { sampleRate: 44100 } as AudioContext;
      const offlineCtxMock = globalThis.OfflineAudioContext as unknown as { mock: { calls: unknown[][] } };
      const initialCallCount = offlineCtxMock.mock.calls.length;

      await getSample(ctx, 'kick');
      expect(offlineCtxMock.mock.calls.length).toBe(initialCallCount + 1);

      clearSampleCache();

      // After clear, OfflineAudioContext should be called again (not returning cached)
      const buf = await getSample(ctx, 'kick');
      expect(buf).toBeTruthy();
      expect(offlineCtxMock.mock.calls.length).toBe(initialCallCount + 2);
    });

    it('clears user samples too', async () => {
      const customBuffer = makeAudioBuffer(1.0);
      cacheUserSample('user-sample', customBuffer);
      clearSampleCache();

      const ctx = { sampleRate: 44100 } as AudioContext;
      const retrieved = await getSample(ctx, 'user-sample');
      expect(retrieved).toBeNull();
    });
  });
});
