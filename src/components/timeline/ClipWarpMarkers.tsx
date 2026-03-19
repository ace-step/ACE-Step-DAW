import { useCallback } from 'react';
import type { AudioWarpMarker } from '../../types/project';
import { useProjectStore } from '../../store/projectStore';

interface ClipWarpMarkersProps {
  clipId: string;
  clipDuration: number;
  width: number;
  markers: AudioWarpMarker[];
}

const MARKER_WIDTH = 8;

/**
 * Renders warp marker handles on a clip.
 * Each marker shows as a vertical line at its quantized position,
 * with a small drag handle at the top.
 */
export function ClipWarpMarkers({ clipId, clipDuration, width, markers }: ClipWarpMarkersProps) {
  const removeWarpMarker = useProjectStore((s) => s.removeWarpMarker);

  const handleDoubleClick = useCallback((index: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    removeWarpMarker(clipId, index);
  }, [clipId, removeWarpMarker]);

  if (clipDuration <= 0 || width <= 0) return null;
  const pixelsPerSecond = width / clipDuration;

  return (
    <div className="absolute inset-0 pointer-events-none z-15" aria-label="Warp markers">
      {markers.map((marker, index) => {
        const x = marker.quantizedTime * pixelsPerSecond;
        if (x < 0 || x > width) return null;
        return (
          <div
            key={`warp-${index}`}
            className="absolute top-0 bottom-0 pointer-events-auto cursor-ew-resize group"
            style={{ left: x - MARKER_WIDTH / 2, width: MARKER_WIDTH }}
            onDoubleClick={handleDoubleClick(index)}
            data-testid={`warp-marker-${index}`}
            role="slider"
            aria-label={`Warp marker ${index + 1}: ${marker.originalTime.toFixed(2)}s → ${marker.quantizedTime.toFixed(2)}s`}
            aria-valuenow={marker.quantizedTime}
            tabIndex={0}
          >
            {/* Vertical line */}
            <div
              className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px bg-amber-400/60 group-hover:bg-amber-300/90 transition-colors"
            />
            {/* Top handle diamond */}
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rotate-45 bg-amber-400 group-hover:bg-amber-300 border border-amber-600/40 transition-colors"
            />
          </div>
        );
      })}
    </div>
  );
}
