/**
 * Minimap.tsx — Project overview strip at top of timeline.
 * Shows all tracks and clips as colored blocks. Click to navigate.
 */
import { useCallback, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';

const MINIMAP_HEIGHT = 28;
const TRACK_ROW_HEIGHT = 4;
const TRACK_GAP = 1;

export function Minimap() {
  const project = useProjectStore((s) => s.project);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const setPixelsPerSecond = useUIStore((s) => s.setPixelsPerSecond);
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
        scrollContainer.scrollLeft = Math.max(0, targetPx - scrollContainer.clientWidth / 2);
      }
    },
    [project, pixelsPerSecond],
  );

  if (!project || project.tracks.length === 0) return null;

  const totalDur = project.totalDuration || 60;
  const tracks = project.tracks;

  return (
    <div
      ref={containerRef}
      className="relative bg-[#1a1a1a] border-b border-[#333] cursor-pointer select-none"
      style={{ height: MINIMAP_HEIGHT }}
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
                  style={{
                    left,
                    width,
                    height: TRACK_ROW_HEIGHT,
                    backgroundColor: track.color,
                    opacity: clip.generationStatus === 'ready' ? 0.8 : 0.4,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Viewport indicator — shows which portion of the timeline is currently visible */}
      <ViewportIndicator totalDuration={totalDur} pixelsPerSecond={pixelsPerSecond} />
    </div>
  );
}

function ViewportIndicator({
  totalDuration,
  pixelsPerSecond,
}: {
  totalDuration: number;
  pixelsPerSecond: number;
}) {
  // We'd need a ref to the scroll container to calculate viewport.
  // For now, show a subtle gradient indicating the overview is navigable.
  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-daw-accent/40 rounded" />
    </div>
  );
}
