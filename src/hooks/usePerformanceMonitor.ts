/**
 * React hook that runs the performance monitoring loop.
 *
 * Uses requestAnimationFrame to measure main-thread FPS and detect dropouts.
 * Pushes metric snapshots to the performanceStore at a configurable rate (default 4Hz).
 * Also reads AudioContext health and track counts from the project store.
 *
 * Config is read at mount time only — changes after mount are ignored.
 */
import { useEffect, useRef } from 'react';
import { createPerformanceMonitor, countActiveNodes, getAudioContextHealth } from '../services/performanceMonitor';
import { usePerformanceStore } from '../store/performanceStore';
import { useProjectStore } from '../store/projectStore';
import type { PerformanceMonitorConfig } from '../types/performance';
import { DEFAULT_MONITOR_CONFIG } from '../types/performance';
import type { Track } from '../types/project';

export function usePerformanceMonitor(configOverrides?: Partial<PerformanceMonitorConfig>) {
  // Capture config at mount time via ref to avoid re-creating monitor on re-render
  const configRef = useRef({ ...DEFAULT_MONITOR_CONFIG, ...configOverrides });
  const monitorRef = useRef(createPerformanceMonitor(configRef.current));
  const rafRef = useRef(0);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    const monitor = monitorRef.current;
    const config = configRef.current;
    const updateIntervalMs = 1000 / config.updateRateHz;

    function loop(timestamp: number) {
      monitor.tick(timestamp);

      // Update store at configured rate
      if (timestamp - lastUpdateRef.current >= updateIntervalMs) {
        lastUpdateRef.current = timestamp;

        // Read audio stats from project store
        const project = useProjectStore.getState().project;
        if (project) {
          const tracks: Track[] = project.tracks ?? [];
          const nodeCount = countActiveNodes(tracks);
          const effectCount = tracks.reduce((sum, t) => {
            const effects = t.effects ?? [];
            return sum + effects.filter((fx) => fx.enabled).length;
          }, 0);
          monitor.setAudioStats(nodeCount, effectCount);
        }

        // Read AudioContext health (Tone.js context)
        try {
          const Tone = (globalThis as Record<string, unknown>).Tone as
            | { getContext?: () => { rawContext?: AudioContext } }
            | undefined;
          const rawCtx = Tone?.getContext?.()?.rawContext;
          if (rawCtx) {
            monitor.setAudioContextHealth(getAudioContextHealth(rawCtx));
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
  }, []); // Mount-only: config is captured via ref

  return monitorRef.current;
}
