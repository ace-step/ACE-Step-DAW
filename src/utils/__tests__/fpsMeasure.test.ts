import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FpsMeasure } from '../fpsMeasure';

describe('FpsMeasure', () => {
  let fps: FpsMeasure;
  let rafCallbacks: Array<(time: number) => void>;

  beforeEach(() => {
    fps = new FpsMeasure();
    rafCallbacks = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb as (time: number) => void);
      return rafCallbacks.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    fps.stop();
    vi.restoreAllMocks();
  });

  it('starts and stops', () => {
    expect(fps.isRunning).toBe(false);
    fps.start();
    expect(fps.isRunning).toBe(true);
    fps.stop();
    expect(fps.isRunning).toBe(false);
  });

  it('returns 0 fps with no frames', () => {
    expect(fps.fps).toBe(0);
    expect(fps.minFps).toBe(0);
  });

  it('returns 0 fps with only 1 frame', () => {
    fps.start();
    // Initial frame logged by start() via performance.now()
    // Only 1 frame, need at least 2 for interval
    expect(fps.fps).toBe(0);
  });

  it('calculates fps from simulated frames', () => {
    const t0 = performance.now();
    fps.start();
    // Simulate 60fps: 16.67ms intervals (offset from performance.now() base)
    for (let i = 0; i < 10; i++) {
      const cb = rafCallbacks[rafCallbacks.length - 1];
      if (cb) cb(t0 + i * 16.67);
    }

    const measuredFps = fps.fps;
    // Should be approximately 60fps
    expect(measuredFps).toBeGreaterThan(55);
    expect(measuredFps).toBeLessThan(65);
  });

  it('calculates minFps from worst frame', () => {
    const t0 = performance.now();
    fps.start();
    // Simulate frames with one slow frame
    const offsets = [0, 16, 32, 48, 100, 116, 132]; // 52ms gap at index 4
    for (const offset of offsets) {
      const cb = rafCallbacks[rafCallbacks.length - 1];
      if (cb) cb(t0 + offset);
    }

    const minFps = fps.minFps;
    // Worst frame: 52ms = ~19fps
    expect(minFps).toBeGreaterThan(15);
    expect(minFps).toBeLessThan(25);
  });

  it('does not double-start', () => {
    fps.start();
    fps.start(); // Should be no-op
    expect(fps.isRunning).toBe(true);
    // Only one requestAnimationFrame from the first start
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
  });

  it('handles stop when not running', () => {
    fps.stop(); // Should not throw
    expect(fps.isRunning).toBe(false);
  });
});
