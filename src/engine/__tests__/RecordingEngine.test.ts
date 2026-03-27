import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Tone.js
// ---------------------------------------------------------------------------
vi.mock('tone', () => {
  class MockMembraneSynth {
    triggerAttackRelease = vi.fn();
    dispose = vi.fn();
    volume = { value: 0 };
    toDestination() { return this; }
  }
  return {
    start: vi.fn().mockResolvedValue(undefined),
    MembraneSynth: MockMembraneSynth,
    getTransport: vi.fn(() => ({
      scheduleRepeat: vi.fn(() => 42),
      clear: vi.fn(),
    })),
  };
});

// ---------------------------------------------------------------------------
// Audio node / context stubs
// ---------------------------------------------------------------------------
function makeAudioParam(initial = 0) {
  let _value = initial;
  return {
    get value() { return _value; },
    set value(v: number) { _value = v; },
    linearRampToValueAtTime: vi.fn(),
    setValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
}

function makeGainNode() {
  return {
    gain: makeAudioParam(1),
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
  };
}

function makeAnalyserNode() {
  return {
    fftSize: 2048,
    smoothingTimeConstant: 0.8,
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    getFloatTimeDomainData: vi.fn((arr: Float32Array) => {
      // Simulate silence by default
      arr.fill(0);
    }),
  };
}

function makeMediaStreamSource() {
  return {
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
  };
}

function makeMockAudioContext() {
  const ctx = {
    currentTime: 0,
    sampleRate: 44100,
    destination: {},
    createGain: vi.fn(() => makeGainNode()),
    createMediaStreamSource: vi.fn(() => makeMediaStreamSource()),
    createAnalyser: vi.fn(() => makeAnalyserNode()),
    close: vi.fn(),
    decodeAudioData: vi.fn(),
  };
  return ctx;
}

function makeMockMediaStream() {
  return {
    getTracks: vi.fn(() => [{ stop: vi.fn() }]),
  };
}

// ---------------------------------------------------------------------------
// Global mocks for navigator.mediaDevices and AudioContext
// ---------------------------------------------------------------------------
let mockAudioContextInstance: ReturnType<typeof makeMockAudioContext>;

const mockGetUserMedia = vi.fn();
const mockEnumerateDevices = vi.fn();

vi.stubGlobal('navigator', {
  mediaDevices: {
    getUserMedia: mockGetUserMedia,
    enumerateDevices: mockEnumerateDevices,
  },
});

vi.stubGlobal('AudioContext', class MockAudioContext {
  currentTime = 0;
  sampleRate = 44100;
  destination = {};
  createGain = vi.fn(() => makeGainNode());
  createMediaStreamSource = vi.fn(() => makeMediaStreamSource());
  createAnalyser = vi.fn(() => makeAnalyserNode());
  close = vi.fn();
  decodeAudioData = vi.fn();
  constructor() {
    mockAudioContextInstance = this as unknown as ReturnType<typeof makeMockAudioContext>;
  }
});

// Mock requestAnimationFrame / cancelAnimationFrame for level metering
let rafCallbacks: Map<number, FrameRequestCallback> = new Map();
let rafId = 0;
vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => {
  const id = ++rafId;
  rafCallbacks.set(id, cb);
  return id;
}));
vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => {
  rafCallbacks.delete(id);
}));

// Mock MediaRecorder
let mockMediaRecorderInstance: {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  state: string;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
};

class MockMediaRecorder {
  start = vi.fn(() => { this.state = 'recording'; });
  stop = vi.fn(() => {
    this.state = 'inactive';
    if (this.onstop) this.onstop();
  });
  state = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  static isTypeSupported = vi.fn(() => true);

  constructor() {
    mockMediaRecorderInstance = this;
  }
}

vi.stubGlobal('MediaRecorder', MockMediaRecorder);

// ---------------------------------------------------------------------------
// Import the class fresh for each test
// ---------------------------------------------------------------------------
// We need to create fresh instances, so we import the class not the singleton
let RecordingEngineModule: typeof import('../RecordingEngine');

