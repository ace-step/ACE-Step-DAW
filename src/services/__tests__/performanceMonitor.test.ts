import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  estimateCpuLoad,
  classifyCpuLoad,
  measureFps,
  detectDropout,
  getMemoryUsage,
  countActiveNodes,
  getAudioContextHealth,
  createPerformanceMonitor,
} from '../performanceMonitor';
import type { PerformanceMetrics, PerformanceMonitorConfig } from '../../types/performance';
import { CPU_LOAD_THRESHOLDS } from '../../types/performance';

// ─── estimateCpuLoad ──────────────────────────────────────────────────────

describe('estimateCpuLoad', () => {
  it('returns 0 for zero active nodes and effects', () => {
    expect(estimateCpuLoad(0, 0)).toBe(0);
  });

  it('increases with more active nodes', () => {
    const load5 = estimateCpuLoad(5, 0);
    const load20 = estimateCpuLoad(20, 0);
    expect(load20).toBeGreaterThan(load5);
  });

  it('increases with more active effects', () => {
    const load0fx = estimateCpuLoad(5, 0);
    const load10fx = estimateCpuLoad(5, 10);
    expect(load10fx).toBeGreaterThan(load0fx);
  });

  it('clamps to 100 for very high node counts', () => {
    expect(estimateCpuLoad(500, 200)).toBeLessThanOrEqual(100);
  });

  it('returns non-negative values', () => {
    expect(estimateCpuLoad(0, 0)).toBeGreaterThanOrEqual(0);
    expect(estimateCpuLoad(1, 0)).toBeGreaterThanOrEqual(0);
  });
});

// ─── classifyCpuLoad ──────────────────────────────────────────────────────

describe('classifyCpuLoad', () => {
  it('returns "low" for load below medium threshold', () => {
    expect(classifyCpuLoad(0)).toBe('low');
    expect(classifyCpuLoad(49)).toBe('low');
  });

  it('returns "medium" for load at medium threshold', () => {
    expect(classifyCpuLoad(CPU_LOAD_THRESHOLDS.medium)).toBe('medium');
    expect(classifyCpuLoad(79)).toBe('medium');
  });

  it('returns "high" for load at or above high threshold', () => {
    expect(classifyCpuLoad(CPU_LOAD_THRESHOLDS.high)).toBe('high');
    expect(classifyCpuLoad(100)).toBe('high');
  });
});

// ─── measureFps ───────────────────────────────────────────────────────────

describe('measureFps', () => {
  it('returns 60 for consistent 16.67ms frame deltas', () => {
    const deltas = Array(60).fill(16.667);
    expect(measureFps(deltas)).toBeCloseTo(60, 0);
  });

  it('returns 30 for consistent 33.33ms frame deltas', () => {
    const deltas = Array(60).fill(33.333);
    expect(measureFps(deltas)).toBeCloseTo(30, 0);
  });

  it('returns 0 for empty deltas array', () => {
    expect(measureFps([])).toBe(0);
  });

  it('handles mixed frame deltas', () => {
    // Half at 60fps, half at 30fps
    const deltas = [...Array(30).fill(16.667), ...Array(30).fill(33.333)];
    const fps = measureFps(deltas);
    expect(fps).toBeGreaterThan(30);
    expect(fps).toBeLessThan(60);
  });
});

// ─── detectDropout ────────────────────────────────────────────────────────

describe('detectDropout', () => {
  it('returns false for normal frame delta', () => {
    expect(detectDropout(16.667, 50)).toBe(false);
  });

  it('returns true when delta exceeds threshold', () => {
    expect(detectDropout(60, 50)).toBe(true);
  });

  it('returns false at exactly the threshold', () => {
    expect(detectDropout(50, 50)).toBe(false);
  });

  it('returns true for very large gaps', () => {
    expect(detectDropout(500, 50)).toBe(true);
  });
});

// ─── getMemoryUsage ───────────────────────────────────────────────────────

describe('getMemoryUsage', () => {
  it('returns -1 for both values when performance.memory is unavailable', () => {
    const result = getMemoryUsage();
    // In test environment, performance.memory is typically unavailable
    expect(result.heapUsedMb).toBe(-1);
    expect(result.heapLimitMb).toBe(-1);
  });
});

// ─── countActiveNodes ─────────────────────────────────────────────────────

