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

export class FpsMeasure {
  private frameTimes: number[] = [];
  private lastTimestamp: number | null = null;
  private rafId: number | null = null;
  private running = false;

  start(): void {
    if (this.running) this.stop();
    this.frameTimes = [];
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
      this.frameTimes.push(now - this.lastTimestamp);
    }
    this.lastTimestamp = now;

    this.rafId = requestAnimationFrame(this.tick);
  };

  getReport(): FpsReport {
    if (this.frameTimes.length === 0) {
      return {
        averageFps: 0,
        minFps: 0,
        maxFps: 0,
        frameCount: 0,
        durationMs: 0,
        percentAt60fps: 0,
      };
    }

    const totalDuration = this.frameTimes.reduce((sum, t) => sum + t, 0);
    const avgFrameTime = totalDuration / this.frameTimes.length;
    const maxFrameTime = Math.max(...this.frameTimes);
    const minFrameTime = Math.min(...this.frameTimes);
    const framesAt60 = this.frameTimes.filter((t) => t <= 16.67).length;

    // Guard against Infinity from zero/negative frame times (timer resolution edge cases)
    const toFps = (frameTime: number): number =>
      Number.isFinite(frameTime) && frameTime > 0 ? Math.round(1000 / frameTime) : 0;

    return {
      averageFps: toFps(avgFrameTime),
      minFps: toFps(maxFrameTime),
      maxFps: toFps(minFrameTime),
      frameCount: this.frameTimes.length,
      durationMs: Math.round(totalDuration),
      percentAt60fps: Math.round((framesAt60 / this.frameTimes.length) * 100),
    };
  }
}

/** Expose on window for manual browser testing via console */
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__fpsMeasure = FpsMeasure;
}
