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
          className="absolute top-0 left-0 w-px z-20 pointer-events-none playhead-glow"
          style={{
            transform: `translateX(${transportX}px)`,
            willChange: 'transform',
            height: '100%',
            backgroundColor: '#ffffff',
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
  const laneRect = useUIStore((s) => s.trackLaneRects.get(trackId));
  if (!laneRect) return null;

  return (
    <div
      className="absolute w-px z-20 pointer-events-none playhead-glow"
      style={{
        left: x,
        top: laneRect.top,
        height: laneRect.height,
        animation: blink ? 'playhead-blink-line 1.2s ease-in-out infinite' : undefined,
        backgroundColor: blink ? undefined : '#ffffff',
      }}
    />
  );
}
