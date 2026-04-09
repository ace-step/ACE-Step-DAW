/**
 * Type definitions for the real-time performance monitoring system.
 *
 * Tracks AudioContext health, CPU/DSP load estimation, main-thread FPS,
 * and audio dropout detection for the transport bar performance meter.
 */

/** Snapshot of current audio engine performance metrics. */
export interface PerformanceMetrics {
  /** Estimated CPU/DSP load as 0–100 percentage. */
  cpuLoad: number;
  /** AudioContext state: 'running' | 'suspended' | 'closed'. */
  audioContextState: AudioContextState;
  /** AudioContext base latency in milliseconds. */
  baseLatencyMs: number;
  /** AudioContext output latency in milliseconds. */
  outputLatencyMs: number;
  /** Sample rate in Hz (e.g. 44100, 48000). */
  sampleRate: number;
  /** Number of active audio nodes in the Tone.js graph. */
  activeNodeCount: number;
  /** Number of active audio effects across all tracks. */
  activeEffectCount: number;
  /** Main-thread frames per second (via rAF timing). */
  fps: number;
  /** Number of audio dropouts detected since monitoring started. */
  dropoutCount: number;
  /** Whether a dropout was detected in the current measurement window. */
  dropoutDetected: boolean;
  /** JS heap used in MB (Chrome only, -1 if unavailable). */
  heapUsedMb: number;
  /** JS heap limit in MB (Chrome only, -1 if unavailable). */
  heapLimitMb: number;
}

/** CPU load severity level for UI color coding. */
export type CpuLoadLevel = 'low' | 'medium' | 'high';

/** Thresholds for CPU load level classification. */
export const CPU_LOAD_THRESHOLDS = {
  medium: 50,
  high: 80,
} as const;

/** Configuration for the performance monitor. */
export interface PerformanceMonitorConfig {
  /** How often to update metrics in Hz (default: 4). */
  updateRateHz: number;
  /** FPS measurement window size in frames (default: 60). */
  fpsWindowSize: number;
  /** Dropout detection threshold — max allowed scheduling gap in ms (default: 50). */
  dropoutThresholdMs: number;
}

export const DEFAULT_MONITOR_CONFIG: PerformanceMonitorConfig = {
  updateRateHz: 4,
  fpsWindowSize: 60,
  dropoutThresholdMs: 50,
};
