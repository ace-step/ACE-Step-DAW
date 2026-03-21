/**
 * Minimap.tsx — Project overview strip at top of timeline.
 * Shows all tracks and clips as colored blocks. Click to navigate.
 */
import { useCallback, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { TIMELINE_MINIMAP_HEIGHT } from './timelineLayout';

const TRACK_ROW_HEIGHT = 6;
const TRACK_GAP = 1;

export function Minimap() {
  const project = useProjectStore((s) => s.project);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const scrollX = useUIStore((s) => s.scrollX);
  const timelineViewportWidth = useUIStore((s) => s.timelineViewportWidth);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!project || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const fraction = (e.clientX - rect.left) / rect.width;
      const targetTime = fraction * project.totalDuration;

      // Scroll the timeline to center on the clicked position
      const scrollContainer = containerRef.current.parentElement?.querySelector('.overflow-auto');
      if (scrollContainer) {
        const targetPx = targetTime * pixelsPerSecond;
        scrollContainer.scrollLeft = Math.max(0, targetPx - timelineViewportWidth / 2);
      }
    },
    [project, pixelsPerSecond, timelineViewportWidth],
  );

  if (!project || project.tracks.length === 0) return null;

  const totalDur = project.totalDuration || 60;
  const tracks = project.tracks;

  return (
    <div
      ref={containerRef}
      className="relative cursor-pointer select-none"
      style={{
        height: TIMELINE_MINIMAP_HEIGHT,
        background: 'linear-gradient(to bottom, #111111, #161616)',
        borderBottom: '1px solid #444',
      }}
      onClick={handleClick}
      title="Click to navigate"
      data-testid="timeline-minimap"
    >
      {/* Track rows with clips */}
      <div className="absolute inset-0 flex flex-col justify-center px-1" style={{ gap: TRACK_GAP }}>
        {tracks.map((track) => (
          <div key={track.id} className="relative" style={{ height: TRACK_ROW_HEIGHT }}>
            {track.clips.map((clip) => {
              const left = `${(clip.startTime / totalDur) * 100}%`;
              const width = `${(clip.duration / totalDur) * 100}%`;
              return (
                <div
                  key={clip.id}
                  className="absolute rounded-[1px]"
                  data-testid="minimap-clip"
                  style={{
                    left,
                    width,
                    height: TRACK_ROW_HEIGHT,
                    backgroundColor: track.color,
                    opacity: clip.generationStatus === 'ready' ? 1.0 : 0.6,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Viewport indicator — shows which portion of the timeline is currently visible */}
      <ViewportIndicator
        totalDuration={totalDur}
        pixelsPerSecond={pixelsPerSecond}
        scrollX={scrollX}
        viewportWidthPx={timelineViewportWidth}
      />
    </div>
  );
}

function ViewportIndicator({
  totalDuration,
  pixelsPerSecond,
  scrollX,
  viewportWidthPx,
}: {
  totalDuration: number;
  pixelsPerSecond: number;
  scrollX: number;
  viewportWidthPx: number;
}) {
  const totalWidthPx = totalDuration * pixelsPerSecond;
  if (totalWidthPx <= 0) return null;

  const leftFraction = Math.max(0, scrollX / totalWidthPx);
  const widthFraction = Math.min(1 - leftFraction, viewportWidthPx / totalWidthPx);

  const leftPercent = `${leftFraction * 100}%`;
  const widthPercent = `${widthFraction * 100}%`;

  return (
    <div className="absolute inset-0 pointer-events-none" data-testid="minimap-viewport">
      {/* Dimmed regions outside the viewport */}
      <div
        className="absolute top-0 bottom-0 left-0"
        style={{
          width: leftPercent,
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
        }}
        data-testid="minimap-dim-left"
      />
      <div
        className="absolute top-0 bottom-0 right-0"
        style={{
          left: `${(leftFraction + widthFraction) * 100}%`,
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
        }}
        data-testid="minimap-dim-right"
      />
      {/* Viewport rectangle */}
      <div
        className="absolute top-0 bottom-0 rounded-sm"
        style={{
          left: leftPercent,
          width: widthPercent,
          border: '1.5px solid rgba(99, 179, 237, 0.8)',
          backgroundColor: 'rgba(99, 179, 237, 0.08)',
          boxShadow: '0 0 4px rgba(99, 179, 237, 0.3)',
        }}
        data-testid="minimap-viewport-rect"
      />
    </div>
  );
}
