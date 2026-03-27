import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Tone.js before importing AudioEngine
vi.mock('tone', () => ({
  setContext: vi.fn(),
  getContext: vi.fn(() => ({
    lookAhead: 0.1,
  })),
}));

// Mock service imports that require browser APIs
vi.mock('../../services/audioFileManager', () => ({
  loadAudioBlobByKey: vi.fn(),
}));

vi.mock('../../utils/clipFade', () => ({
  applyClipFadeAutomation: vi.fn(),
}));

vi.mock('../../utils/audioWarp', () => ({
  computeWarpedSegments: vi.fn(() => []),
}));

// ---------------------------------------------------------------------------
// Minimal AudioParam / AudioNode / AudioContext stubs
// ---------------------------------------------------------------------------

function makeAudioParam(initial = 0) {
  let _value = initial;
  const rampCalls: { value: number; endTime: number }[] = [];
  const setValueCalls: { value: number; time: number }[] = [];
  const cancelCalls: number[] = [];
  const expRampCalls: { value: number; endTime: number }[] = [];
  return {
    get value() { return _value; },
    set value(v: number) { _value = v; },
    linearRampToValueAtTime(value: number, endTime: number) {
      rampCalls.push({ value, endTime });
      _value = value;
      return this;
    },
    exponentialRampToValueAtTime(value: number, endTime: number) {
      expRampCalls.push({ value, endTime });
      _value = value;
      return this;
    },
    setValueAtTime(value: number, time: number) {
      setValueCalls.push({ value, time });
      _value = value;
      return this;
    },
    cancelScheduledValues(time: number) {
      cancelCalls.push(time);
      return this;
    },
    rampCalls,
    setValueCalls,
    cancelCalls,
    expRampCalls,
  };
}

function makeNode(overrides: Record<string, unknown> = {}) {
  return {
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    ...overrides,
  };
}

function makeBufferSource() {
  return {
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    buffer: null as unknown,
    playbackRate: makeAudioParam(1),
    addEventListener: vi.fn(),
  };
}

function makeOscillator() {
  return {
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    type: 'sine' as string,
    frequency: makeAudioParam(440),
    addEventListener: vi.fn(),
  };
}

function makeAudioContext(opts: { currentTime?: number; baseLatency?: number; outputLatency?: number } = {}): AudioContext {
  let _currentTime = opts.currentTime ?? 0;
  return {
    get currentTime() { return _currentTime; },
    set currentTime(v: number) { _currentTime = v; },
    sampleRate: 48000,
    state: 'running',
    baseLatency: opts.baseLatency ?? 0,
    outputLatency: opts.outputLatency ?? 0,
    destination: makeNode(),
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    createGain() {
      return makeNode({ gain: makeAudioParam(1) });
    },
    createStereoPanner() {
      return makeNode({ pan: makeAudioParam(0) });
    },
    createBiquadFilter() {
      return makeNode({
        type: 'lowshelf',
        frequency: makeAudioParam(1000),
        Q: makeAudioParam(1),
        gain: makeAudioParam(0),
      });
    },
    createDynamicsCompressor() {
      return makeNode({
        threshold: makeAudioParam(0),
        ratio: makeAudioParam(1),
        attack: makeAudioParam(0.003),
        release: makeAudioParam(0.25),
        knee: makeAudioParam(30),
      });
    },
    createAnalyser() {
      return makeNode({
        fftSize: 2048,
        smoothingTimeConstant: 0.6,
        frequencyBinCount: 1024,
        getByteFrequencyData: vi.fn(),
        getFloatFrequencyData: vi.fn(),
        getFloatTimeDomainData: vi.fn(),
      });
    },
    createChannelSplitter(_n: number) { return makeNode(); },
    createChannelMerger(_n: number) { return makeNode(); },
    createOscillator() { return makeOscillator(); },
    createBufferSource() { return makeBufferSource(); },
    createConvolver() { return makeNode({ buffer: null }); },
    createBuffer(_channels: number, length: number, sampleRate: number) {
      const data = new Float32Array(length);
      return {
        getChannelData: () => data,
        sampleRate,
        length,
        numberOfChannels: _channels,
        duration: length / sampleRate,
      };
    },
    decodeAudioData: vi.fn().mockResolvedValue({
      duration: 2.0,
      length: 96000,
      numberOfChannels: 2,
      sampleRate: 48000,
    }),
  } as unknown as AudioContext;
}

