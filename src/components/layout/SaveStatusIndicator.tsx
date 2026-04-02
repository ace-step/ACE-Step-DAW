import { useState, useEffect } from 'react';
import type { SaveStatus } from '../../hooks/useAutoSave';

interface SaveStatusIndicatorProps {
  status: SaveStatus;
  lastSavedAt?: number | null;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

/**
 * Minimal save-status indicator for the status bar.
 * Shows a dot + label: green "Saved", amber pulsing "Saving...", red "Unsaved".
 * Optionally shows relative time since last save.
 */
export function SaveStatusIndicator({ status, lastSavedAt }: SaveStatusIndicatorProps) {
  const [, setTick] = useState(0);

  // Re-render every 30s to update relative time
  useEffect(() => {
    if (!lastSavedAt) return;
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, [lastSavedAt]);

  const dotColor =
    status === 'saved'
      ? 'bg-emerald-500'
      : status === 'saving'
        ? 'bg-amber-400 animate-pulse'
        : 'bg-red-400';

  const label =
    status === 'saved'
      ? 'Saved'
      : status === 'saving'
        ? 'Saving...'
        : 'Unsaved';

  const timeLabel = status === 'saved' && lastSavedAt
    ? formatRelativeTime(lastSavedAt)
    : null;

  return (
    <span
      className="inline-flex items-center gap-1 text-daw-text-muted"
      data-testid="save-status-indicator"
      title={
        status === 'saved'
          ? `All changes saved${timeLabel ? ` (${timeLabel})` : ''}`
          : status === 'saving'
            ? 'Saving changes...'
            : 'Unsaved changes (Ctrl+S to save now)'
      }
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`}
        aria-hidden="true"
      />
      <span>{label}</span>
      {timeLabel && (
        <span className="text-daw-text-muted/60" data-testid="save-time-label">{timeLabel}</span>
      )}
    </span>
  );
}
