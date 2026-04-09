import type { AudioHealthSnapshot, AudioHealthStatus } from '../../types/audioHealth';

const STATUS_COLORS: Record<AudioHealthStatus, string> = {
  good: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
  inactive: 'bg-zinc-500',
};

const STATUS_LABELS: Record<AudioHealthStatus, string> = {
  good: 'healthy',
  warning: 'warning',
  error: 'error',
  inactive: 'inactive',
};

interface AudioHealthIndicatorProps {
  snapshot: AudioHealthSnapshot | null;
  status: AudioHealthStatus;
  onClick: () => void;
}

export function AudioHealthIndicator({ snapshot, status, onClick }: AudioHealthIndicatorProps) {
  const sampleRateLabel = snapshot
    ? `${Math.round(snapshot.sampleRate / 1000)}kHz`
    : '—';

  const latencyLabel = snapshot?.totalLatencyMs != null
    ? `${snapshot.totalLatencyMs.toFixed(1)}ms`
    : '—';

  return (
    <button
      type="button"
      data-testid="audio-health-indicator"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md border border-white/6 bg-transparent px-1.5 py-0.5 text-[10px] text-daw-text-muted transition-colors hover:border-white/12 hover:bg-daw-hover-subtle"
      aria-label={`Audio engine ${STATUS_LABELS[status]}`}
      title="Audio engine health — click for details"
    >
      <span
        data-testid="audio-health-dot"
        className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLORS[status]}`}
      />
      <span className="tabular-nums">{sampleRateLabel}</span>
      <span className="text-daw-text-muted/50">|</span>
      <span className="tabular-nums" data-testid="audio-health-latency">{latencyLabel}</span>
    </button>
  );
}
