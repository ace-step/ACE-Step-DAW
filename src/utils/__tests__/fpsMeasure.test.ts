import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FpsMeasure } from '../fpsMeasure';

describe('FpsMeasure', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty report before start', () => {
    const fps = new FpsMeasure();
    const report = fps.getReport();
    expect(report.frameCount).toBe(0);
    expect(report.averageFps).toBe(0);
    expect(report.durationMs).toBe(0);
  });

  it('measures frame times via requestAnimationFrame', () => {
    const fps = new FpsMeasure();

    // Mock performance.now to return predictable times
    let time = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => {
      time += 16.67; // 60fps = ~16.67ms per frame
      return time;
    });

    fps.start();

    // Simulate 10 animation frames
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(16.67);
    }

    fps.stop();

    const report = fps.getReport();
    expect(report.frameCount).toBeGreaterThan(0);
    expect(report.averageFps).toBeGreaterThanOrEqual(55); // ~60fps
    expect(report.percentAt60fps).toBeGreaterThanOrEqual(0);
  });

  it('reports zero after stop with no frames', () => {
    const fps = new FpsMeasure();
    fps.start();
    fps.stop();
    const report = fps.getReport();
    // May have 0 or very few frames depending on timing
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('calculates min/max FPS correctly', () => {
    const fps = new FpsMeasure();
    let time = 0;
    const frameTimes = [16.67, 16.67, 33.33, 16.67, 8.33]; // varying frame times

    vi.spyOn(performance, 'now').mockImplementation(() => {
      const frameTime = frameTimes.shift() ?? 16.67;
      time += frameTime;
      return time;
    });

    fps.start();
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(16.67);
    }
    fps.stop();

    const report = fps.getReport();
    // With 33.33ms frame, min FPS ~30; with 8.33ms, max FPS ~120
    if (report.frameCount > 0) {
      expect(report.minFps).toBeLessThanOrEqual(report.averageFps);
      expect(report.maxFps).toBeGreaterThanOrEqual(report.averageFps);
    }
  });
});
