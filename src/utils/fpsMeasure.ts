/**
 * FPS measurement utility for timeline performance benchmarking.
 * Uses a circular buffer for O(1) frame tracking with no allocations.
 *
 * Only active in development mode (import.meta.env.DEV).
 */

const BUFFER_SIZE = 120; // 2 seconds at 60fps

export class FpsMeasure {
  private frameTimes: Float64Array;
  private writeIdx = 0;
  private frameCount = 0;
  private rafId = 0;
  private running = false;

  constructor() {
    this.frameTimes = new Float64Array(BUFFER_SIZE);
  }

  /** Start measuring frames. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.writeIdx = 0;
    this.frameCount = 0;
    this.tick(performance.now());
  }

  /** Stop measuring. */
  stop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  /** Get the current average FPS over the buffer window. */
  get fps(): number {
    const count = Math.min(this.frameCount, BUFFER_SIZE);
    if (count < 2) return 0;

    // Calculate average frame interval from circular buffer
    let totalInterval = 0;
    let intervals = 0;

    for (let i = 1; i < count; i++) {
      const curr = (this.writeIdx - count + i + BUFFER_SIZE) % BUFFER_SIZE;
      const prev = (curr - 1 + BUFFER_SIZE) % BUFFER_SIZE;
      const interval = this.frameTimes[curr] - this.frameTimes[prev];
      if (interval > 0 && interval < 1000) {
        totalInterval += interval;
        intervals++;
      }
    }

    if (intervals === 0 || totalInterval === 0) return 0;
    return 1000 / (totalInterval / intervals);
  }

  /** Get the minimum FPS (worst frame) in the buffer. */
  get minFps(): number {
    const count = Math.min(this.frameCount, BUFFER_SIZE);
    if (count < 2) return 0;

    let maxInterval = 0;

    for (let i = 1; i < count; i++) {
      const curr = (this.writeIdx - count + i + BUFFER_SIZE) % BUFFER_SIZE;
      const prev = (curr - 1 + BUFFER_SIZE) % BUFFER_SIZE;
      const interval = this.frameTimes[curr] - this.frameTimes[prev];
      if (interval > maxInterval && interval < 1000) {
        maxInterval = interval;
      }
    }

    return maxInterval > 0 ? 1000 / maxInterval : 0;
  }

  /** Whether measurement is active. */
  get isRunning(): boolean {
    return this.running;
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    this.frameTimes[this.writeIdx % BUFFER_SIZE] = now;
    this.writeIdx = (this.writeIdx + 1) % BUFFER_SIZE;
    this.frameCount++;
    this.rafId = requestAnimationFrame(this.tick);
  };
}

/** Singleton instance, only active in dev mode. */
let instance: FpsMeasure | null = null;

export function getFpsMeasure(): FpsMeasure | null {
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    if (!instance) {
      instance = new FpsMeasure();
    }
    return instance;
  }
  return null;
}
