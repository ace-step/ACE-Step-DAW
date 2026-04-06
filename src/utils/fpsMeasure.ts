/**
 * FPS measurement utility for timeline performance benchmarking.
 *
 * Provides a requestAnimationFrame-based FPS counter that can be used
 * to verify the timeline maintains 60fps during scroll/zoom with 20+ tracks.
 *
 * Usage:
 *   const fps = new FpsMeasure();
 *   fps.start();
 *   // ... perform actions ...
 *   fps.stop();
 *   console.log(fps.getReport());
 */

export interface FpsReport {
  /** Average FPS over the measurement period */
  averageFps: number;
  /** Minimum FPS observed */
  minFps: number;
  /** Maximum FPS observed */
  maxFps: number;
  /** Total number of frames measured */
  frameCount: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Percentage of frames that hit 60fps (frame time <= 16.67ms) */
  percentAt60fps: number;
}

/** Maximum number of frame samples to retain. ~5 min at 60fps. */
const MAX_SAMPLES = 18000;

export class FpsMeasure {
  /** Fixed-size circular buffer for O(1) per-frame writes. */
  private buffer = new Float64Array(MAX_SAMPLES);
  private writeIndex = 0;
  private count = 0;
  private lastTimestamp: number | null = null;
  private rafId: number | null = null;
  private running = false;

  start(): void {
    if (this.running) this.stop();
    this.writeIndex = 0;
    this.count = 0;
    this.lastTimestamp = null;
    this.running = true;
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private tick = (): void => {
    if (!this.running) return;

    const now = performance.now();
    if (this.lastTimestamp !== null) {
      this.buffer[this.writeIndex] = now - this.lastTimestamp;
      this.writeIndex = (this.writeIndex + 1) % MAX_SAMPLES;
      if (this.count < MAX_SAMPLES) this.count++;
    }
    this.lastTimestamp = now;

    this.rafId = requestAnimationFrame(this.tick);
  };

  /** Get the stored frame times as a plain array (for report computation). */
  private getSamples(): number[] {
    if (this.count < MAX_SAMPLES) {
      return Array.from(this.buffer.subarray(0, this.count));
    }
    // Circular: oldest starts at writeIndex
    const tail = Array.from(this.buffer.subarray(this.writeIndex));
    const head = Array.from(this.buffer.subarray(0, this.writeIndex));
    return tail.concat(head);
  }

  getReport(): FpsReport {
    if (this.count === 0) {
      return {
        averageFps: 0,
        minFps: 0,
        maxFps: 0,
        frameCount: 0,
        durationMs: 0,
        percentAt60fps: 0,
      };
    }

    const samples = this.getSamples();
    let totalDuration = 0;
    let maxFrameTime = 0;
    let minFrameTime = Infinity;
    let framesAt60 = 0;

    for (const t of samples) {
      totalDuration += t;
      if (t > maxFrameTime) maxFrameTime = t;
      if (t < minFrameTime) minFrameTime = t;
      if (t <= 16.67) framesAt60++;
    }

    const avgFrameTime = totalDuration / samples.length;

    // Guard against Infinity from zero/negative frame times (timer resolution edge cases)
    const toFps = (frameTime: number): number =>
      Number.isFinite(frameTime) && frameTime > 0 ? Math.round(1000 / frameTime) : 0;

    return {
      averageFps: toFps(avgFrameTime),
      minFps: toFps(maxFrameTime),
      maxFps: toFps(minFrameTime),
      frameCount: samples.length,
      durationMs: Math.round(totalDuration),
      percentAt60fps: Math.round((framesAt60 / samples.length) * 100),
    };
  }
}

/** Expose FpsMeasure on window for manual browser console testing. Call from main.tsx or dev entry. */
export function exposeFpsMeasureOnWindow(): void {
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__fpsMeasure = FpsMeasure;
  }
}
