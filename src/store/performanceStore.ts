/**
 * Zustand store for real-time performance metrics.
 *
 * Holds the latest performance snapshot (CPU load, FPS, dropout count, etc.)
 * updated at 4Hz by the performance monitor hook. No persistence needed —
 * metrics are ephemeral and reset on page reload.
 */
import { create } from 'zustand';
import type { PerformanceMetrics } from '../types/performance';

interface PerformanceStoreState extends PerformanceMetrics {
  /** Replace all metrics with a fresh snapshot. */
  updateMetrics: (metrics: PerformanceMetrics) => void;
  /** Clear the dropout flag without resetting the counter. */
  acknowledgeDropout: () => void;
  /** Reset all metrics to defaults. */
  reset: () => void;
}

const INITIAL_STATE: PerformanceMetrics = {
  cpuLoad: 0,
  audioContextState: 'suspended',
  baseLatencyMs: 0,
  outputLatencyMs: 0,
  sampleRate: 0,
  activeNodeCount: 0,
  activeEffectCount: 0,
  fps: 0,
  dropoutCount: 0,
  dropoutDetected: false,
  heapUsedMb: -1,
  heapLimitMb: -1,
};

export const usePerformanceStore = create<PerformanceStoreState>((set) => ({
  ...INITIAL_STATE,

  updateMetrics: (metrics) => set(metrics),

  acknowledgeDropout: () => set({ dropoutDetected: false }),

  reset: () => set(INITIAL_STATE),
}));
