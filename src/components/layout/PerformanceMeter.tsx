import { useState, useCallback } from 'react';
import { usePerformanceStore } from '../../store/performanceStore';
import { classifyCpuLoad } from '../../services/performanceMonitor';
import type { PerformanceMetrics } from '../../types/performance';

const BAR_COLORS = {
  low: 'bg-emerald-500',
  medium: 'bg-amber-400',
  high: 'bg-red-500',
} as const;

const TEXT_COLORS = {
  low: 'text-emerald-400',
  medium: 'text-amber-400',
  high: 'text-red-400',
} as const;

function formatHz(sampleRate: number): string {
  if (sampleRate <= 0) return '--';
  return sampleRate >= 1000 ? `${(sampleRate / 1000).toFixed(1)}kHz` : `${sampleRate}Hz`;
}

function formatMs(ms: number): string {
  return ms > 0 ? `${ms.toFixed(1)}ms` : '--';
}

function formatMb(mb: number): string {
  return mb >= 0 ? `${mb.toFixed(0)}MB` : '--';
}

/** Single selector to avoid 12 independent subscriptions. */
const selectMetrics = (s: PerformanceMetrics) => s;

/**
 * Compact CPU/DSP performance meter for the transport bar.
 *
 * Shows a color-coded bar + percentage. Hover reveals a detailed tooltip
 * with node counts, latency, sample rate, FPS, and memory usage.
 */
export function PerformanceMeter() {
  const [showTooltip, setShowTooltip] = useState(false);

  const {
    cpuLoad,
    fps,
    dropoutCount,
    dropoutDetected,
    audioContextState,
    baseLatencyMs,
    outputLatencyMs,
    sampleRate,
    activeNodeCount,
    activeEffectCount,
    heapUsedMb,
    heapLimitMb,
  } = usePerformanceStore(selectMetrics);

  const level = classifyCpuLoad(cpuLoad);
  const barColor = BAR_COLORS[level];
  const textColor = TEXT_COLORS[level];

  const onMouseEnter = useCallback(() => setShowTooltip(true), []);
  const onMouseLeave = useCallback(() => setShowTooltip(false), []);

  return (
    <div
      className="relative flex items-center gap-1 px-1.5"
      data-testid="performance-meter"
      aria-label={`CPU load ${cpuLoad}%`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* CPU label */}
      <span className="text-[9px] font-medium uppercase tracking-wider text-zinc-500">
        CPU
      </span>

      {/* Meter bar */}
      <div className="relative h-2.5 w-10 overflow-hidden rounded-sm bg-zinc-800">
        <div
          className={`absolute inset-y-0 left-0 transition-all duration-200 ${barColor}`}
          style={{ width: `${Math.min(100, cpuLoad)}%` }}
          data-testid="cpu-bar"
        />
      </div>

      {/* Percentage */}
      <span
        className={`font-mono text-[10px] tabular-nums leading-none ${textColor}`}
      >
        {cpuLoad}%
      </span>

      {/* Dropout flash indicator */}
      {dropoutDetected && (
        <span
          className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse"
          data-testid="dropout-indicator"
          title="Audio dropout detected"
        />
      )}

      {/* Tooltip */}
      {showTooltip && (
        <div
          className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-900 p-2.5 shadow-xl"
          data-testid="performance-tooltip"
        >
          <table className="text-[10px] leading-relaxed text-zinc-300">
            <tbody>
              <TooltipRow label="CPU Load" value={`${cpuLoad}%`} highlight={level !== 'low'} />
              <TooltipRow label="FPS" value={`${Math.round(fps)}`} />
              <TooltipRow label="Audio State" value={audioContextState} />
              <TooltipRow label="Sample Rate" value={formatHz(sampleRate)} />
              <TooltipRow label="Base Latency" value={formatMs(baseLatencyMs)} />
              <TooltipRow label="Output Latency" value={formatMs(outputLatencyMs)} />
              <TooltipRow label="Active Nodes" value={String(activeNodeCount)} />
              <TooltipRow label="Effects" value={String(activeEffectCount)} />
              <TooltipRow label="Dropouts" value={String(dropoutCount)} highlight={dropoutCount > 0} />
              {heapUsedMb >= 0 && (
                <TooltipRow
                  label="Memory"
                  value={`${formatMb(heapUsedMb)} / ${formatMb(heapLimitMb)}`}
                />
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TooltipRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <tr>
      <td className="pr-3 text-zinc-500 whitespace-nowrap">{label}</td>
      <td className={`font-mono tabular-nums whitespace-nowrap ${highlight ? 'text-amber-400' : 'text-zinc-200'}`}>
        {value}
      </td>
    </tr>
  );
}
