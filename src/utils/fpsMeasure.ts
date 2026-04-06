/**
 * FPS measurement utility for development performance profiling.
 * Uses requestAnimationFrame to measure actual frame rate.
 *
 * Only active in development mode — returns noops in production.
 */

export interface FpsMeasureResult {
  fps: number;
  frameCount: number;
  durationMs: number;
  minFrameMs: number;
  maxFrameMs: number;
}

export interface FpsMeasureHandle {
  stop: () => FpsMeasureResult;
}

/**
 * Start measuring FPS using RAF timestamps.
 * Returns a handle with a `stop()` method that returns the measurement.
 *
 * In production builds, returns a noop handle that reports 0 for all metrics.
 */
export function startFpsMeasure(): FpsMeasureHandle {
  if (import.meta.env.PROD) {
    return {
      stop: () => ({ fps: 0, frameCount: 0, durationMs: 0, minFrameMs: 0, maxFrameMs: 0 }),
    };
  }

  let running = true;
  let frameCount = 0;
  let startTime = 0;
  let lastFrameTime = 0;
  let minFrameMs = Infinity;
  let maxFrameMs = 0;

  const tick = (timestamp: number) => {
    if (!running) return;

    if (frameCount === 0) {
      startTime = timestamp;
      lastFrameTime = timestamp;
    } else {
      const delta = timestamp - lastFrameTime;
      if (delta < minFrameMs) minFrameMs = delta;
      if (delta > maxFrameMs) maxFrameMs = delta;
      lastFrameTime = timestamp;
    }

    frameCount++;
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);

  return {
    stop(): FpsMeasureResult {
      running = false;
      const durationMs = lastFrameTime - startTime;
      const fps = durationMs > 0 ? (frameCount / durationMs) * 1000 : 0;
      return {
        fps: Math.round(fps * 10) / 10,
        frameCount,
        durationMs: Math.round(durationMs),
        minFrameMs: minFrameMs === Infinity ? 0 : Math.round(minFrameMs * 100) / 100,
        maxFrameMs: Math.round(maxFrameMs * 100) / 100,
      };
    },
  };
}