describe('countActiveNodes', () => {
  it('returns 0 when tracks is empty', () => {
    expect(countActiveNodes([])).toBe(0);
  });

  it('counts nodes from tracks with effects', () => {
    const tracks = [
      { effects: [{ enabled: true }, { enabled: false }, { enabled: true }] },
      { effects: [{ enabled: true }] },
    ];
    // Each track has a base node (gain/channel), plus enabled effects
    const count = countActiveNodes(tracks as any);
    expect(count).toBeGreaterThan(0);
  });

  it('counts base node per track even without effects', () => {
    const tracks = [
      { effects: [] },
      { effects: [] },
    ];
    const count = countActiveNodes(tracks as any);
    expect(count).toBe(2); // 1 base node per track
  });
});

// ─── getAudioContextHealth ────────────────────────────────────────────────

describe('getAudioContextHealth', () => {
  it('returns defaults when no AudioContext is provided', () => {
    const health = getAudioContextHealth(null);
    expect(health.state).toBe('closed');
    expect(health.baseLatencyMs).toBe(0);
    expect(health.outputLatencyMs).toBe(0);
    expect(health.sampleRate).toBe(0);
  });

  it('reads properties from a real-ish AudioContext', () => {
    const mockCtx = {
      state: 'running' as AudioContextState,
      baseLatency: 0.005,
      outputLatency: 0.01,
      sampleRate: 48000,
    };
    const health = getAudioContextHealth(mockCtx as any);
    expect(health.state).toBe('running');
    expect(health.baseLatencyMs).toBeCloseTo(5, 1);
    expect(health.outputLatencyMs).toBeCloseTo(10, 1);
    expect(health.sampleRate).toBe(48000);
  });
});

// ─── createPerformanceMonitor ─────────────────────────────────────────────

describe('createPerformanceMonitor', () => {
  let monitor: ReturnType<typeof createPerformanceMonitor>;

  beforeEach(() => {
    monitor = createPerformanceMonitor({
      updateRateHz: 4,
      fpsWindowSize: 10,
      dropoutThresholdMs: 50,
      dropoutToastRateLimitMs: 10_000,
    });
  });

  afterEach(() => {
    monitor.stop();
  });

  it('starts with default metrics', () => {
    const metrics = monitor.getMetrics();
    expect(metrics.cpuLoad).toBe(0);
    expect(metrics.fps).toBe(0);
    expect(metrics.dropoutCount).toBe(0);
    expect(metrics.dropoutDetected).toBe(false);
  });

  it('records frame timing via tick()', () => {
    // Simulate 10 frames at ~60fps
    for (let i = 0; i < 10; i++) {
      monitor.tick(i * 16.667);
    }
    const metrics = monitor.getMetrics();
    expect(metrics.fps).toBeGreaterThan(0);
  });

  it('detects dropout on large frame gap', () => {
    monitor.tick(0);
    monitor.tick(16.667);
    monitor.tick(100); // 83.3ms gap — exceeds 50ms threshold
    const metrics = monitor.getMetrics();
    expect(metrics.dropoutCount).toBe(1);
    expect(metrics.dropoutDetected).toBe(true);
  });

  it('clears dropoutDetected flag after acknowledging', () => {
    monitor.tick(0);
    monitor.tick(100); // dropout
    expect(monitor.getMetrics().dropoutDetected).toBe(true);
    monitor.acknowledgeDropout();
    expect(monitor.getMetrics().dropoutDetected).toBe(false);
  });

  it('resets all counters on reset()', () => {
    monitor.tick(0);
    monitor.tick(100); // dropout
    monitor.reset();
    const metrics = monitor.getMetrics();
    expect(metrics.dropoutCount).toBe(0);
    expect(metrics.dropoutDetected).toBe(false);
    expect(metrics.fps).toBe(0);
  });

  it('updates node and effect counts via setAudioStats()', () => {
    monitor.setAudioStats(15, 8);
    const metrics = monitor.getMetrics();
    expect(metrics.activeNodeCount).toBe(15);
    expect(metrics.activeEffectCount).toBe(8);
    expect(metrics.cpuLoad).toBeGreaterThan(0);
  });

  it('updates AudioContext health via setAudioContextHealth()', () => {
    monitor.setAudioContextHealth({
      state: 'running',
      baseLatencyMs: 5.8,
      outputLatencyMs: 10.2,
      sampleRate: 48000,
    });
    const metrics = monitor.getMetrics();
    expect(metrics.audioContextState).toBe('running');
    expect(metrics.baseLatencyMs).toBeCloseTo(5.8, 1);
    expect(metrics.sampleRate).toBe(48000);
  });
});
