import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FpsMeasure } from '../fpsMeasure';

describe('FpsMeasure', () => {
  let rafCallbacks: Array<(time: number) => void>;
  let rafIdCounter: number;

  beforeEach(() => {
    rafCallbacks = [];
    rafIdCounter = 0;

    // Stub rAF explicitly for deterministic frame simulation
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return ++rafIdCounter;
    });
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Flush one round of pending rAF callbacks. Pass 0 — tick reads performance.now() internally. */
  function flushRaf() {
    const cbs = rafCallbacks.splice(0);
    for (const cb of cbs) cb(0);
  }

  it('returns empty report before start', () => {
    const fps = new FpsMeasure();
    const report = fps.getReport();
    expect(report.frameCount).toBe(0);
    expect(report.averageFps).toBe(0);
    expect(report.durationMs).toBe(0);
  });

  it('measures frame times via requestAnimationFrame', () => {
    const fps = new FpsMeasure();

    // Use clean 16ms increments (62.5fps) to avoid floating-point issues
    let time = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => {
      time += 16;
      return time;
    });

    fps.start(); // tick() sets baseline (time=16), schedules rAF

    for (let i = 0; i < 5; i++) {
      flushRaf(); // Each records one frame: 32-16=16, 48-32=16, ...
    }

    fps.stop();

    const report = fps.getReport();
    expect(report.frameCount).toBe(5);
    // 1000 / 16 = 62.5 → rounds to 63
    expect(report.averageFps).toBe(63);
  });

  it('reports zero after stop with no frames', () => {
    const fps = new FpsMeasure();
    fps.start();
    fps.stop();
    const report = fps.getReport();
    expect(report.frameCount).toBe(0);
    expect(report.durationMs).toBe(0);
  });

  it('calculates min/max FPS correctly', () => {
    const fps = new FpsMeasure();
    // Explicit timestamps: baseline=100, then frames at +10, +10, +40, +10, +5
    const timestamps = [100, 110, 120, 160, 170, 175];
    let callIdx = 0;

    vi.spyOn(performance, 'now').mockImplementation(() => {
      return timestamps[Math.min(callIdx++, timestamps.length - 1)];
    });

    fps.start(); // baseline at 100
    for (let i = 0; i < 5; i++) {
      flushRaf(); // frames: 10, 10, 40, 10, 5
    }
    fps.stop();

    const report = fps.getReport();
    expect(report.frameCount).toBe(5);
    // min FPS from slowest frame (40ms → 25fps)
    expect(report.minFps).toBe(25);
    // max FPS from fastest frame (5ms → 200fps)
    expect(report.maxFps).toBe(200);
    expect(report.minFps).toBeLessThanOrEqual(report.averageFps);
    expect(report.maxFps).toBeGreaterThanOrEqual(report.averageFps);
  });

  it('guards against zero frame times (Infinity prevention)', () => {
    const fps = new FpsMeasure();
    let time = 100;

    // All calls return the same time → 0ms frame deltas
    vi.spyOn(performance, 'now').mockImplementation(() => time);

    fps.start();
    for (let i = 0; i < 3; i++) flushRaf();
    fps.stop();

    const report = fps.getReport();
    expect(Number.isFinite(report.averageFps)).toBe(true);
    expect(Number.isFinite(report.maxFps)).toBe(true);
    expect(report.averageFps).toBe(0);
  });
});
