/**
 * React hook that runs the performance monitoring loop.
 *
 * Uses requestAnimationFrame to measure main-thread FPS and detect dropouts.
 * Pushes metric snapshots to the performanceStore at a configurable rate (default 4Hz).
 * Also reads AudioContext health and track counts from the project store.
 */
import { useEffect, useRef } from 'react';
import { createPerformanceMonitor, countActiveNodes, getAudioContextHealth } from '../services/performanceMonitor';
import { usePerformanceStore } from '../store/performanceStore';
import { useProjectStore } from '../store/projectStore';
import type { PerformanceMonitorConfig } from '../types/performance';
import { DEFAULT_MONITOR_CONFIG } from '../types/performance';

export function usePerformanceMonitor(configOverrides?: Partial<PerformanceMonitorConfig>) {
  const config = { ...DEFAULT_MONITOR_CONFIG, ...configOverrides };
  const monitorRef = useRef(createPerformanceMonitor(config));
  const rafRef = useRef(0);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    const monitor = monitorRef.current;
    const updateIntervalMs = 1000 / config.updateRateHz;

    function loop(timestamp: number) {
      monitor.tick(timestamp);

      // Update store at configured rate
      if (timestamp - lastUpdateRef.current >= updateIntervalMs) {
        lastUpdateRef.current = timestamp;

        // Read audio stats from project store
        const project = useProjectStore.getState().project;
        if (project) {
          const tracks = project.tracks ?? [];
          const nodeCount = countActiveNodes(tracks as any);
          const effectCount = tracks.reduce((sum, t) => {
            const effects = (t as any).effects ?? [];
            return sum + effects.filter((fx: any) => fx.enabled).length;
          }, 0);
          monitor.setAudioStats(nodeCount, effectCount);
        }

        // Read AudioContext health (Tone.js context)
        try {
          const toneCtx = (globalThis as any).Tone?.getContext?.()?.rawContext as AudioContext | undefined;
          if (toneCtx) {
            monitor.setAudioContextHealth(getAudioContextHealth(toneCtx));
          }
        } catch {
          // Tone.js may not be initialized yet
        }

        // Push to store
        usePerformanceStore.getState().updateMetrics(monitor.getMetrics());
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      monitor.stop();
    };
  }, [config.updateRateHz, config.fpsWindowSize, config.dropoutThresholdMs]);

  return monitorRef.current;
}
