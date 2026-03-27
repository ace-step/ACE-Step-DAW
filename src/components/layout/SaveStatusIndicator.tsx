import type { SaveStatus } from '../../hooks/useAutoSave';

interface SaveStatusIndicatorProps {
  status: SaveStatus;
}

/**
 * Minimal save-status indicator for the status bar.
 * Shows a dot + label: green "Saved", amber pulsing "Saving...", red "Unsaved".
 */
export function SaveStatusIndicator({ status }: SaveStatusIndicatorProps) {
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

  return (
    <span
      className="inline-flex items-center gap-1 text-daw-text-muted"
      data-testid="save-status-indicator"
      title={
        status === 'saved'
          ? 'All changes saved'
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
    </span>
  );
}
