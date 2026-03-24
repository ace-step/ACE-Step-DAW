import { useTransportStore } from '../../store/transportStore';
import { useUIStore } from '../../store/uiStore';

/**
 * Playhead vertical line.
 * - Anchor (triangle + blinking cursor) always at playStartTime — only moves on user click.
 * - Transport line at currentTime — moves during playback, stays at stop position when paused.
 *   Hidden when currentTime === playStartTime (overlaps with anchor cursor).
 */
export function Playhead() {
  const currentTime = useTransportStore((s) => s.currentTime);
  const playStartTime = useTransportStore((s) => s.playStartTime);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const timelineFocused = useUIStore((s) => s.timelineFocused);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const selectedTrackIds = useUIStore((s) => s.selectedTrackIds);

  const transportX = currentTime * pixelsPerSecond;
  const anchorX = playStartTime * pixelsPerSecond;

  // Show transport line when it's at a different position than the anchor
  const showTransportLine = Math.abs(currentTime - playStartTime) > 0.001;

  // Anchor cursor on selected track rows — always at playStartTime
  const showAnchorCursor = selectedTrackIds.size > 0 && (isPlaying || timelineFocused);
  const anchorCursors = showAnchorCursor
    ? Array.from(selectedTrackIds).map((trackId) => (
        <SelectedTrackCursor key={trackId} trackId={trackId} x={anchorX} blink />
      ))
    : null;

  return (
    <>
      {/* Transport line — full-height, visible during playback and at stop position */}
      {showTransportLine && (
        <div
          className="absolute top-0 left-0 w-px z-20 pointer-events-none"
          style={{
            transform: `translateX(${transportX}px)`,
            willChange: 'transform',
            minHeight: '100vh',
            backgroundColor: '#ffffff',
            boxShadow: '0 0 3px rgba(0, 0, 0, 0.35), 0 0 8px rgba(0, 0, 0, 0.15)',
          }}
        />
      )}
      {/* Anchor cursors on selected track rows */}
      {anchorCursors}
    </>
  );
}

/** Cursor line positioned over a single selected track row */
function SelectedTrackCursor({ trackId, x, blink }: { trackId: string; x: number; blink?: boolean }) {
  // Find the track lane element in the timeline (not the left panel header)
  const laneEl = document.querySelector(`[data-timeline-lane][data-track-id="${trackId}"]`) as HTMLElement | null;
  if (!laneEl) return null;

  // laneEl.offsetTop is relative to its offsetParent (trackAreaRef).
  // We need the total offset relative to the positioned ancestor that
  // the Playhead is also positioned against (the outer `relative` div).
  const parentEl = laneEl.offsetParent as HTMLElement | null;
  const parentOffset = parentEl ? parentEl.offsetTop : 0;

  return (
    <div
      className="absolute w-px z-20 pointer-events-none"
      style={{
        left: x,
        top: laneEl.offsetTop + parentOffset,
        height: laneEl.offsetHeight,
        animation: blink ? 'playhead-blink-line 1.2s ease-in-out infinite' : undefined,
        backgroundColor: blink ? undefined : '#ffffff',
        boxShadow: '0 0 3px rgba(0, 0, 0, 0.35), 0 0 8px rgba(0, 0, 0, 0.15)',
      }}
    />
  );
}
