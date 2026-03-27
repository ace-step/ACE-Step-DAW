import React, { useCallback } from 'react';

interface SliceMarkersProps {
  /** Clip id for data attributes and event handling. */
  clipId: string;
  /** Width of the clip in pixels. */
  width: number;
  /** Clip duration in seconds. */
  clipDuration: number;
  /** Array of slice point positions in seconds (relative to clip start). */
  slicePoints: number[];
  /** Called when the user clicks to add a marker at a time position (seconds). */
  onAddSlice: (timeSeconds: number) => void;
  /** Called when the user clicks an existing marker to remove it. */
  onRemoveSlice: (index: number) => void;
}

/**
 * Overlay that draws vertical slice markers on a clip waveform.
 * Clicking on a blank area adds a new slice; clicking an existing marker removes it.
 */
export const SliceMarkers = React.memo(function SliceMarkers({
  clipId,
  width,
  clipDuration,
  slicePoints,
  onAddSlice,
  onRemoveSlice,
}: SliceMarkersProps) {
  const handleBackgroundClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only handle direct clicks on the background, not on markers
      if ((e.target as HTMLElement).dataset.sliceMarker) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const fraction = x / width;
      const timeSec = fraction * clipDuration;
      onAddSlice(timeSec);
    },
    [width, clipDuration, onAddSlice],
  );

  if (width <= 0 || clipDuration <= 0) return null;

  return (
    <div
      className="absolute inset-0 z-20"
      style={{ cursor: 'crosshair' }}
      onClick={handleBackgroundClick}
      data-testid={`slice-markers-${clipId}`}
    >
      {slicePoints.map((timeSec, idx) => {
        const xPos = (timeSec / clipDuration) * width;
        return (
          <div
            key={idx}
            data-slice-marker="true"
            data-testid={`slice-marker-${idx}`}
            className="absolute top-0 bottom-0"
            style={{
              left: xPos - 1,
              width: 3,
              backgroundColor: 'rgba(255, 90, 60, 0.85)',
              cursor: 'pointer',
            }}
            title={`Slice at ${timeSec.toFixed(3)}s — click to remove`}
            onClick={(e) => {
              e.stopPropagation();
              onRemoveSlice(idx);
            }}
          />
        );
      })}
    </div>
  );
});
