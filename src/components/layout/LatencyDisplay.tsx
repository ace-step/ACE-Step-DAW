import { useProjectStore } from '../../store/projectStore';
import { normalizePlaybackLatencySettings } from '../../utils/playbackLatency';

/**
 * Displays the current audio context latency (baseLatency + outputLatency) in ms.
 * Shown in the transport bar area.
 */
export function LatencyDisplay() {
  const playbackLatency = useProjectStore((s) => s.project?.playbackLatency);
  const settings = normalizePlaybackLatencySettings(playbackLatency);

  const totalMs = settings.compensationMs;
  const displayText = totalMs > 0 ? `${totalMs.toFixed(1)} ms` : '-- ms';

  const colorClass =
    totalMs > 20
      ? 'text-amber-400'
      : totalMs > 0
        ? 'text-zinc-400'
        : 'text-zinc-600';

  return (
    <span
      className={`font-mono text-[10px] leading-none tabular-nums ${colorClass}`}
      title={`Audio latency: base ${settings.detectedBaseLatencyMs ?? '--'} ms + output ${settings.detectedOutputLatencyMs ?? '--'} ms`}
      data-testid="latency-display"
    >
      {displayText}
    </span>
  );
}
