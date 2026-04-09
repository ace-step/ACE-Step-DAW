/**
 * Real-time performance monitoring service for the DAW audio engine.
 *
 * Tracks AudioContext health, estimates CPU/DSP load from active node counts,
 * measures main-thread FPS via rAF timing, and detects audio dropouts.
 * Designed to be lightweight — updates at 4Hz to minimize overhead.
 */
import type {
  PerformanceMetrics,
  PerformanceMonitorConfig,
  CpuLoadLevel,
} from '../types/performance';
import { CPU_LOAD_THRESHOLDS, DEFAULT_MONITOR_CONFIG } from '../types/performance';

// ─── Pure functions ───────────────────────────────────────────────────────

/** Weight per active audio node for CPU estimation. */
const NODE_WEIGHT = 1.5;
/** Weight per active effect for CPU estimation. */
const EFFECT_WEIGHT = 3.0;
/** Maximum estimated load (clamp ceiling). */
const MAX_LOAD = 100;

/**
 * Estimate CPU/DSP load from active node and effect counts.
 * Uses weighted linear model clamped to 0–100.
 */
export function estimateCpuLoad(activeNodes: number, activeEffects: number): number {
  const raw = activeNodes * NODE_WEIGHT + activeEffects * EFFECT_WEIGHT;
  return Math.min(MAX_LOAD, Math.max(0, Math.round(raw)));
}

/** Classify CPU load into severity level for UI color coding. */
export function classifyCpuLoad(load: number): CpuLoadLevel {
  if (load >= CPU_LOAD_THRESHOLDS.high) return 'high';
  if (load >= CPU_LOAD_THRESHOLDS.medium) return 'medium';
  return 'low';
}

/**
 * Calculate FPS from an array of frame-to-frame time deltas (in ms).
 * Returns 0 for empty input.
 */
export function measureFps(deltas: number[]): number {
  if (deltas.length === 0) return 0;
  const avgDelta = deltas.reduce((sum, d) => sum + d, 0) / deltas.length;
  if (avgDelta <= 0) return 0;
  return 1000 / avgDelta;
}

/**
 * Detect whether a frame delta indicates an audio dropout.
 * A dropout is flagged when the delta strictly exceeds the threshold.
 */
export function detectDropout(deltaMs: number, thresholdMs: number): boolean {
  return deltaMs > thresholdMs;
}

/** Read JS heap usage from Chrome-only performance.memory API. */
export function getMemoryUsage(): { heapUsedMb: number; heapLimitMb: number } {
  const perf = globalThis.performance as any;
  if (perf?.memory) {
    return {
      heapUsedMb: Math.round((perf.memory.usedJSHeapSize / (1024 * 1024)) * 10) / 10,
      heapLimitMb: Math.round((perf.memory.jsHeapSizeLimit / (1024 * 1024)) * 10) / 10,
    };
  }
  return { heapUsedMb: -1, heapLimitMb: -1 };
}

/** Minimal track shape for node counting. */
interface TrackLike {
  effects: Array<{ enabled: boolean }>;
}

/**
 * Count active audio nodes from track list.
 * Each track contributes 1 base node (gain/channel strip) plus 1 per enabled effect.
 */
export function countActiveNodes(tracks: TrackLike[]): number {
  let count = 0;
  for (const track of tracks) {
    count += 1; // base gain node per track
    for (const fx of track.effects) {
      if (fx.enabled) count += 1;
    }
  }
  return count;
}

/** AudioContext health snapshot. */
interface AudioContextHealth {
  state: AudioContextState;
  baseLatencyMs: number;
  outputLatencyMs: number;
  sampleRate: number;
}

/** Extract health info from an AudioContext (or null). */
export function getAudioContextHealth(ctx: AudioContext | null): AudioContextHealth {
  if (!ctx) {
    return { state: 'closed', baseLatencyMs: 0, outputLatencyMs: 0, sampleRate: 0 };
  }
  return {
    state: ctx.state,
    baseLatencyMs: (ctx.baseLatency ?? 0) * 1000,
    outputLatencyMs: ((ctx as any).outputLatency ?? 0) * 1000,
    sampleRate: ctx.sampleRate,
  };
}

// ─── Monitor instance ─────────────────────────────────────────────────────

/**
 * Create a performance monitor instance that accumulates frame timings
 * and provides periodic metric snapshots.
 */
export function createPerformanceMonitor(config: PerformanceMonitorConfig = DEFAULT_MONITOR_CONFIG) {
  const frameDeltas: number[] = [];
  let lastTimestamp = -1;
  let dropoutCount = 0;
  let dropoutDetected = false;
  let activeNodeCount = 0;
  let activeEffectCount = 0;
  let audioHealth: AudioContextHealth = {
    state: 'closed',
    baseLatencyMs: 0,
    outputLatencyMs: 0,
    sampleRate: 0,
  };

  function tick(timestamp: number) {
    if (lastTimestamp >= 0) {
      const delta = timestamp - lastTimestamp;
      frameDeltas.push(delta);
      // Keep window bounded
      while (frameDeltas.length > config.fpsWindowSize) {
        frameDeltas.shift();
      }
      // Check for dropout
      if (detectDropout(delta, config.dropoutThresholdMs)) {
        dropoutCount++;
        dropoutDetected = true;
      }
    }
    lastTimestamp = timestamp;
  }

  function getMetrics(): PerformanceMetrics {
    const mem = getMemoryUsage();
    return {
      cpuLoad: estimateCpuLoad(activeNodeCount, activeEffectCount),
      audioContextState: audioHealth.state,
      baseLatencyMs: audioHealth.baseLatencyMs,
      outputLatencyMs: audioHealth.outputLatencyMs,
      sampleRate: audioHealth.sampleRate,
      activeNodeCount,
      activeEffectCount,
      fps: measureFps(frameDeltas),
      dropoutCount,
      dropoutDetected,
      heapUsedMb: mem.heapUsedMb,
      heapLimitMb: mem.heapLimitMb,
    };
  }

  function setAudioStats(nodes: number, effects: number) {
    activeNodeCount = nodes;
    activeEffectCount = effects;
  }

  function setAudioContextHealth(health: AudioContextHealth) {
    audioHealth = { ...health };
  }

  function acknowledgeDropout() {
    dropoutDetected = false;
  }

  function reset() {
    frameDeltas.length = 0;
    lastTimestamp = -1;
    dropoutCount = 0;
    dropoutDetected = false;
    activeNodeCount = 0;
    activeEffectCount = 0;
  }

  function stop() {
    reset();
  }

  return {
    tick,
    getMetrics,
    setAudioStats,
    setAudioContextHealth,
    acknowledgeDropout,
    reset,
    stop,
  };
}
