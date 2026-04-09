import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  captureHealthSnapshot,
  deriveHealthStatus,
  enumerateAudioDevices,
  detectXrun,
  type XrunDetector,
} from '../audioHealthMonitor';
import type { AudioHealthSnapshot } from '../../types/audioHealth';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<AudioHealthSnapshot> = {}): AudioHealthSnapshot {
  return {
    contextState: 'running',
    sampleRate: 48000,
    baseLatencyMs: 5.3,
    outputLatencyMs: 2.7,
    totalLatencyMs: 8.0,
    currentTime: 10.5,
    masterLevelDb: -12,
    masterClipping: false,
    estimatedLoad: 0.15,
    timestamp: Date.now(),
    ...overrides,
  };
}

// ── captureHealthSnapshot ──────────────────────────────────────────────────────

describe('captureHealthSnapshot', () => {
  it('captures metrics from a running AudioContext-like object', () => {
    const mockEngine = {
      ctx: {
        state: 'running' as AudioState,
        sampleRate: 48000,
        currentTime: 42.5,
        baseLatency: 0.0053,
        outputLatency: 0.0027,
      },
      getMasterMeter: () => ({ level: -6.2, clipped: false }),
    };

    const snap = captureHealthSnapshot(mockEngine as never);

    expect(snap.contextState).toBe('running');
    expect(snap.sampleRate).toBe(48000);
    expect(snap.currentTime).toBe(42.5);
    expect(snap.baseLatencyMs).toBeCloseTo(5.3, 0);
    expect(snap.outputLatencyMs).toBeCloseTo(2.7, 0);
    expect(snap.totalLatencyMs).toBeCloseTo(8.0, 0);
    expect(snap.masterLevelDb).toBeCloseTo(-6.2, 1);
    expect(snap.masterClipping).toBe(false);
    expect(snap.timestamp).toBeGreaterThan(0);
  });

  it('handles missing latency properties gracefully', () => {
    const mockEngine = {
      ctx: {
        state: 'suspended' as AudioState,
        sampleRate: 44100,
        currentTime: 0,
        // baseLatency and outputLatency not available in all browsers
      },
      getMasterMeter: () => ({ level: -Infinity, clipped: false }),
    };

    const snap = captureHealthSnapshot(mockEngine as never);

    expect(snap.contextState).toBe('suspended');
    expect(snap.sampleRate).toBe(44100);
    expect(snap.baseLatencyMs).toBeNull();
    expect(snap.outputLatencyMs).toBeNull();
    expect(snap.totalLatencyMs).toBeNull();
  });

  it('detects clipping from master meter', () => {
    const mockEngine = {
      ctx: {
        state: 'running' as AudioState,
        sampleRate: 48000,
        currentTime: 5.0,
        baseLatency: 0.005,
        outputLatency: 0.003,
      },
      getMasterMeter: () => ({ level: 0.1, clipped: true }),
    };

    const snap = captureHealthSnapshot(mockEngine as never);
    expect(snap.masterClipping).toBe(true);
    expect(snap.masterLevelDb).toBeCloseTo(0.1, 1);
  });
});

// ── deriveHealthStatus ─────────────────────────────────────────────────────────

describe('deriveHealthStatus', () => {
  it('returns "inactive" when context is suspended', () => {
    expect(deriveHealthStatus(makeSnapshot({ contextState: 'suspended' }), 0, 0)).toBe('inactive');
  });

  it('returns "error" when context is closed', () => {
    expect(deriveHealthStatus(makeSnapshot({ contextState: 'closed' }), 0, 0)).toBe('error');
  });

  it('returns "good" for healthy running context', () => {
    expect(deriveHealthStatus(makeSnapshot(), 0, 0)).toBe('good');
  });

  it('returns "warning" when clipping is detected', () => {
    expect(deriveHealthStatus(makeSnapshot({ masterClipping: true }), 3, 0)).toBe('warning');
  });

  it('returns "warning" when estimated load is high', () => {
    expect(deriveHealthStatus(makeSnapshot({ estimatedLoad: 0.85 }), 0, 0)).toBe('warning');
  });

  it('returns "error" when xrun count is high', () => {
    expect(deriveHealthStatus(makeSnapshot(), 0, 5)).toBe('error');
  });

  it('returns "warning" when latency is very high', () => {
    expect(deriveHealthStatus(makeSnapshot({ totalLatencyMs: 120 }), 0, 0)).toBe('warning');
  });
});

// ── detectXrun ─────────────────────────────────────────────────────────────────

describe('detectXrun', () => {
  it('returns no xrun on first call', () => {
    const detector: XrunDetector = { lastContextTime: 0, lastWallTime: 0, xrunCount: 0 };
    const result = detectXrun(detector, 0.05, 50);
    expect(result).toBe(false);
    expect(detector.xrunCount).toBe(0);
  });

  it('detects xrun when context time drifts significantly from wall time', () => {
    const detector: XrunDetector = { lastContextTime: 10.0, lastWallTime: 1000, xrunCount: 0 };
    // Wall time advanced 100ms but context time only advanced 20ms → gap of 80ms → xrun
    const result = detectXrun(detector, 10.02, 1100);
    expect(result).toBe(true);
    expect(detector.xrunCount).toBe(1);
  });

  it('does not false-trigger on normal time progression', () => {
    const detector: XrunDetector = { lastContextTime: 10.0, lastWallTime: 1000, xrunCount: 0 };
    // Wall time advanced 100ms, context time advanced ~100ms → no gap
    const result = detectXrun(detector, 10.1, 1100);
    expect(result).toBe(false);
    expect(detector.xrunCount).toBe(0);
  });
});

// ── enumerateAudioDevices ──────────────────────────────────────────────────────

describe('enumerateAudioDevices', () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty array when mediaDevices API is unavailable', async () => {
    // In jsdom, navigator.mediaDevices may not exist
    const spy = vi.spyOn(globalThis, 'navigator', 'get').mockReturnValue({
      ...originalNavigator,
      mediaDevices: undefined as never,
    });
    const result = await enumerateAudioDevices();
    expect(result).toEqual([]);
    spy.mockRestore();
  });

  it('filters and maps audio devices correctly', async () => {
    const mockDevices = [
      { deviceId: 'id1', label: 'Built-in Mic', kind: 'audioinput', groupId: 'g1' },
      { deviceId: 'id2', label: 'Headphones', kind: 'audiooutput', groupId: 'g2' },
      { deviceId: 'id3', label: 'Webcam', kind: 'videoinput', groupId: 'g3' },
      { deviceId: 'default', label: 'Default - Built-in Mic', kind: 'audioinput', groupId: 'g1' },
    ];

    const spy = vi.spyOn(globalThis, 'navigator', 'get').mockReturnValue({
      ...originalNavigator,
      mediaDevices: {
        enumerateDevices: vi.fn().mockResolvedValue(mockDevices),
      } as never,
    });

    const result = await enumerateAudioDevices();

    // Should only include audio devices, not video
    expect(result).toHaveLength(3);
    expect(result.every((d) => d.kind === 'audioinput' || d.kind === 'audiooutput')).toBe(true);
    expect(result.find((d) => d.deviceId === 'default')?.isDefault).toBe(true);
    expect(result.find((d) => d.deviceId === 'id1')?.isDefault).toBe(false);

    spy.mockRestore();
  });
});
