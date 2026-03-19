import { useMemo } from 'react';
import type { Track } from '../../types/project';
import { useUIStore } from '../../store/uiStore';
import { computeCrossfadeRegions } from '../../utils/crossfade';

interface CrossfadeOverlayProps {
  track: Track;
}

/**
 * Renders crossfade regions between overlapping clips on a track.
 * Shows a diamond-shaped crossfade indicator at each overlap zone.
 */
export function CrossfadeOverlay({ track }: CrossfadeOverlayProps) {
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);

  const regions = useMemo(
    () => computeCrossfadeRegions(track.clips),
    [track.clips],
  );

  if (regions.length === 0) return null;

  return (
    <>
      {regions.map((region) => {
        const left = region.startTime * pixelsPerSecond;
        const width = region.duration * pixelsPerSecond;
        if (width < 1) return null;
        return (
          <div
            key={`xfade-${region.clipAId}-${region.clipBId}`}
            className="absolute top-0 bottom-0 pointer-events-none z-12"
            style={{ left, width }}
            data-testid={`crossfade-${region.clipAId}-${region.clipBId}`}
            aria-label={`Crossfade between clips: ${region.duration.toFixed(2)}s`}
          >
            {/* X-shaped crossfade indicator */}
            <svg
              className="absolute inset-0 w-full h-full opacity-60"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <line
                x1="0" y1="100" x2="100" y2="0"
                stroke="rgba(255, 255, 255, 0.5)"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1="0" y1="0" x2="100" y2="100"
                stroke="rgba(255, 255, 255, 0.5)"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {/* Translucent overlay */}
            <div className="absolute inset-0 bg-white/5 rounded-sm" />
          </div>
        );
      })}
    </>
  );
}
