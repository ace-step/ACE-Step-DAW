/**
 * RecordingEngine unit tests — focused on state management and public API.
 * Uses vi.resetModules() + dynamic import per test so the singleton
 * recordingEngine is re-created and state cannot leak between tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Tone.js before import
vi.mock('tone', () => ({
  start: vi.fn(async () => {}),
  MembraneSynth: vi.fn().mockImplementation(() => ({
    toDestination: vi.fn().mockReturnThis(),
    triggerAttackRelease: vi.fn(),
    dispose: vi.fn(),
  })),
}));

let recordingEngine: (typeof import('../RecordingEngine'))['recordingEngine'];

describe('RecordingEngine', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    ({ recordingEngine } = await import('../RecordingEngine'));
  });

  // ── Initial state ──

  it('starts with no permission', () => {
    expect(recordingEngine.hasPermission).toBe(false);
  });

  it('starts with not recording', () => {
    expect(recordingEngine.recording).toBe(false);
  });

  it('starts with not counting in', () => {
    expect(recordingEngine.countingIn).toBe(false);
  });

  it('starts with no permission denial', () => {
    expect(recordingEngine.denied).toBe(false);
  });

  // ── Count-in configuration ──

  it('defaults to 1bar count-in', () => {
    expect(recordingEngine.getCountInLength()).toBe('1bar');
  });

  it('sets count-in to 2bars', () => {
    recordingEngine.setCountInLength('2bars');
    expect(recordingEngine.getCountInLength()).toBe('2bars');
  });

  it('sets count-in to off', () => {
    recordingEngine.setCountInLength('off');
    expect(recordingEngine.getCountInLength()).toBe('off');
  });

  // ── Monitoring ──

  it('starts with no monitoring on any track', () => {
    expect(recordingEngine.getMonitoring('track-1')).toBe(false);
    expect(recordingEngine.getMonitoring('nonexistent')).toBe(false);
  });

  it('sets monitoring for a track', () => {
    recordingEngine.setMonitoring('track-1', true);
    expect(recordingEngine.getMonitoring('track-1')).toBe(true);
    expect(recordingEngine.getMonitoring('track-2')).toBe(false);
  });

  it('disables monitoring for a track', () => {
    recordingEngine.setMonitoring('track-1', true);
    recordingEngine.setMonitoring('track-1', false);
    expect(recordingEngine.getMonitoring('track-1')).toBe(false);
  });

  // ── Device selection ──

  it('defaults to "default" device id', () => {
    expect(recordingEngine.getSelectedDeviceId()).toBe('default');
  });

  it('returns empty device list before permission', () => {
    expect(recordingEngine.getDevices()).toEqual([]);
  });

  // ── Input level ──

  it('returns -Infinity for input level when not connected', () => {
    expect(recordingEngine.getInputLevel()).toBe(-Infinity);
    expect(recordingEngine.getInputPeak()).toBe(-Infinity);
  });

  it('returns 0 for linear input level when not connected', () => {
    expect(recordingEngine.getInputLevelLinear()).toBe(0);
  });

  // ── Session state ──

  it('returns undefined for nonexistent session', () => {
    expect(recordingEngine.getSession('track-1')).toBeUndefined();
  });

  it('returns empty waveform for non-recording track', () => {
    expect(recordingEngine.getRecordingWaveform('track-1')).toEqual([]);
  });

  // ── Recording without permission ──

  it('fails to start recording without permission', async () => {
    const originalNavigator = globalThis.navigator;
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(new Error('NotAllowed')),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
    });

    try {
      const result = await recordingEngine.startRecording('track-1', 'region-1', 0);
      expect(result).toBe(false);
    } finally {
      vi.stubGlobal('navigator', originalNavigator);
    }
  });
});
