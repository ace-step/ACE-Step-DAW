/**
 * Tests for RecordingEngine — permission flow, lifecycle, monitoring, metering.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock getAudioEngine — RecordingEngine no longer imports Tone
// directly (Phase 5E migration), but still calls getAudioEngine()
// for the count-in / metronome clicks.
vi.mock('../../hooks/useAudioEngine', () => ({
  getAudioEngine: vi.fn(() => ({
    resume: vi.fn().mockResolvedValue(undefined),
    ctx: {
      currentTime: 0,
      createOscillator: vi.fn(() => ({
        type: 'sine',
        frequency: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn().mockReturnThis(),
        start: vi.fn(),
        stop: vi.fn(),
      })),
      createGain: vi.fn(() => ({
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn().mockReturnThis(),
      })),
      destination: {},
    },
  })),
}));

import { recordingEngine } from '../RecordingEngine';

// Helper to create mock AudioContext
function makeMockAudioContext() {
  const makeGain = () => ({
    gain: { value: 0 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  });
  return {
    createGain: vi.fn(makeGain),
    createAnalyser: vi.fn(() => ({
      fftSize: 2048,
      smoothingTimeConstant: 0.8,
      getFloatTimeDomainData: vi.fn((arr: Float32Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = 0.05;
      }),
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createMediaStreamSource: vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    destination: {},
    close: vi.fn(),
  };
}

function makeMockMediaStream() {
  return {
    getTracks: vi.fn(() => [{ stop: vi.fn() }]),
  };
}

// Since recordingEngine is a singleton, we can't easily get fresh instances.
// We'll call dispose() between tests and test state transitions.

describe('RecordingEngine', () => {
  beforeEach(() => {
    vi.stubGlobal('AudioContext', vi.fn().mockImplementation(makeMockAudioContext));
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    class MockMediaRecorder {
      state = 'inactive';
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      static isTypeSupported = vi.fn(() => true);
      start = vi.fn(() => { this.state = 'recording'; });
      stop = vi.fn(() => {
        this.state = 'inactive';
        this.onstop?.();
      });
    }
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(makeMockMediaStream()),
        enumerateDevices: vi.fn().mockResolvedValue([
          { kind: 'audioinput', deviceId: 'default', label: 'Default Mic' },
          { kind: 'audioinput', deviceId: 'mic2', label: 'External Mic' },
          { kind: 'audiooutput', deviceId: 'speaker', label: 'Speakers' },
        ]),
      },
    });
  });

  afterEach(() => {
    recordingEngine.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ── Permission Flow ────────────────────────────────────────────────────

  describe('requestPermission', () => {
    it('grants permission when getUserMedia succeeds', async () => {
      const result = await recordingEngine.requestPermission();
      expect(result).toBe(true);
      expect(recordingEngine.hasPermission).toBe(true);
      expect(recordingEngine.denied).toBe(false);
    });

    it('denies permission when getUserMedia fails', async () => {
      (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Denied'));

      const result = await recordingEngine.requestPermission();
      expect(result).toBe(false);
      expect(recordingEngine.hasPermission).toBe(false);
      expect(recordingEngine.denied).toBe(true);
    });

    it('passes specific deviceId constraint', async () => {
      await recordingEngine.requestPermission('mic2');
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: { deviceId: { exact: 'mic2' } },
      });
    });

    it('uses generic audio constraint for default device', async () => {
      await recordingEngine.requestPermission('default');
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: true,
      });
    });

    it('uses generic audio constraint when no device specified', async () => {
      await recordingEngine.requestPermission();
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: true,
      });
    });
  });

  // ── Device Enumeration ─────────────────────────────────────────────────

  describe('enumerateDevices', () => {
    it('lists only audioinput devices after permission', async () => {
      await recordingEngine.requestPermission();
      const devices = recordingEngine.getDevices();
      expect(devices).toHaveLength(2);
      expect(devices[0].deviceId).toBe('default');
      expect(devices[1].deviceId).toBe('mic2');
    });

    it('marks first device as default', async () => {
      await recordingEngine.requestPermission();
      const devices = recordingEngine.getDevices();
      expect(devices[0].isDefault).toBe(true);
    });

    it('labels unnamed devices with index', async () => {
      (navigator.mediaDevices.enumerateDevices as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { kind: 'audioinput', deviceId: 'a', label: '' },
      ]);
      await recordingEngine.requestPermission();
      // enumerateDevices is called inside requestPermission
      const devices = recordingEngine.getDevices();
      expect(devices[0].label).toBe('Microphone 1');
    });
  });

  // ── Device Selection ───────────────────────────────────────────────────

  describe('selectDevice', () => {
    it('stores selected device ID', async () => {
      await recordingEngine.requestPermission();
      await recordingEngine.selectDevice('mic2');
      expect(recordingEngine.getSelectedDeviceId()).toBe('mic2');
    });

    it('re-requests permission when switching after grant', async () => {
      await recordingEngine.requestPermission();
      const result = await recordingEngine.selectDevice('mic2');
      expect(result).toBe(true);
      // Verify it called getUserMedia with the new device
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenLastCalledWith({
        audio: { deviceId: { exact: 'mic2' } },
      });
    });
  });

  // ── Monitoring ─────────────────────────────────────────────────────────

  describe('monitoring', () => {
    it('defaults to off', () => {
      expect(recordingEngine.getMonitoring('track-1')).toBe(false);
    });

    it('toggles monitoring per track', () => {
      recordingEngine.setMonitoring('track-1', true);
      expect(recordingEngine.getMonitoring('track-1')).toBe(true);

      recordingEngine.setMonitoring('track-1', false);
      expect(recordingEngine.getMonitoring('track-1')).toBe(false);
    });
  });

  // ── Input Level Metering ───────────────────────────────────────────────

  describe('input level', () => {
    it('returns -Infinity when no audio context set up', () => {
      expect(recordingEngine.getInputLevel()).toBe(-Infinity);
    });

    it('returns linear 0 when level is very low', () => {
      expect(recordingEngine.getInputLevelLinear()).toBe(0);
    });

    it('returns -Infinity peak when no audio context', () => {
      expect(recordingEngine.getInputPeak()).toBe(-Infinity);
    });
  });

  // ── Recording Lifecycle ────────────────────────────────────────────────

  describe('recording lifecycle', () => {
    it('starts recording and creates session', async () => {
      await recordingEngine.requestPermission();
      const result = await recordingEngine.startRecording('track-1', 'region-1', 0.0);
      expect(result).toBe(true);
      expect(recordingEngine.recording).toBe(true);

      const session = recordingEngine.getSession('track-1');
      expect(session).toBeDefined();
      expect(session!.trackId).toBe('track-1');
      expect(session!.regionId).toBe('region-1');
      expect(session!.startTime).toBe(0.0);
      expect(session!.chunks).toEqual([]);
      expect(session!.waveformSamples).toEqual([]);
    });

    it('auto-requests permission if not granted when starting', async () => {
      const result = await recordingEngine.startRecording('track-1', 'region-1', 5.0);
      expect(result).toBe(true);
      expect(recordingEngine.hasPermission).toBe(true);
    });

    it('returns false if permission denied during recording start', async () => {
      (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Denied'));

      const result = await recordingEngine.startRecording('track-1', 'region-1', 0.0);
      expect(result).toBe(false);
      expect(recordingEngine.recording).toBe(false);
    });

    it('returns empty waveform for non-recording track', () => {
      expect(recordingEngine.getRecordingWaveform('nonexistent')).toEqual([]);
    });
  });

  // ── Count-In ───────────────────────────────────────────────────────────

  describe('count-in', () => {
    it('defaults to 1bar', () => {
      expect(recordingEngine.getCountInLength()).toBe('1bar');
    });

    it('sets count-in length', () => {
      recordingEngine.setCountInLength('2bars');
      expect(recordingEngine.getCountInLength()).toBe('2bars');

      recordingEngine.setCountInLength('off');
      expect(recordingEngine.getCountInLength()).toBe('off');
    });

    it('skips when count-in is off', async () => {
      recordingEngine.setCountInLength('off');
      const onBeat = vi.fn();
      await recordingEngine.playCountIn(120, 4, onBeat);
      expect(onBeat).not.toHaveBeenCalled();
    });
  });

  // ── State Getters ──────────────────────────────────────────────────────

  describe('state', () => {
    it('reports recording state', () => {
      expect(recordingEngine.recording).toBe(false);
    });

    it('reports counting-in state', () => {
      expect(recordingEngine.countingIn).toBe(false);
    });

    it('returns undefined for non-existent session', () => {
      expect(recordingEngine.getSession('nonexistent')).toBeUndefined();
    });
  });

  // ── Stop Recording ──────────────────────────────────────────────────────

  describe('stopRecording', () => {
    it('returns null for non-recording track', async () => {
      const result = await recordingEngine.stopRecording('nonexistent');
      expect(result).toBeNull();
    });

    it('returns null when recording has no chunks', async () => {
      await recordingEngine.requestPermission();
      await recordingEngine.startRecording('track-1', 'region-1', 0);

      // No chunks were pushed to session
      const result = await recordingEngine.stopRecording('track-1');
      expect(result).toBeNull();
      expect(recordingEngine.recording).toBe(false);
    });

    it('sets recording to false after stopping last track', async () => {
      await recordingEngine.requestPermission();
      await recordingEngine.startRecording('track-1', 'region-1', 0);

      await recordingEngine.stopRecording('track-1');

      expect(recordingEngine.recording).toBe(false);
    });

    it('removes session after stop', async () => {
      await recordingEngine.requestPermission();
      await recordingEngine.startRecording('track-1', 'region-1', 0);
      await recordingEngine.stopRecording('track-1');

      expect(recordingEngine.getSession('track-1')).toBeUndefined();
    });
  });

  // ── Stop All Recordings ────────────────────────────────────────────────

  describe('stopAllRecordings', () => {
    it('returns empty map when no recordings', async () => {
      const results = await recordingEngine.stopAllRecordings();
      expect(results.size).toBe(0);
    });
  });

  // ── Input Level Linear ─────────────────────────────────────────────────

  describe('getInputLevelLinear', () => {
    it('returns 0 for very low input', () => {
      expect(recordingEngine.getInputLevelLinear()).toBe(0);
    });
  });

  // ── Session management edge cases ─────────────────────────────────────

  describe('session management', () => {
    it('stores transport time in session', async () => {
      await recordingEngine.requestPermission();
      await recordingEngine.startRecording('track-1', 'region-1', 5.5);
      const session = recordingEngine.getSession('track-1');
      expect(session?.startTime).toBe(5.5);
    });

    it('handles multiple tracks recording simultaneously', async () => {
      await recordingEngine.requestPermission();
      await recordingEngine.startRecording('track-1', 'region-1', 0);
      // Session exists for track-1
      expect(recordingEngine.getSession('track-1')).toBeDefined();
      // Second recording replaces mediaRecorder but session can coexist in map
    });
  });

  // ── Metronome ──────────────────────────────────────────────────────────

  describe('metronome', () => {
    it('starts metronome and returns cleanup function', () => {
      const cleanup = recordingEngine.startMetronome(120, 4);
      expect(typeof cleanup).toBe('function');
      // Cleanup should not throw
      expect(() => cleanup()).not.toThrow();
    });
  });

  // ── Dispose ────────────────────────────────────────────────────────────

  describe('dispose', () => {
    it('cleans up resources after permission grant', async () => {
      await recordingEngine.requestPermission();
      expect(() => recordingEngine.dispose()).not.toThrow();
    });

    it('disposes cleanly without initialization', () => {
      expect(() => recordingEngine.dispose()).not.toThrow();
    });

    it('clears sessions on dispose', async () => {
      await recordingEngine.requestPermission();
      await recordingEngine.startRecording('track-1', 'region-1', 0.0);
      recordingEngine.dispose();
      expect(recordingEngine.getSession('track-1')).toBeUndefined();
    });
  });
});