describe('RecordingEngine', () => {
  let engine: InstanceType<typeof RecordingEngineModule.RecordingEngine>;

  beforeEach(async () => {
    vi.clearAllMocks();
    rafCallbacks.clear();
    rafId = 0;

    // Default: getUserMedia succeeds
    mockGetUserMedia.mockResolvedValue(makeMockMediaStream());

    // Default: enumerateDevices returns two inputs
    mockEnumerateDevices.mockResolvedValue([
      { kind: 'audioinput', deviceId: 'default', label: 'Built-in Mic' },
      { kind: 'audioinput', deviceId: 'usb-mic', label: 'USB Microphone' },
      { kind: 'audiooutput', deviceId: 'speaker', label: 'Speakers' },
    ]);

    // Dynamically re-import to get the class (not the singleton)
    // We can't easily re-import the module each time, so we access the class.
    // The module exports both `RecordingEngine` (class) and `recordingEngine` (singleton).
    // We'll use `new` on the class.
    if (!RecordingEngineModule) {
      RecordingEngineModule = await import('../RecordingEngine');
    }

    // Use Object.create + constructor trick is not needed since the class is exported.
    // Actually, checking if the class is exported...
    // The file has: class RecordingEngine { ... } export const recordingEngine = new RecordingEngine();
    // The class itself is NOT exported with `export class`. Let's check.
    // Looking back at the source: `class RecordingEngine {` (no export keyword)
    // So only the singleton is exported. We need to work differently.
    // We'll call dispose() between tests to reset the singleton.
    engine = RecordingEngineModule.recordingEngine;
    engine.dispose();
  });

  afterEach(() => {
    engine.dispose();
  });

  // =========================================================================
  // Permission
  // =========================================================================
  describe('requestPermission', () => {
    it('grants permission and returns true on success', async () => {
      const result = await engine.requestPermission();

      expect(result).toBe(true);
      expect(engine.hasPermission).toBe(true);
      expect(engine.denied).toBe(false);
      expect(mockGetUserMedia).toHaveBeenCalledTimes(1);
    });

    it('passes audio: true when no deviceId is provided', async () => {
      await engine.requestPermission();

      expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true });
    });

    it('passes audio: true when deviceId is "default"', async () => {
      await engine.requestPermission('default');

      expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true });
    });

    it('passes exact deviceId constraint for non-default device', async () => {
      await engine.requestPermission('usb-mic');

      expect(mockGetUserMedia).toHaveBeenCalledWith({
        audio: { deviceId: { exact: 'usb-mic' } },
      });
    });

    it('denies permission and returns false on error', async () => {
      mockGetUserMedia.mockRejectedValue(new DOMException('Not allowed'));

      const result = await engine.requestPermission();

      expect(result).toBe(false);
      expect(engine.hasPermission).toBe(false);
      expect(engine.denied).toBe(true);
    });

    it('stops existing media tracks before requesting new stream', async () => {
      // First call sets up a stream
      const firstStream = makeMockMediaStream();
      mockGetUserMedia.mockResolvedValueOnce(firstStream);
      await engine.requestPermission();

      // Second call should stop the first stream's tracks
      await engine.requestPermission();

      expect(firstStream.getTracks).toHaveBeenCalled();
    });

    it('creates AudioContext and connects audio graph', async () => {
      await engine.requestPermission();

      // Source -> inputGain -> analyser chain was set up
      expect(mockAudioContextInstance.createMediaStreamSource).toHaveBeenCalledTimes(1);
      expect(mockAudioContextInstance.createAnalyser).toHaveBeenCalledTimes(1);
      // Two gain nodes: inputGain and monitorGain
      expect(mockAudioContextInstance.createGain).toHaveBeenCalledTimes(2);
    });

    it('enumerates devices after gaining permission', async () => {
      await engine.requestPermission();

      expect(mockEnumerateDevices).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Device enumeration
  // =========================================================================
  describe('enumerateDevices', () => {
    it('returns only audioinput devices', async () => {
      const devices = await engine.enumerateDevices();

      expect(devices).toHaveLength(2);
      expect(devices[0].deviceId).toBe('default');
      expect(devices[0].label).toBe('Built-in Mic');
      expect(devices[1].deviceId).toBe('usb-mic');
    });

    it('marks the first device as default', async () => {
      const devices = await engine.enumerateDevices();

      expect(devices[0].isDefault).toBe(true);
    });

    it('provides fallback labels for unlabeled devices', async () => {
      mockEnumerateDevices.mockResolvedValue([
        { kind: 'audioinput', deviceId: 'a', label: '' },
        { kind: 'audioinput', deviceId: 'b', label: '' },
      ]);

      const devices = await engine.enumerateDevices();

      expect(devices[0].label).toBe('Microphone 1');
      expect(devices[1].label).toBe('Microphone 2');
    });

    it('returns empty array on error', async () => {
      mockEnumerateDevices.mockRejectedValue(new Error('fail'));

      const devices = await engine.enumerateDevices();

      expect(devices).toEqual([]);
    });

    it('getDevices returns cached device list', async () => {
      await engine.enumerateDevices();

      const cached = engine.getDevices();
      expect(cached).toHaveLength(2);
      expect(cached[0].deviceId).toBe('default');
    });
  });

  // =========================================================================
  // Device selection
  // =========================================================================
  describe('selectDevice', () => {
    it('updates selectedDeviceId', async () => {
      await engine.selectDevice('usb-mic');

      expect(engine.getSelectedDeviceId()).toBe('usb-mic');
    });

    it('reconnects stream when permission is already granted', async () => {
      await engine.requestPermission();
      mockGetUserMedia.mockClear();

      await engine.selectDevice('usb-mic');

      expect(mockGetUserMedia).toHaveBeenCalledWith({
        audio: { deviceId: { exact: 'usb-mic' } },
      });
    });

    it('returns false when getUserMedia fails during reconnect', async () => {
      // First grant permission so selectDevice tries to reconnect
      await engine.requestPermission();
      mockGetUserMedia.mockRejectedValueOnce(new DOMException('device error'));

      const result = await engine.selectDevice('bad-device');

      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // Monitoring
  // =========================================================================
  describe('monitoring', () => {
    it('defaults to off for any track', () => {
      expect(engine.getMonitoring('track-1')).toBe(false);
    });

    it('enables monitoring for a track', async () => {
      await engine.requestPermission();
      engine.setMonitoring('track-1', true);

      expect(engine.getMonitoring('track-1')).toBe(true);
    });

    it('disables monitoring for a track', async () => {
      await engine.requestPermission();
      engine.setMonitoring('track-1', true);
      engine.setMonitoring('track-1', false);

      expect(engine.getMonitoring('track-1')).toBe(false);
    });

    it('tracks monitoring state independently per track', async () => {
      await engine.requestPermission();
      engine.setMonitoring('track-1', true);
      engine.setMonitoring('track-2', false);

      expect(engine.getMonitoring('track-1')).toBe(true);
      expect(engine.getMonitoring('track-2')).toBe(false);
    });
  });

  // =========================================================================
  // Input level
  // =========================================================================
  describe('input level', () => {
    it('returns -Infinity for input level before permission', () => {
      expect(engine.getInputLevel()).toBe(-Infinity);
    });

    it('returns -Infinity for input peak before permission', () => {
      expect(engine.getInputPeak()).toBe(-Infinity);
    });

    it('getInputLevelLinear returns 0 when level is -60 or below', () => {
      // Before any recording, level is -Infinity
      expect(engine.getInputLevelLinear()).toBe(0);
    });
  });

  // =========================================================================
  // Recording lifecycle
  // =========================================================================
  describe('startRecording', () => {
    it('returns true when recording starts successfully', async () => {
      await engine.requestPermission();

      const result = await engine.startRecording('track-1', 'region-1', 0);

      expect(result).toBe(true);
      expect(engine.recording).toBe(true);
    });

    it('creates a session for the track', async () => {
      await engine.requestPermission();

      await engine.startRecording('track-1', 'region-1', 4.5);

      const session = engine.getSession('track-1');
      expect(session).not.toBeNull();
      expect(session!.trackId).toBe('track-1');
      expect(session!.regionId).toBe('region-1');
      expect(session!.startTime).toBe(4.5);
      expect(session!.chunks).toEqual([]);
      expect(session!.waveformSamples).toEqual([]);
    });

    it('starts MediaRecorder with 100ms timeslice', async () => {
      await engine.requestPermission();

      await engine.startRecording('track-1', 'region-1', 0);

      expect(mockMediaRecorderInstance.start).toHaveBeenCalledWith(100);
    });

    it('checks for opus codec support', async () => {
      await engine.requestPermission();

      await engine.startRecording('track-1', 'region-1', 0);

      expect(MediaRecorder.isTypeSupported).toHaveBeenCalledWith('audio/webm;codecs=opus');
    });

    it('requests permission automatically if not already granted', async () => {
      // Don't call requestPermission first
      const result = await engine.startRecording('track-1', 'region-1', 0);

      expect(result).toBe(true);
      expect(mockGetUserMedia).toHaveBeenCalledTimes(1);
    });

    it('returns false when permission is denied', async () => {
      mockGetUserMedia.mockRejectedValue(new DOMException('Denied'));

      const result = await engine.startRecording('track-1', 'region-1', 0);

      expect(result).toBe(false);
      expect(engine.recording).toBe(false);
    });
  });

  describe('stopRecording', () => {
    it('returns null for unknown track', async () => {
      const result = await engine.stopRecording('nonexistent');

      expect(result).toBeNull();
    });

    it('returns null when no chunks were recorded', async () => {
      await engine.requestPermission();
      await engine.startRecording('track-1', 'region-1', 0);

      // Stop without any data arriving
      const result = await engine.stopRecording('track-1');

      expect(result).toBeNull();
      expect(engine.recording).toBe(false);
    });

    it('stops the MediaRecorder', async () => {
      await engine.requestPermission();
      await engine.startRecording('track-1', 'region-1', 0);

      await engine.stopRecording('track-1');

      expect(mockMediaRecorderInstance.stop).toHaveBeenCalledTimes(1);
    });

    it('removes the session after stopping', async () => {
      await engine.requestPermission();
      await engine.startRecording('track-1', 'region-1', 0);

      await engine.stopRecording('track-1');

      expect(engine.getSession('track-1')).toBeUndefined();
    });

    it('sets recording to false when last session stops', async () => {
      await engine.requestPermission();
      await engine.startRecording('track-1', 'region-1', 0);

      await engine.stopRecording('track-1');

      expect(engine.recording).toBe(false);
    });
  });

  // =========================================================================
  // Waveform
  // =========================================================================
  describe('getRecordingWaveform', () => {
    it('returns empty array for unknown track', () => {
      expect(engine.getRecordingWaveform('unknown')).toEqual([]);
    });

    it('returns waveformSamples from active session', async () => {
      await engine.requestPermission();
      await engine.startRecording('track-1', 'region-1', 0);

      const session = engine.getSession('track-1');
      // Simulate waveform data being pushed
      session!.waveformSamples.push(0.5, 0.7, 0.3);

      expect(engine.getRecordingWaveform('track-1')).toEqual([0.5, 0.7, 0.3]);
    });
  });

  // =========================================================================
  // Count-In
  // =========================================================================
  describe('count-in', () => {
    it('defaults to 1bar', () => {
      expect(engine.getCountInLength()).toBe('1bar');
    });

    it('can be set to 2bars', () => {
      engine.setCountInLength('2bars');
      expect(engine.getCountInLength()).toBe('2bars');
    });

    it('can be set to off', () => {
      engine.setCountInLength('off');
      expect(engine.getCountInLength()).toBe('off');
    });

    it('countingIn starts as false', () => {
      expect(engine.countingIn).toBe(false);
    });

    it('playCountIn resolves immediately when count-in is off', async () => {
      engine.setCountInLength('off');
      const onBeat = vi.fn();

      await engine.playCountIn(120, 4, onBeat);

      expect(onBeat).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Getters
  // =========================================================================
  describe('state getters', () => {
    it('recording is false after dispose', () => {
      expect(engine.recording).toBe(false);
    });

    it('hasPermission reflects permission state after grant', async () => {
      await engine.requestPermission();
      expect(engine.hasPermission).toBe(true);
    });

    it('hasPermission reflects permission state after denial', async () => {
      mockGetUserMedia.mockRejectedValueOnce(new DOMException('Denied'));
      await engine.requestPermission();
      expect(engine.hasPermission).toBe(false);
    });

    it('denied is true after permission denial', async () => {
      mockGetUserMedia.mockRejectedValueOnce(new DOMException('Denied'));
      await engine.requestPermission();
      expect(engine.denied).toBe(true);
    });

    it('getSession returns undefined for unknown track', () => {
      expect(engine.getSession('unknown')).toBeUndefined();
    });
  });

  // =========================================================================
  // Dispose
  // =========================================================================
  describe('dispose', () => {
    it('stops media tracks', async () => {
      const stream = makeMockMediaStream();
      mockGetUserMedia.mockResolvedValueOnce(stream);
      await engine.requestPermission();

      engine.dispose();

      expect(stream.getTracks).toHaveBeenCalled();
    });

    it('closes AudioContext', async () => {
      await engine.requestPermission();

      engine.dispose();

      expect(mockAudioContextInstance.close).toHaveBeenCalledTimes(1);
    });

    it('resets input levels to -Infinity', async () => {
      await engine.requestPermission();

      engine.dispose();

      expect(engine.getInputLevel()).toBe(-Infinity);
      expect(engine.getInputPeak()).toBe(-Infinity);
    });

    it('clears all sessions', async () => {
      await engine.requestPermission();
      await engine.startRecording('track-1', 'region-1', 0);

      engine.dispose();

      expect(engine.getSession('track-1')).toBeUndefined();
    });

    it('clears monitoring state', async () => {
      await engine.requestPermission();
      engine.setMonitoring('track-1', true);

      engine.dispose();

      expect(engine.getMonitoring('track-1')).toBe(false);
    });
  });

  // =========================================================================
  // Metronome
  // =========================================================================
  describe('startMetronome', () => {
    it('returns a cleanup function', () => {
      const cleanup = engine.startMetronome(120, 4);

      expect(typeof cleanup).toBe('function');
    });

    it('cleanup function can be called without error', () => {
      const cleanup = engine.startMetronome(120, 4);

      expect(() => cleanup()).not.toThrow();
    });
  });
});
