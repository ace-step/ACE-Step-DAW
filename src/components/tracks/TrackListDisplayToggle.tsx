import { useUIStore } from '../../store/uiStore';

export function TrackListDisplayToggle() {
  const trackListDisplayMode = useUIStore((s) => s.trackListDisplayMode);
  const toggleTrackListDisplayMode = useUIStore((s) => s.toggleTrackListDisplayMode);
  const isCollapsed = trackListDisplayMode === 'collapsed';

  return (
    <button
      type="button"
      data-testid="track-list-display-toggle"
      aria-label={isCollapsed ? 'Expand track list' : 'Collapse track list'}
      aria-keyshortcuts="W"
      aria-controls="arrangement-track-list"
      aria-expanded={!isCollapsed}
      title={isCollapsed ? 'Expand track list (W)' : 'Collapse track list (W)'}
      onClick={toggleTrackListDisplayMode}
      className={`flex items-center justify-center rounded-md border transition-colors ${
        isCollapsed
          ? 'h-7 w-7 border-daw-accent/50 bg-daw-accent/12 text-daw-accent hover:bg-daw-accent/18'
          : 'h-7 w-7 border-white/10 bg-white/5 text-zinc-300 hover:border-white/20 hover:bg-white/10 hover:text-zinc-100'
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="1.5" y="2" width="11" height="10" rx="1.75" />
        <path d="M5 2.25v9.5" opacity="0.75" />
        {isCollapsed ? (
          <path d="M8 7h2.5M9.4 5.6L10.8 7l-1.4 1.4" />
        ) : (
          <path d="M10.5 7H8M9.1 5.6L7.7 7l1.4 1.4" />
        )}
      </svg>
    </button>
  );
}
