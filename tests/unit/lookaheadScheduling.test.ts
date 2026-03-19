import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Minimal AudioContext / Web Audio mock ────────────────────────────────────

class MockAudioParam {
  value = 0;
  setValueAtTime(v: number) { this.value = v; return this; }
  linearRampToValueAtTime(v: number) { this.value = v; return this; }
  exponentialRampToValueAtTime(v: number) { this.value = v; return this; }
  cancelScheduledValues() { return this; }
}

class MockGainNode {
  gain = new MockAudioParam();
  connect() { return this; }
  disconnect() {}
}

class MockAnalyserNode {
  fftSize = 256;
  smoothingTimeConstant = 0.6;
  get frequencyBinCount() { return this.fftSize / 2; }
  getByteFrequencyData() {}
  getFloatFrequencyData() {}
  getFloatTimeDomainData() {}
  connect() { return this; }
  disconnect() {}
}

class MockBiquadFilterNode {
  type = 'lowshelf';
  frequency = new MockAudioParam();
  gain = new MockAudioParam();
  Q = new MockAudioParam();
  connect() { return this; }
  disconnect() {}
}

class MockDynamicsCompressorNode {
  threshold = new MockAudioParam();
  ratio = new MockAudioParam();
  attack = new MockAudioParam();
  release = new MockAudioParam();
  knee = new MockAudioParam();
  connect() { return this; }
  disconnect() {}
}

class MockChannelSplitterNode {
  connect() { return this; }
  disconnect() {}
}

class MockChannelMergerNode {
  connect() { return this; }
  disconnect() {}
}

let mockCurrentTime = 0;

class MockAudioContext {
  sampleRate = 48000;
  state = 'running';
  baseLatency = 0.005;
  outputLatency = 0.02;

  get currentTime() { return mockCurrentTime; }

  createGain() { return new MockGainNode(); }
  createAnalyser() { return new MockAnalyserNode(); }
  createBiquadFilter() { return new MockBiquadFilterNode(); }
  createDynamicsCompressor() { return new MockDynamicsCompressorNode(); }
  createChannelSplitter() { return new MockChannelSplitterNode(); }
  createChannelMerger() { return new MockChannelMergerNode(); }
  createOscillator() {
    return {
      type: 'sine',
      frequency: new MockAudioParam(),
      connect() { return this; },
      disconnect() {},
      start() {},
      stop() {},
    };
  }
  createBufferSource() {
    return {
      buffer: null,
      playbackRate: new MockAudioParam(),
      connect() { return this; },
      disconnect() {},
      start() {},
      stop() {},
    };
  }
  resume() { return Promise.resolve(); }
  close() {}
  decodeAudioData() { return Promise.resolve(null); }
}

// Install global AudioContext before imports
globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext;

// Mock Tone.js
vi.mock('tone', () => ({
  setContext: vi.fn(),
  start: vi.fn(),
  getContext: vi.fn(() => ({ lookAhead: 0 })),
}));

vi.mock('../../src/utils/mastering', () => ({
  ensureMasteringState: vi.fn(() => ({
    enabled: false,
    previewOriginal: false,
    status: 'idle',
    analysis: null,
    chain: {
      lowShelfGain: 0,
      midGain: 0,
      highShelfGain: 0,
      compressorThreshold: -18,
      compressorRatio: 1.5,
      limiterThreshold: -1.2,
      stereoWidth: 1,
      makeupGain: 0,
    },
  })),
}));

vi.mock('../../src/utils/clipFade', () => ({
  applyClipFadeAutomation: vi.fn(),
}));

vi.mock('../../src/utils/tempoMap', () => ({
  beatToTime: vi.fn((beat: number) => beat * 0.5),
  getBarAtBeat: vi.fn((beat: number) => Math.floor(beat / 4)),
}));

vi.mock('../../src/utils/audioWarp', () => ({
  computeWarpedSegments: vi.fn(() => []),
}));

import { AudioEngine } from '../../src/engine/AudioEngine';

describe('Lookahead Transport Scheduling', () => {
  let engine: AudioEngine;

  beforeEach(() => {
    mockCurrentTime = 0;
    engine = new AudioEngine();
  });

  describe('lookAhead configuration', () => {
    it('exposes a LOOK_AHEAD constant of 0.1 seconds', () => {
      expect(AudioEngine.LOOK_AHEAD).toBe(0.1);
    });

    it('returns lookAhead value from getLookAhead()', () => {
      expect(engine.getLookAhead()).toBe(0.1);
    });
  });

  describe('MIDI event lookahead scheduling', () => {
    it('fires MIDI events ahead of time by the lookAhead amount', () => {
      const callback = vi.fn();
      engine.scheduleMidiEvent(1.0, callback);

      // At time 0.95, event at 1.0 is within the 0.1s lookAhead window
      engine.fireMidiEventsForTime(0.95);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('does not fire MIDI events too early (outside lookAhead window)', () => {
      const callback = vi.fn();
      engine.scheduleMidiEvent(1.0, callback);

      // At time 0.85, the event at 1.0 is > lookAhead away (0.15 > 0.1)
      engine.fireMidiEventsForTime(0.85);
      expect(callback).not.toHaveBeenCalled();
    });

    it('does not fire MIDI events more than once', () => {
      const callback = vi.fn();
      engine.scheduleMidiEvent(1.0, callback);

      engine.fireMidiEventsForTime(0.95);
      engine.fireMidiEventsForTime(1.05);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('playhead latency compensation', () => {
    it('getCompensatedTime() subtracts output latency from current time', () => {
      const raw = engine.getCurrentTime();
      const compensated = engine.getCompensatedTime();
      // Compensated time should be <= raw time (never ahead)
      expect(compensated).toBeLessThanOrEqual(raw);
    });

    it('allows a manual playback latency override to replace detected browser latency', () => {
      mockCurrentTime = 10.0;
      engine.schedulePlayback([], 0, 20);
      mockCurrentTime = 11.0;

      engine.setPlaybackLatencyCompensation(0.042);

      expect(engine.getCompensatedTime()).toBeCloseTo(0.958, 3);
    });

    it('getCompensatedTime() never returns negative', () => {
      expect(engine.getCompensatedTime()).toBeGreaterThanOrEqual(0);
    });

    it('getCompensatedTime() reflects output latency during playback', () => {
      // Simulate playing state
      mockCurrentTime = 10.0;
      engine.schedulePlayback([], 0, 20);
      // Now engine is "playing" from time 0, ctx.currentTime = 10
      // getCurrentTime() = 0 + (10 - 10) = 0 (just started)
      // But let's advance mock time
      mockCurrentTime = 11.0;
      const raw = engine.getCurrentTime(); // 0 + (11 - 10) = 1.0
      const compensated = engine.getCompensatedTime();
      // compensated should be raw minus output latency, clamped to >= 0
      expect(raw).toBeCloseTo(1.0, 1);
      expect(compensated).toBeLessThan(raw);
      expect(compensated).toBeGreaterThanOrEqual(0);
    });

    it('prefers the normalized latency compensation override when provided', () => {
      mockCurrentTime = 10.0;
      engine.schedulePlayback([], 0, 20);
      mockCurrentTime = 11.0;

      engine.setPlaybackLatencyCompensation(0.25);

      expect(engine.getCurrentTime()).toBeCloseTo(1.0, 1);
      expect(engine.getCompensatedTime()).toBeCloseTo(0.75, 5);
    });
  });
});