// Stub the global AudioContext so the constructor works
const _originalAudioContext = globalThis.AudioContext;
beforeEach(() => {
  (globalThis as Record<string, unknown>).AudioContext = makeAudioContext as unknown as typeof AudioContext;
});

import { AudioEngine } from '../AudioEngine';
import type { ClipScheduleInfo, SequencerScheduleInfo } from '../AudioEngine';

describe('AudioEngine', () => {
  let engine: AudioEngine;

  beforeEach(() => {
    (globalThis as Record<string, unknown>).AudioContext = makeAudioContext as unknown as typeof AudioContext;
    engine = new AudioEngine();
  });

  // -----------------------------------------------------------------------
  // Static constants
  // -----------------------------------------------------------------------
  describe('LOOK_AHEAD constant', () => {
    it('equals 0.1 seconds', () => {
      expect(AudioEngine.LOOK_AHEAD).toBe(0.1);
    });
  });

  // -----------------------------------------------------------------------
  // Playback latency compensation
  // -----------------------------------------------------------------------
  describe('playback latency compensation', () => {
    it('defaults to sum of baseLatency and outputLatency from context', () => {
      // Our mock context has baseLatency=0 and outputLatency=0
      expect(engine.getPlaybackLatencyCompensation()).toBe(0);
    });

    it('setPlaybackLatencyCompensation stores a non-negative value', () => {
      engine.setPlaybackLatencyCompensation(0.05);
      expect(engine.getPlaybackLatencyCompensation()).toBe(0.05);
    });

    it('clamps negative latency to zero', () => {
      engine.setPlaybackLatencyCompensation(-0.1);
      expect(engine.getPlaybackLatencyCompensation()).toBe(0);
    });

    it('clamps NaN latency to zero', () => {
      engine.setPlaybackLatencyCompensation(NaN);
      expect(engine.getPlaybackLatencyCompensation()).toBe(0);
    });

    it('clamps Infinity latency to zero', () => {
      engine.setPlaybackLatencyCompensation(Infinity);
      expect(engine.getPlaybackLatencyCompensation()).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // getCurrentTime / getCompensatedTime
  // -----------------------------------------------------------------------
  describe('getCurrentTime', () => {
    it('returns offset when not playing', () => {
      // Not playing, offset defaults to 0
      expect(engine.getCurrentTime()).toBe(0);
    });

    it('getLookAhead returns the static LOOK_AHEAD value', () => {
      expect(engine.getLookAhead()).toBe(0.1);
    });
  });

  describe('getCompensatedTime', () => {
    it('subtracts latency compensation from current time', () => {
      engine.setPlaybackLatencyCompensation(0.03);
      // Not playing, offset = 0, so compensated = max(0, 0 - 0.03) = 0
      expect(engine.getCompensatedTime()).toBe(0);
    });

    it('never goes below zero', () => {
      engine.setPlaybackLatencyCompensation(999);
      expect(engine.getCompensatedTime()).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Master volume clamping
  // -----------------------------------------------------------------------
  describe('masterVolume', () => {
    it('clamps to range [0, 2]', () => {
      engine.masterVolume = 5;
      expect(engine.masterVolume).toBe(2);

      engine.masterVolume = -1;
      expect(engine.masterVolume).toBe(0);

      engine.masterVolume = 1.5;
      expect(engine.masterVolume).toBe(1.5);
    });
  });

  // -----------------------------------------------------------------------
  // Track node management
  // -----------------------------------------------------------------------
  describe('getOrCreateTrackNode', () => {
    it('creates a new TrackNode for unknown track id', () => {
      const node = engine.getOrCreateTrackNode('track-1');
      expect(node).not.toBeNull();
      expect(engine.trackNodes.has('track-1')).toBe(true);
    });

    it('returns same TrackNode on second call', () => {
      const first = engine.getOrCreateTrackNode('track-1');
      const second = engine.getOrCreateTrackNode('track-1');
      expect(first).toBe(second);
    });
  });

  describe('removeTrackNode', () => {
    it('removes the node from the map', () => {
      engine.getOrCreateTrackNode('track-1');
      expect(engine.trackNodes.has('track-1')).toBe(true);

      engine.removeTrackNode('track-1');
      expect(engine.trackNodes.has('track-1')).toBe(false);
    });

    it('does nothing for unknown track id', () => {
      // Should not throw
      engine.removeTrackNode('nonexistent');
      expect(engine.trackNodes.size).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Solo state
  // -----------------------------------------------------------------------
  describe('updateSoloState', () => {
    it('sets _soloActive on all nodes when one is soloed', () => {
      const nodeA = engine.getOrCreateTrackNode('a');
      const nodeB = engine.getOrCreateTrackNode('b');

      nodeA.soloed = true;
      engine.updateSoloState();

      // soloActive is write-only (no getter), check via private field
      expect((nodeA as unknown as { _soloActive: boolean })._soloActive).toBe(true);
      expect((nodeB as unknown as { _soloActive: boolean })._soloActive).toBe(true);
    });

    it('clears _soloActive when no node is soloed', () => {
      const nodeA = engine.getOrCreateTrackNode('a');
      const nodeB = engine.getOrCreateTrackNode('b');

      nodeA.soloed = true;
      engine.updateSoloState();

      nodeA.soloed = false;
      engine.updateSoloState();

      expect((nodeA as unknown as { _soloActive: boolean })._soloActive).toBe(false);
      expect((nodeB as unknown as { _soloActive: boolean })._soloActive).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // MIDI event scheduling
  // -----------------------------------------------------------------------
  describe('fireMidiEventsForTime', () => {
    it('fires events within lookahead window', () => {
      const cb = vi.fn();
      engine.scheduleMidiEvent(1.0, cb);

      // currentTime=0.95 => threshold=0.95+0.1=1.05 >= 1.0 => fire
      engine.fireMidiEventsForTime(0.95);
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('does not fire events beyond lookahead window', () => {
      const cb = vi.fn();
      engine.scheduleMidiEvent(2.0, cb);

      // currentTime=0.5 => threshold=0.6 < 2.0 => not yet
      engine.fireMidiEventsForTime(0.5);
      expect(cb).toHaveBeenCalledTimes(0);
    });

    it('does not fire the same event twice', () => {
      const cb = vi.fn();
      engine.scheduleMidiEvent(1.0, cb);

      engine.fireMidiEventsForTime(0.95);
      engine.fireMidiEventsForTime(1.0);
      engine.fireMidiEventsForTime(1.5);

      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('fires multiple events in order', () => {
      const results: number[] = [];
      engine.scheduleMidiEvent(0.5, () => results.push(1));
      engine.scheduleMidiEvent(0.6, () => results.push(2));
      engine.scheduleMidiEvent(5.0, () => results.push(3));

      // threshold = 1.0 + 0.1 = 1.1 => fires events at 0.5 and 0.6, not 5.0
      engine.fireMidiEventsForTime(1.0);

      expect(results).toEqual([1, 2]);
    });
  });

  describe('clearMidiEvents', () => {
    it('removes all scheduled MIDI events', () => {
      const cb = vi.fn();
      engine.scheduleMidiEvent(0.1, cb);
      engine.clearMidiEvents();
      engine.fireMidiEventsForTime(10);
      expect(cb).toHaveBeenCalledTimes(0);
    });
  });

  // -----------------------------------------------------------------------
  // Sequencer scheduling math
  // -----------------------------------------------------------------------
  describe('scheduleSequencer', () => {
    function makeBuffer(duration: number): AudioBuffer {
      return {
        duration,
        length: Math.round(duration * 48000),
        numberOfChannels: 1,
        sampleRate: 48000,
        getChannelData: () => new Float32Array(Math.round(duration * 48000)),
        copyFromChannel: vi.fn(),
        copyToChannel: vi.fn(),
      } as unknown as AudioBuffer;
    }

    it('calculates correct step duration at 120 BPM with 16 steps per bar', () => {
      // stepDuration = (60/120) / (16/4) = 0.5 / 4 = 0.125 seconds
      const buffer = makeBuffer(0.1);
      const sampleBuffers = new Map([['kick', buffer]]);

      const info: SequencerScheduleInfo = {
        trackId: 'seq-track',
        pattern: {
          bars: 1,
          stepsPerBar: 16,
          swing: 0,
          rows: [
            {
              id: 'row-1',
              sampleKey: 'kick',
              label: 'Kick',
              muted: false,
              volume: 1,
              steps: Array.from({ length: 16 }, (_, i) => ({
                active: i === 0, // Only first step
                velocity: 0.8,
              })),
            },
          ],
        },
        sampleBuffers,
        bpm: 120,
      };

      engine.scheduleSequencer(info, 0, 2);

      // Pattern duration = 0.125 * 16 * 1 = 2 seconds
      // Tiles from loop 0..1, only step 0 is active at time 0
      // Should schedule at least one source for the first step
      expect(engine.scheduledSources.length).toBeGreaterThanOrEqual(1);
      expect(engine.scheduledSources[0].clipId).toBe('seq-row-1-0-0');
      expect(engine.scheduledSources[0].trackId).toBe('seq-track');
    });

    it('skips muted rows', () => {
      const buffer = makeBuffer(0.1);
      const sampleBuffers = new Map([['kick', buffer]]);

      const info: SequencerScheduleInfo = {
        trackId: 'seq-track',
        pattern: {
          bars: 1,
          stepsPerBar: 4,
          swing: 0,
          rows: [
            {
              id: 'row-1',
              sampleKey: 'kick',
              label: 'Kick',
              muted: true,
              volume: 1,
              steps: [
                { active: true, velocity: 1 },
                { active: true, velocity: 1 },
                { active: true, velocity: 1 },
                { active: true, velocity: 1 },
              ],
            },
          ],
        },
        sampleBuffers,
        bpm: 120,
      };

      engine.scheduleSequencer(info, 0, 2);
      expect(engine.scheduledSources.length).toBe(0);
    });

    it('skips inactive steps', () => {
      const buffer = makeBuffer(0.1);
      const sampleBuffers = new Map([['kick', buffer]]);

      const info: SequencerScheduleInfo = {
        trackId: 'seq-track',
        pattern: {
          bars: 1,
          stepsPerBar: 4,
          swing: 0,
          rows: [
            {
              id: 'row-1',
              sampleKey: 'kick',
              label: 'Kick',
              muted: false,
              volume: 1,
              steps: [
                { active: false, velocity: 1 },
                { active: false, velocity: 1 },
                { active: true, velocity: 1 },
                { active: false, velocity: 1 },
              ],
            },
          ],
        },
        sampleBuffers,
        bpm: 120,
      };

      engine.scheduleSequencer(info, 0, 2);
      // Only step 2 is active. Pattern tiles, so we might get it once per tile.
      // All scheduled sources should reference step index 2
      for (const s of engine.scheduledSources) {
        expect(s.clipId).toMatch(/seq-row-1-2-/);
      }
    });

    it('applies swing offset to odd steps', () => {
      const buffer = makeBuffer(0.05);
      const sampleBuffers = new Map([['kick', buffer]]);

      // With swing=0.5, odd steps get offset by stepDuration * 0.5 * 0.5
      const info: SequencerScheduleInfo = {
        trackId: 'seq-track',
        pattern: {
          bars: 1,
          stepsPerBar: 4,
          swing: 0.5,
          rows: [
            {
              id: 'row-1',
              sampleKey: 'kick',
              label: 'Kick',
              muted: false,
              volume: 1,
              steps: [
                { active: true, velocity: 1 },
                { active: true, velocity: 1 },
                { active: false, velocity: 1 },
                { active: false, velocity: 1 },
              ],
            },
          ],
        },
        sampleBuffers,
        bpm: 120,
      };

      engine.scheduleSequencer(info, 0, 2);

      // step 0 at time 0, step 1 at time stepDuration + swingOffset
      // stepDuration = (60/120) / (4/4) = 0.5
      // swingOffset = 0.5 * 0.5 * 0.5 = 0.125
      // step 1 scheduled time = 0.5 + 0.125 = 0.625
      const step1Sources = engine.scheduledSources.filter(s => s.clipId.includes('row-1-1-'));
      expect(step1Sources.length).toBeGreaterThanOrEqual(1);
      expect(step1Sources[0].startTime).toBeCloseTo(0.625, 5);
    });

    it('handles seeking into a pattern (fromTime > 0)', () => {
      const buffer = makeBuffer(0.3);
      const sampleBuffers = new Map([['kick', buffer]]);

      const info: SequencerScheduleInfo = {
        trackId: 'seq-track',
        pattern: {
          bars: 1,
          stepsPerBar: 4,
          swing: 0,
          rows: [
            {
              id: 'row-1',
              sampleKey: 'kick',
              label: 'Kick',
              muted: false,
              volume: 1,
              steps: [
                { active: true, velocity: 1 },
                { active: true, velocity: 1 },
                { active: true, velocity: 1 },
                { active: true, velocity: 1 },
              ],
            },
          ],
        },
        sampleBuffers,
        bpm: 120,
      };

      // stepDuration = 0.5, steps at 0, 0.5, 1.0, 1.5
      // fromTime = 0.7 — step at 0.5 still has buffer tail, step at 1.0 and 1.5 ahead
      engine.scheduleSequencer(info, 0.7, 2);

      // Should have scheduled sources that start at time >= some point after 0.7
      expect(engine.scheduledSources.length).toBeGreaterThanOrEqual(1);
      // No source should reference a step that ended before fromTime
      for (const s of engine.scheduledSources) {
        // The step at time 0 has buffer duration 0.3, ending at 0.3 < 0.7 => skipped
        expect(s.startTime + buffer.duration).toBeGreaterThan(0.7);
      }
    });

    it('skips rows with missing sample buffer', () => {
      const info: SequencerScheduleInfo = {
        trackId: 'seq-track',
        pattern: {
          bars: 1,
          stepsPerBar: 4,
          swing: 0,
          rows: [
            {
              id: 'row-1',
              sampleKey: 'missing-sample',
              label: 'Missing',
              muted: false,
              volume: 1,
              steps: [
                { active: true, velocity: 1 },
                { active: true, velocity: 1 },
                { active: true, velocity: 1 },
                { active: true, velocity: 1 },
              ],
            },
          ],
        },
        sampleBuffers: new Map(),
        bpm: 120,
      };

      engine.scheduleSequencer(info, 0, 2);
      expect(engine.scheduledSources.length).toBe(0);
    });

    it('returns early when patternDuration is 0', () => {
      const buffer = makeBuffer(0.1);
      const info: SequencerScheduleInfo = {
        trackId: 'seq-track',
        pattern: {
          bars: 0,
          stepsPerBar: 16,
          swing: 0,
          rows: [],
        },
        sampleBuffers: new Map([['kick', buffer]]),
        bpm: 120,
      };

      engine.scheduleSequencer(info, 0, 2);
      expect(engine.scheduledSources.length).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // schedulePlayback — standard clip scheduling
  // -----------------------------------------------------------------------
  describe('schedulePlayback', () => {
    function makeBuffer(duration: number): AudioBuffer {
      return {
        duration,
        length: Math.round(duration * 48000),
        numberOfChannels: 1,
        sampleRate: 48000,
        getChannelData: () => new Float32Array(Math.round(duration * 48000)),
        copyFromChannel: vi.fn(),
        copyToChannel: vi.fn(),
      } as unknown as AudioBuffer;
    }

    it('schedules a simple clip starting at time 0', () => {
      const buffer = makeBuffer(2.0);
      const clip: ClipScheduleInfo = {
        clipId: 'clip-1',
        trackId: 'track-1',
        startTime: 0,
        buffer,
        audioOffset: 0,
        clipDuration: 2.0,
      };

      engine.schedulePlayback([clip], 0, 4);

      expect(engine.scheduledSources.length).toBe(1);
      expect(engine.scheduledSources[0].clipId).toBe('clip-1');
      expect(engine.scheduledSources[0].trackId).toBe('track-1');
      expect(engine.playing).toBe(true);
    });

    it('skips a clip that ends before fromTime', () => {
      const buffer = makeBuffer(1.0);
      const clip: ClipScheduleInfo = {
        clipId: 'clip-1',
        trackId: 'track-1',
        startTime: 0,
        buffer,
        audioOffset: 0,
        clipDuration: 1.0,
      };

      // fromTime = 2, clip ends at 1.0 => skip
      engine.schedulePlayback([clip], 2.0, 4);

      expect(engine.scheduledSources.length).toBe(0);
    });

    it('schedules multiple clips on different tracks', () => {
      const buffer1 = makeBuffer(1.0);
      const buffer2 = makeBuffer(1.5);

      const clips: ClipScheduleInfo[] = [
        {
          clipId: 'clip-1',
          trackId: 'track-1',
          startTime: 0,
          buffer: buffer1,
          audioOffset: 0,
          clipDuration: 1.0,
        },
        {
          clipId: 'clip-2',
          trackId: 'track-2',
          startTime: 0.5,
          buffer: buffer2,
          audioOffset: 0,
          clipDuration: 1.5,
        },
      ];

      engine.schedulePlayback(clips, 0, 4);

      expect(engine.scheduledSources.length).toBe(2);
      const ids = engine.scheduledSources.map(s => s.clipId);
      expect(ids).toContain('clip-1');
      expect(ids).toContain('clip-2');
    });

    it('stores clips for loop re-scheduling', () => {
      const buffer = makeBuffer(1.0);
      const clip: ClipScheduleInfo = {
        clipId: 'clip-1',
        trackId: 'track-1',
        startTime: 0,
        buffer,
        audioOffset: 0,
        clipDuration: 1.0,
      };

      engine.schedulePlayback([clip], 0, 4);

      // Access private fields via cast
      const eng = engine as unknown as { _lastClips: ClipScheduleInfo[]; _lastTotalDuration: number };
      expect(eng._lastClips).toEqual([clip]);
      expect(eng._lastTotalDuration).toBe(4);
    });
  });

  // -----------------------------------------------------------------------
  // stop / stopAllSources
  // -----------------------------------------------------------------------
  describe('stop', () => {
    it('clears playing state and scheduled sources', () => {
      const buffer = {
        duration: 1,
        length: 48000,
        numberOfChannels: 1,
        sampleRate: 48000,
        getChannelData: () => new Float32Array(48000),
        copyFromChannel: vi.fn(),
        copyToChannel: vi.fn(),
      } as unknown as AudioBuffer;

      engine.schedulePlayback([{
        clipId: 'clip-1',
        trackId: 'track-1',
        startTime: 0,
        buffer,
        audioOffset: 0,
        clipDuration: 1,
      }], 0, 2);

      expect(engine.playing).toBe(true);

      engine.stop();

      expect(engine.playing).toBe(false);
      expect(engine.scheduledSources.length).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // _setMasterWidth (via applyMastering)
  // -----------------------------------------------------------------------
  describe('stereo width calculation', () => {
    it('width=1 produces same=1 and cross=0 (no change)', () => {
      // Access the private width gains through the engine
      const eng = engine as unknown as {
        widthLeftToLeft: { gain: { value: number } };
        widthRightToLeft: { gain: { value: number } };
      };

      // Default width is 1 (set in constructor)
      // same = 0.5 * (1 + 1) = 1, cross = 0.5 * (1 - 1) = 0
      expect(eng.widthLeftToLeft.gain.value).toBe(1);
      expect(eng.widthRightToLeft.gain.value).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Scrub track state hash
  // -----------------------------------------------------------------------
  describe('_getScrubTrackStateHash', () => {
    it('produces different hashes for different track states', () => {
      const eng = engine as unknown as {
        _getScrubTrackStateHash: (tracks: unknown[]) => string;
      };

      const hash1 = eng._getScrubTrackStateHash([
        { id: 't1', volume: 0.8, muted: false, soloed: false },
      ]);
      const hash2 = eng._getScrubTrackStateHash([
        { id: 't1', volume: 0.5, muted: false, soloed: false },
      ]);

      expect(hash1).not.toBe(hash2);
    });

    it('produces identical hashes for same track state', () => {
      const eng = engine as unknown as {
        _getScrubTrackStateHash: (tracks: unknown[]) => string;
      };

      const state = [{ id: 't1', volume: 0.8, muted: false, soloed: false }];
      const hash1 = eng._getScrubTrackStateHash(state);
      const hash2 = eng._getScrubTrackStateHash(state);

      expect(hash1).toBe(hash2);
    });
  });

  // -----------------------------------------------------------------------
  // setTimeUpdateCallback / setOnEndedCallback
  // -----------------------------------------------------------------------
  describe('callbacks', () => {
    it('setTimeUpdateCallback stores the callback', () => {
      const cb = vi.fn();
      engine.setTimeUpdateCallback(cb);
      const eng = engine as unknown as { _onTimeUpdate: typeof cb };
      expect(eng._onTimeUpdate).toBe(cb);
    });

    it('setOnEndedCallback stores the callback', () => {
      const cb = vi.fn();
      engine.setOnEndedCallback(cb);
      const eng = engine as unknown as { _onEnded: typeof cb };
      expect(eng._onEnded).toBe(cb);
    });
  });

  // -----------------------------------------------------------------------
  // Track volume / pan
  // -----------------------------------------------------------------------
  describe('setTrackVolume', () => {
    it('clamps volume to [0, 1]', () => {
      const node = engine.getOrCreateTrackNode('t1');
      engine.setTrackVolume('t1', 2.0);
      expect(node.volume).toBe(1);

      engine.setTrackVolume('t1', -0.5);
      expect(node.volume).toBe(0);

      engine.setTrackVolume('t1', 0.75);
      expect(node.volume).toBe(0.75);
    });

    it('does nothing for unknown track', () => {
      // Should not throw
      engine.setTrackVolume('unknown', 0.5);
    });
  });

  describe('setTrackPan', () => {
    it('sets pan on existing track node', () => {
      const node = engine.getOrCreateTrackNode('t1');
      engine.setTrackPan('t1', -0.5);
      // pan is a setter that writes to the internal panNode
      const panNode = (node as unknown as { panNode: { pan: { value: number } } }).panNode;
      expect(panNode.pan.value).toBe(-0.5);
    });
  });

  // -----------------------------------------------------------------------
  // getTrackMeter for missing track
  // -----------------------------------------------------------------------
  describe('getTrackMeter', () => {
    it('returns zeroed meter for nonexistent track', () => {
      const meter = engine.getTrackMeter('missing');
      expect(meter).toEqual({ level: 0, leftLevel: 0, rightLevel: 0, clipped: false });
    });
  });

  // -----------------------------------------------------------------------
  // sampleRate and spectrumBinCount
  // -----------------------------------------------------------------------
  describe('derived properties', () => {
    it('sampleRate returns context sampleRate', () => {
      expect(engine.sampleRate).toBe(48000);
    });

    it('spectrumBinCount returns analyser frequencyBinCount', () => {
      // Our mock analyser has fftSize=2048 => frequencyBinCount=1024
      expect(engine.spectrumBinCount).toBe(1024);
    });
  });

  // -----------------------------------------------------------------------
  // dispose
  // -----------------------------------------------------------------------
  describe('dispose', () => {
    it('clears all track nodes and closes context', () => {
      engine.getOrCreateTrackNode('t1');
      engine.getOrCreateTrackNode('t2');
      expect(engine.trackNodes.size).toBe(2);

      engine.dispose();

      expect(engine.trackNodes.size).toBe(0);
      expect(engine.playing).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // resetMasterClip
  // -----------------------------------------------------------------------
  describe('resetMasterClip', () => {
    it('resets input clip indicator', () => {
      // Trigger clipped state by accessing private field
      (engine as unknown as { masterInputClipped: boolean }).masterInputClipped = true;
      const before = engine.getMasterMeter('input');
      expect(before.clipped).toBe(true);

      engine.resetMasterClip('input');
      const after = engine.getMasterMeter('input');
      expect(after.clipped).toBe(false);
    });

    it('resets output clip indicator', () => {
      (engine as unknown as { masterOutputClipped: boolean }).masterOutputClipped = true;
      const before = engine.getMasterMeter('output');
      expect(before.clipped).toBe(true);

      engine.resetMasterClip('output');
      const after = engine.getMasterMeter('output');
      expect(after.clipped).toBe(false);
    });
  });
});
