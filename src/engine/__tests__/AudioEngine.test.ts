/**
 * Tests for AudioEngine — scheduling, playback, track management, metering.
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';

// ─── Audio stubs ────────────────────────────────────────────────────────────

function makeAudioParam(initial = 0) {
  let _value = initial;
  const rampCalls: { value: number; endTime: number }[] = [];
  return {
    get value() { return _value; },
    set value(v: number) { _value = v; },
    linearRampToValueAtTime(value: number, endTime: number) {
      rampCalls.push({ value, endTime });
      _value = value;
      return this;
    },
    exponentialRampToValueAtTime(value: number, endTime: number) {
      rampCalls.push({ value, endTime });
      _value = value;
      return this;
    },
    setValueAtTime(value: number, _time: number) {
      _value = value;
      return this;
    },
    cancelScheduledValues(_time: number) {
      return this;
    },
    rampCalls,
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
  return makeNode({
    buffer: null,
    playbackRate: makeAudioParam(1),
    start: vi.fn(),
    stop: vi.fn(),
    addEventListener: vi.fn(),
    loop: false,
    loopStart: 0,
    loopEnd: 0,
  });
}

function makeMockAudioContext() {
  let _currentTime = 0;
  return {
    get currentTime() { return _currentTime; },
    set currentTime(v: number) { _currentTime = v; },
    sampleRate: 48000,
    state: 'running',
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
    destination: makeNode(),
    outputLatency: 0,
    baseLatency: 0,
    createGain: vi.fn(() => makeNode({ gain: makeAudioParam(1) })),
    createStereoPanner: vi.fn(() => makeNode({ pan: makeAudioParam(0) })),
    createBiquadFilter: vi.fn(() => makeNode({
      type: 'lowshelf',
      frequency: makeAudioParam(1000),
      Q: makeAudioParam(1),
      gain: makeAudioParam(0),
    })),
    createDynamicsCompressor: vi.fn(() => makeNode({
      threshold: makeAudioParam(0),
      ratio: makeAudioParam(1),
      attack: makeAudioParam(0.003),
      release: makeAudioParam(0.25),
      knee: makeAudioParam(30),
    })),
    createAnalyser: vi.fn(() => makeNode({
      fftSize: 2048,
      smoothingTimeConstant: 0.6,
      frequencyBinCount: 1024,
      getByteFrequencyData: vi.fn(),
      getFloatFrequencyData: vi.fn(),
      getFloatTimeDomainData: vi.fn(),
    })),
    createOscillator: vi.fn(() => makeNode({
      type: 'sine',
      frequency: makeAudioParam(440),
      start: vi.fn(),
      stop: vi.fn(),
      addEventListener: vi.fn(),
    })),
    createChannelSplitter: vi.fn(() => makeNode()),
    createChannelMerger: vi.fn(() => makeNode()),
    createConvolver: vi.fn(() => makeNode({ buffer: null })),
    createBuffer: vi.fn((_channels: number, length: number, sampleRate: number) => ({
      getChannelData: () => new Float32Array(length),
      copyToChannel: vi.fn(),
      sampleRate,
      length,
      numberOfChannels: _channels,
      duration: length / sampleRate,
    })),
    createBufferSource: vi.fn(makeBufferSource),
    createMediaStreamDestination: vi.fn(() => ({
      ...makeNode(),
      stream: { getTracks: vi.fn(() => []) },
    })),
    decodeAudioData: vi.fn().mockResolvedValue({
      duration: 2,
      length: 96000,
      sampleRate: 48000,
      numberOfChannels: 2,
      getChannelData: () => new Float32Array(96000),
    }),
  } as unknown as AudioContext;
}

// Mock Tone.js
vi.mock('tone', () => ({
  setContext: vi.fn(),
  getContext: vi.fn(() => ({
    lookAhead: 0.1,
  })),
  Frequency: vi.fn((val: number) => ({
    toFrequency: () => 440 * Math.pow(2, (val - 69) / 12),
  })),
  getTransport: vi.fn(() => ({
    scheduleRepeat: vi.fn(() => 1),
    clear: vi.fn(),
    bpm: { value: 120 },
  })),
  Offline: vi.fn(),
  Gain: vi.fn(() => ({
    toDestination: vi.fn().mockReturnThis(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: makeAudioParam(1),
    dispose: vi.fn(),
  })),
}));

// Stub AudioContext globally so the constructor works
vi.stubGlobal('AudioContext', vi.fn().mockImplementation(makeMockAudioContext));
vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
vi.stubGlobal('cancelAnimationFrame', vi.fn());

import { AudioEngine } from '../AudioEngine';
import type { ClipScheduleInfo, SequencerScheduleInfo } from '../AudioEngine';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('AudioEngine', () => {
  let engine: AudioEngine;

  beforeEach(() => {
    engine = new AudioEngine();
  });

  afterEach(() => {
    engine.dispose();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  // ── Constructor & Initialization ──────────────────────────────────────

  describe('initialization', () => {
    it('creates an AudioContext at 48kHz', () => {
      expect(engine.ctx).toBeDefined();
      expect(engine.ctx.sampleRate).toBe(48000);
    });

    it('initializes master gain', () => {
      expect(engine.masterGain).toBeDefined();
    });

    it('starts not playing', () => {
      expect(engine.playing).toBe(false);
    });

    it('has a LOOK_AHEAD constant of 0.1s', () => {
      expect(AudioEngine.LOOK_AHEAD).toBe(0.1);
    });
  });

  // ── Track Node Management ─────────────────────────────────────────────

  describe('track nodes', () => {
    it('creates track node on first access', () => {
      const node = engine.getOrCreateTrackNode('track-1');
      expect(node).toBeDefined();
      expect(engine.trackNodes.has('track-1')).toBe(true);
    });

    it('returns same node on second access', () => {
      const first = engine.getOrCreateTrackNode('track-1');
      const second = engine.getOrCreateTrackNode('track-1');
      expect(first).toBe(second);
    });

    it('removes track node', () => {
      engine.getOrCreateTrackNode('track-1');
      engine.removeTrackNode('track-1');
      expect(engine.trackNodes.has('track-1')).toBe(false);
    });

    it('does nothing when removing nonexistent track', () => {
      expect(() => engine.removeTrackNode('nonexistent')).not.toThrow();
    });
  });

  // ── Master Volume ─────────────────────────────────────────────────────

  describe('master volume', () => {
    it('gets and sets master volume', () => {
      engine.masterVolume = 0.5;
      expect(engine.masterVolume).toBe(0.5);
    });

    it('clamps volume to [0, 2]', () => {
      engine.masterVolume = -1;
      expect(engine.masterVolume).toBe(0);

      engine.masterVolume = 5;
      expect(engine.masterVolume).toBe(2);
    });
  });

  // ── Track Volume & Pan ────────────────────────────────────────────────

  describe('track volume and pan', () => {
    it('sets track volume', () => {
      engine.getOrCreateTrackNode('track-1');
      engine.setTrackVolume('track-1', 0.7);
      // TrackNode stores volume internally
      const node = engine.trackNodes.get('track-1')!;
      expect(node.volume).toBe(0.7);
    });

    it('sets track pan without error', () => {
      engine.getOrCreateTrackNode('track-1');
      expect(() => engine.setTrackPan('track-1', -0.5)).not.toThrow();
    });

    it('ignores volume/pan for nonexistent track', () => {
      expect(() => engine.setTrackVolume('nonexistent', 0.5)).not.toThrow();
      expect(() => engine.setTrackPan('nonexistent', 0.5)).not.toThrow();
    });
  });

  // ── Playback Scheduling ───────────────────────────────────────────────

  describe('schedulePlayback', () => {
    function makeBuffer(): AudioBuffer {
      return {
        duration: 2,
        length: 96000,
        sampleRate: 48000,
        numberOfChannels: 2,
        getChannelData: () => new Float32Array(96000),
        copyFromChannel: vi.fn(),
        copyToChannel: vi.fn(),
      } as unknown as AudioBuffer;
    }

    it('schedules clips and starts playing', () => {
      const clips: ClipScheduleInfo[] = [{
        clipId: 'clip-1',
        trackId: 'track-1',
        startTime: 0,
        buffer: makeBuffer(),
        audioOffset: 0,
        clipDuration: 2,
      }];

      engine.schedulePlayback(clips, 0, 10);

      expect(engine.playing).toBe(true);
      expect(engine.scheduledSources.length).toBeGreaterThan(0);
    });

    it('schedules clip with time stretch', () => {
      const clips: ClipScheduleInfo[] = [{
        clipId: 'clip-1',
        trackId: 'track-1',
        startTime: 0,
        buffer: makeBuffer(),
        audioOffset: 0,
        clipDuration: 4,
        timeStretchRate: 0.5,
      }];

      engine.schedulePlayback(clips, 0, 10);

      expect(engine.scheduledSources.length).toBeGreaterThan(0);
      // Verify playback rate was set
      const source = engine.scheduledSources[0].source;
      expect(source.playbackRate.value).toBe(0.5);
    });

    it('schedules clip starting after fromTime', () => {
      const clips: ClipScheduleInfo[] = [{
        clipId: 'clip-1',
        trackId: 'track-1',
        startTime: 5,
        buffer: makeBuffer(),
        audioOffset: 0,
        clipDuration: 2,
      }];

      engine.schedulePlayback(clips, 0, 10);

      expect(engine.scheduledSources.length).toBe(1);
    });

    it('seeks into clip when fromTime is after clip start', () => {
      const clips: ClipScheduleInfo[] = [{
        clipId: 'clip-1',
        trackId: 'track-1',
        startTime: 0,
        buffer: makeBuffer(),
        audioOffset: 0,
        clipDuration: 4,
      }];

      engine.schedulePlayback(clips, 2, 10);

      expect(engine.scheduledSources.length).toBe(1);
    });

    it('skips clips that end before fromTime', () => {
      const clips: ClipScheduleInfo[] = [{
        clipId: 'clip-1',
        trackId: 'track-1',
        startTime: 0,
        buffer: makeBuffer(),
        audioOffset: 0,
        clipDuration: 1,
      }];

      engine.schedulePlayback(clips, 2, 10);

      // Clip ends at t=1, fromTime=2, so it should be skipped
      expect(engine.scheduledSources.length).toBe(0);
    });

    it('schedules multiple clips on different tracks', () => {
      const clips: ClipScheduleInfo[] = [
        {
          clipId: 'clip-1',
          trackId: 'track-1',
          startTime: 0,
          buffer: makeBuffer(),
          audioOffset: 0,
          clipDuration: 2,
        },
        {
          clipId: 'clip-2',
          trackId: 'track-2',
          startTime: 1,
          buffer: makeBuffer(),
          audioOffset: 0,
          clipDuration: 3,
        },
      ];

      engine.schedulePlayback(clips, 0, 10);

      expect(engine.scheduledSources.length).toBe(2);
      expect(engine.trackNodes.has('track-1')).toBe(true);
      expect(engine.trackNodes.has('track-2')).toBe(true);
    });

    it('stops previous sources when re-scheduling', () => {
      const clips: ClipScheduleInfo[] = [{
        clipId: 'clip-1',
        trackId: 'track-1',
        startTime: 0,
        buffer: makeBuffer(),
        audioOffset: 0,
        clipDuration: 2,
      }];

      engine.schedulePlayback(clips, 0, 10);
      const firstSource = engine.scheduledSources[0];

      engine.schedulePlayback(clips, 0, 10);

      expect(firstSource.source.stop).toHaveBeenCalled();
    });
  });

  // ── Sequencer Scheduling ──────────────────────────────────────────────

  describe('scheduleSequencer', () => {
    function makeBuffer(): AudioBuffer {
      return {
        duration: 0.5,
        length: 24000,
        sampleRate: 48000,
        numberOfChannels: 1,
        getChannelData: () => new Float32Array(24000),
        copyFromChannel: vi.fn(),
        copyToChannel: vi.fn(),
      } as unknown as AudioBuffer;
    }

    it('schedules drum pattern steps', () => {
      const sampleBuffers = new Map([
        ['kick', makeBuffer()],
        ['snare', makeBuffer()],
      ]);

      const info: SequencerScheduleInfo = {
        trackId: 'drums',
        pattern: {
          rows: [
            {
              id: 'row-kick',
              sampleKey: 'kick',
              volume: 1,
              muted: false,
              steps: [
                { active: true, velocity: 1 },
                { active: false, velocity: 0 },
                { active: false, velocity: 0 },
                { active: false, velocity: 0 },
              ],
            },
          ],
          stepsPerBar: 4,
          bars: 1,
          swing: 0,
        },
        sampleBuffers,
        bpm: 120,
      };

      engine.scheduleSequencer(info, 0, 4);

      expect(engine.scheduledSources.length).toBeGreaterThan(0);
    });

    it('applies swing offset to odd steps', () => {
      const sampleBuffers = new Map([['kick', makeBuffer()]]);

      const info: SequencerScheduleInfo = {
        trackId: 'drums',
        pattern: {
          rows: [{
            id: 'row-kick',
            sampleKey: 'kick',
            volume: 1,
            muted: false,
            steps: [
              { active: true, velocity: 1 },
              { active: true, velocity: 1 },
            ],
          }],
          stepsPerBar: 4,
          bars: 1,
          swing: 0.5,
        },
        sampleBuffers,
        bpm: 120,
      };

      engine.scheduleSequencer(info, 0, 4);

      // With swing, step 1 should be delayed
      expect(engine.scheduledSources.length).toBeGreaterThan(0);
    });

    it('skips muted rows', () => {
      const sampleBuffers = new Map([['kick', makeBuffer()]]);

      const info: SequencerScheduleInfo = {
        trackId: 'drums',
        pattern: {
          rows: [{
            id: 'row-kick',
            sampleKey: 'kick',
            volume: 1,
            muted: true,
            steps: [{ active: true, velocity: 1 }],
          }],
          stepsPerBar: 4,
          bars: 1,
          swing: 0,
        },
        sampleBuffers,
        bpm: 120,
      };

      engine.scheduleSequencer(info, 0, 4);

      expect(engine.scheduledSources.length).toBe(0);
    });
  });

  // ── MIDI Event Scheduling ─────────────────────────────────────────────

  describe('MIDI events', () => {
    it('fires MIDI event when time reaches threshold', () => {
      const callback = vi.fn();
      engine.scheduleMidiEvent(1.0, callback);

      // Fire at time 1.0 (within LOOK_AHEAD = 0.1)
      engine.fireMidiEventsForTime(0.95);

      expect(callback).toHaveBeenCalled();
    });

    it('does not fire events before threshold', () => {
      const callback = vi.fn();
      engine.scheduleMidiEvent(2.0, callback);

      engine.fireMidiEventsForTime(1.0);

      expect(callback).not.toHaveBeenCalled();
    });

    it('fires each event only once', () => {
      const callback = vi.fn();
      engine.scheduleMidiEvent(1.0, callback);

      engine.fireMidiEventsForTime(1.0);
      engine.fireMidiEventsForTime(1.5);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('clears all MIDI events', () => {
      const callback = vi.fn();
      engine.scheduleMidiEvent(1.0, callback);
      engine.clearMidiEvents();

      engine.fireMidiEventsForTime(1.0);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  // ── Time / Playback State ─────────────────────────────────────────────

  describe('time and state', () => {
    it('returns offset when not playing', () => {
      expect(engine.getCurrentTime()).toBe(0);
    });

    it('returns lookahead value', () => {
      expect(engine.getLookAhead()).toBe(0.1);
    });

    it('returns compensated time >= 0', () => {
      expect(engine.getCompensatedTime()).toBeGreaterThanOrEqual(0);
    });

    it('manages playback latency compensation', () => {
      engine.setPlaybackLatencyCompensation(0.05);
      expect(engine.getPlaybackLatencyCompensation()).toBe(0.05);
    });

    it('clamps negative latency compensation to 0', () => {
      engine.setPlaybackLatencyCompensation(-1);
      expect(engine.getPlaybackLatencyCompensation()).toBe(0);
    });
  });

  // ── Stop ──────────────────────────────────────────────────────────────

  describe('stop', () => {
    it('stops playback and clears sources', () => {
      const clips: ClipScheduleInfo[] = [{
        clipId: 'clip-1',
        trackId: 'track-1',
        startTime: 0,
        buffer: {
          duration: 2, length: 96000, sampleRate: 48000, numberOfChannels: 2,
          getChannelData: () => new Float32Array(96000),
          copyFromChannel: vi.fn(), copyToChannel: vi.fn(),
        } as unknown as AudioBuffer,
        audioOffset: 0,
        clipDuration: 2,
      }];

      engine.schedulePlayback(clips, 0, 10);
      expect(engine.playing).toBe(true);

      engine.stop();
      expect(engine.playing).toBe(false);
      expect(engine.scheduledSources.length).toBe(0);
    });
  });

  // ── Solo State ────────────────────────────────────────────────────────

  describe('solo state', () => {
    it('updates solo state without error when track is soloed', () => {
      const node1 = engine.getOrCreateTrackNode('track-1');
      engine.getOrCreateTrackNode('track-2');

      node1.soloed = true;
      expect(() => engine.updateSoloState()).not.toThrow();
    });

    it('updates solo state without error when no tracks are soloed', () => {
      engine.getOrCreateTrackNode('track-1');
      engine.getOrCreateTrackNode('track-2');

      expect(() => engine.updateSoloState()).not.toThrow();
    });

    it('detects when any track is soloed', () => {
      const node1 = engine.getOrCreateTrackNode('track-1');
      engine.getOrCreateTrackNode('track-2');

      expect(node1.soloed).toBe(false);
      node1.soloed = true;
      expect(node1.soloed).toBe(true);
    });
  });

  // ── Return Tracks ─────────────────────────────────────────────────────

  describe('return tracks', () => {
    it('creates and retrieves return track nodes', () => {
      const node = engine.getOrCreateReturnTrackNode('return-1');
      expect(node).toBeDefined();
      expect(engine.returnTrackNodes.has('return-1')).toBe(true);
    });

    it('removes return track node', () => {
      engine.getOrCreateReturnTrackNode('return-1');
      engine.removeReturnTrackNode('return-1');
      expect(engine.returnTrackNodes.has('return-1')).toBe(false);
    });

    it('returns default meter for nonexistent return track', () => {
      const meter = engine.getReturnTrackMeter('nonexistent');
      expect(meter.level).toBe(0);
      expect(meter.clipped).toBe(false);
    });
  });

  // ── Track Group Routing ───────────────────────────────────────────────

  describe('track group routing', () => {
    it('routes track through group node', () => {
      engine.getOrCreateTrackNode('child');
      engine.getOrCreateTrackNode('group');

      expect(() => engine.setTrackGroupRouting('child', 'group')).not.toThrow();
    });

    it('routes track to master when group is null', () => {
      engine.getOrCreateTrackNode('child');

      expect(() => engine.setTrackGroupRouting('child', null)).not.toThrow();
    });

    it('does nothing for nonexistent track', () => {
      expect(() => engine.setTrackGroupRouting('nonexistent', 'group')).not.toThrow();
    });
  });

  // ── Metering ──────────────────────────────────────────────────────────

  describe('metering', () => {
    it('returns 0 level for nonexistent track', () => {
      expect(engine.getTrackLevel('nonexistent')).toBe(0);
    });

    it('returns default meter for nonexistent track', () => {
      const meter = engine.getTrackMeter('nonexistent');
      expect(meter.level).toBe(0);
      expect(meter.clipped).toBe(false);
    });

    it('reports master meter', () => {
      const meter = engine.getMasterMeter('input');
      expect(meter.level).toBeGreaterThanOrEqual(0);
      expect(typeof meter.clipped).toBe('boolean');
    });

    it('resets master clip indicator', () => {
      expect(() => engine.resetMasterClip('input')).not.toThrow();
      expect(() => engine.resetMasterClip('output')).not.toThrow();
    });

    it('returns spectrum data', () => {
      const spectrum = engine.getMasterSpectrum();
      expect(spectrum).toBeInstanceOf(Float32Array);
    });

    it('returns null spectrum for nonexistent track', () => {
      expect(engine.getTrackSpectrum('nonexistent')).toBeNull();
    });
  });

  // ── Mastering ──────────────────────────────────────────────────────────

  describe('mastering', () => {
    it('applies null mastering without error', () => {
      expect(() => engine.applyMastering(null)).not.toThrow();
    });

    it('applies mastering state', () => {
      expect(() => engine.applyMastering({
        enabled: true,
        previewOriginal: false,
        status: 'ready',
        analysis: { lufs: -14, peak: -1, rms: -18 },
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
      } as Parameters<typeof engine.applyMastering>[0])).not.toThrow();
    });
  });

  // ── Metronome ─────────────────────────────────────────────────────────

  describe('metronome', () => {
    it('schedules and stops metronome clicks', () => {
      expect(() => engine.scheduleMetronome(120, 4, 4, 0, 4)).not.toThrow();
      expect(() => engine.stopMetronome()).not.toThrow();
    });

    it('previews metronome click', async () => {
      await expect(engine.previewMetronomeClick()).resolves.not.toThrow();
      await expect(engine.previewMetronomeClick(true)).resolves.not.toThrow();
    });
  });

  // ── Scrub ─────────────────────────────────────────────────────────────

  describe('scrub', () => {
    it('starts and stops scrub preview', () => {
      expect(() => engine.startScrubPreview()).not.toThrow();
      expect(() => engine.updateScrubPreview(0.5)).not.toThrow();
      expect(() => engine.stopScrubPreview()).not.toThrow();
    });

    it('stops timeline scrub', () => {
      expect(() => engine.stopTimelineScrub()).not.toThrow();
    });
  });

  // ── Audio Stream ──────────────────────────────────────────────────────

  describe('audio stream', () => {
    it('gets and disposes audio stream', () => {
      const stream = engine.getAudioStream();
      expect(stream).toBeDefined();
      expect(() => engine.disposeAudioStream()).not.toThrow();
    });

    it('disposes cleanly when no stream created', () => {
      expect(() => engine.disposeAudioStream()).not.toThrow();
    });
  });

  // ── Callbacks ─────────────────────────────────────────────────────────

  describe('callbacks', () => {
    it('sets time update callback', () => {
      const cb = vi.fn();
      engine.setTimeUpdateCallback(cb);
      // No assertion needed — just verifying it doesn't throw
    });

    it('sets on ended callback', () => {
      const cb = vi.fn();
      engine.setOnEndedCallback(cb);
    });
  });

  // ── Resume ────────────────────────────────────────────────────────────

  describe('resume', () => {
    it('resumes audio context', async () => {
      await expect(engine.resume()).resolves.not.toThrow();
    });
  });

  // ── Sample Rate ───────────────────────────────────────────────────────

  describe('sample rate', () => {
    it('returns context sample rate', () => {
      expect(engine.sampleRate).toBe(48000);
    });

    it('returns spectrum bin count', () => {
      expect(engine.spectrumBinCount).toBeGreaterThan(0);
    });
  });

  // ── Decode Audio ──────────────────────────────────────────────────────

  describe('decodeAudioData', () => {
    it('decodes a blob to AudioBuffer', async () => {
      const blob = new Blob(['test'], { type: 'audio/wav' });
      const buffer = await engine.decodeAudioData(blob);
      expect(buffer).toBeDefined();
    });
  });

  // ── Gain Envelope Scheduling ──────────────────────────────────────────

  describe('gain envelope', () => {
    function makeBuffer(): AudioBuffer {
      return {
        duration: 4, length: 192000, sampleRate: 48000, numberOfChannels: 2,
        getChannelData: () => new Float32Array(192000),
        copyFromChannel: vi.fn(), copyToChannel: vi.fn(),
      } as unknown as AudioBuffer;
    }

    it('schedules gain envelope automation', () => {
      const clips: ClipScheduleInfo[] = [{
        clipId: 'clip-1',
        trackId: 'track-1',
        startTime: 0,
        buffer: makeBuffer(),
        audioOffset: 0,
        clipDuration: 4,
        gainEnvelope: [
          { time: 0, gain: 0.5 },
          { time: 2, gain: 1.0 },
          { time: 4, gain: 0.3 },
        ],
      }];

      engine.schedulePlayback(clips, 0, 10);

      expect(engine.scheduledSources.length).toBe(1);
    });

    it('schedules clip fades', () => {
      const clips: ClipScheduleInfo[] = [{
        clipId: 'clip-1',
        trackId: 'track-1',
        startTime: 0,
        buffer: makeBuffer(),
        audioOffset: 0,
        clipDuration: 4,
        fadeInDuration: 0.5,
        fadeOutDuration: 0.3,
        fadeInCurve: 'linear',
        fadeOutCurve: 'exponential',
      }];

      engine.schedulePlayback(clips, 0, 10);

      expect(engine.scheduledSources.length).toBe(1);
    });
  });

  // ── Playback Latency ──────────────────────────────────────────────────

  describe('playback latency', () => {
    it('measures playback latency', () => {
      const result = engine.measurePlaybackLatency();
      expect(result).toBeDefined();
    });

    it('refreshes playback latency compensation', () => {
      const result = engine.refreshPlaybackLatencyCompensation();
      expect(result).toBeDefined();
    });
  });

  // ── SyncSends ─────────────────────────────────────────────────────────

  describe('syncSends', () => {
    it('synchronizes send routing', () => {
      const tracks = [
        { id: 'track-1', sends: [{ returnTrackId: 'return-1', amount: 0.5, prePost: 'post' }] },
      ] as Parameters<typeof engine.syncSends>[0];
      const returnTracks = [
        { id: 'return-1', volume: 1, pan: 0 },
      ] as Parameters<typeof engine.syncSends>[1];

      engine.getOrCreateTrackNode('track-1');

      expect(() => engine.syncSends(tracks, returnTracks)).not.toThrow();
    });
  });

  // ── Dispose ───────────────────────────────────────────────────────────

  describe('dispose', () => {
    it('cleans up all resources', () => {
      engine.getOrCreateTrackNode('track-1');
      engine.getOrCreateReturnTrackNode('return-1');

      engine.dispose();

      expect(engine.trackNodes.size).toBe(0);
      expect(engine.returnTrackNodes.size).toBe(0);
    });
  });
});
