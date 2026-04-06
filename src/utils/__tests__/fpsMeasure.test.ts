import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startFpsMeasure } from '../fpsMeasure';

describe('fpsMeasure', () => {
  let rafCallbacks: ((timestamp: number) => void)[];
  let originalRaf: typeof requestAnimationFrame;

  beforeEach(() => {
    rafCallbacks = [];
    originalRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    }) as unknown as typeof requestAnimationFrame;
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf;
  });

  it('returns a handle with stop method', () => {
    const handle = startFpsMeasure();
    expect(typeof handle.stop).toBe('function');
    handle.stop(); // cleanup
  });

  it('reports zero metrics when stopped immediately', () => {
    const handle = startFpsMeasure();
    const result = handle.stop();
    // No frames were ticked
    expect(result.frameCount).toBe(0);
    expect(result.durationMs).toBe(0);
    expect(result.fps).toBe(0);
  });

  it('counts frames correctly', () => {
    const handle = startFpsMeasure();
    // Simulate 5 frames at ~16.67ms intervals (60fps)
    for (let i = 0; i < 5; i++) {
      const cb = rafCallbacks.shift();
      cb?.(i * 16.67);
    }
    const result = handle.stop();
    expect(result.frameCount).toBe(5);
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it('calculates FPS from frame timing', () => {
    const handle = startFpsMeasure();
    // Simulate frames at 60fps (16.67ms apart)
    for (let i = 0; i < 61; i++) {
      const cb = rafCallbacks.shift();
      cb?.(i * 16.67);
    }
    const result = handle.stop();
    // Should be approximately 60 fps
    expect(result.fps).toBeGreaterThan(55);
    expect(result.fps).toBeLessThan(65);
  });

  it('tracks min and max frame times', () => {
    const handle = startFpsMeasure();

    // Frame 0 (start)
    rafCallbacks.shift()?.(0);
    // Frame 1: 10ms (fast)
    rafCallbacks.shift()?.(10);
    // Frame 2: 50ms later (slow)
    rafCallbacks.shift()?.(60);

    const result = handle.stop();
    expect(result.minFrameMs).toBe(10);
    expect(result.maxFrameMs).toBe(50);
  });

  it('stops counting after stop is called', () => {
    const handle = startFpsMeasure();
    rafCallbacks.shift()?.(0);
    rafCallbacks.shift()?.(16);
    const firstResult = handle.stop();
    const frameCountAfterStop = firstResult.frameCount;
    // Any queued callbacks shouldn't increment
    rafCallbacks.shift()?.(32);
    const secondResult = handle.stop();
    expect(secondResult.frameCount).toBe(frameCountAfterStop);
  });
});
