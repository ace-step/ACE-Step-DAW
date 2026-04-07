import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioWarpMarker } from '../../types/project';
import { useProjectStore } from '../../store/projectStore';
import { Z } from '../../utils/zIndex';

interface ClipWarpMarkersProps {
  clipId: string;
  clipDuration: number;
  width: number;
  markers: AudioWarpMarker[];
  /** Enable alt+click to add new warp markers. */
  allowAdd?: boolean;
}

const MARKER_WIDTH = 8;

/**
 * Renders warp marker handles on a clip.
 * Each marker shows as a vertical line at its quantized position,
 * with a small drag handle at the top.
 *
 * Interactions:
 * - Drag a marker to reposition its quantizedTime
 * - Double-click a marker to remove it
 * - Alt+click on the overlay to add a new marker (when allowAdd is true)
 */
export function ClipWarpMarkers({ clipId, clipDuration, width, markers, allowAdd }: ClipWarpMarkersProps) {
  const removeWarpMarker = useProjectStore((s) => s.removeWarpMarker);
  const addWarpMarker = useProjectStore((s) => s.addWarpMarker);
  const setWarpMarkers = useProjectStore((s) => s.setWarpMarkers);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const dragStartRef = useRef<{ x: number; originalQuantized: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  // Cleanup drag listeners on unmount to prevent leaks
  useEffect(() => {
    return () => {
      if (dragCleanupRef.current) {
        dragCleanupRef.current();
        dragCleanupRef.current = null;
      }
    };
  }, []);

  const handleDoubleClick = useCallback((index: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    removeWarpMarker(clipId, index);
  }, [clipId, removeWarpMarker]);

  const handleMouseDown = useCallback((index: number) => (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    dragStartRef.current = {
      x: e.clientX,
      originalQuantized: markers[index].quantizedTime,
    };
    setDraggingIndex(index);

    const pixelsPerSecond = width / clipDuration;

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = ev.clientX - dragStartRef.current.x;
      const dt = dx / pixelsPerSecond;
      const newQuantized = Math.max(0, Math.min(clipDuration, dragStartRef.current.originalQuantized + dt));

      // Update markers immutably
      const updated = markers.map((m, i) =>
        i === index ? { ...m, quantizedTime: newQuantized } : m,
      );
      setWarpMarkers(clipId, updated);
    };

    const cleanup = () => {
      dragStartRef.current = null;
      setDraggingIndex(null);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      dragCleanupRef.current = null;
    };

    const onMouseUp = () => cleanup();

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    dragCleanupRef.current = cleanup;
  }, [clipId, clipDuration, width, markers, setWarpMarkers]);

  const handleAddMarker = useCallback((e: React.MouseEvent) => {
    if (!e.altKey || !containerRef.current) return;
    e.stopPropagation();
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = (x / width) * clipDuration;
    const clampedTime = Math.max(0, Math.min(clipDuration, time));
    addWarpMarker(clipId, {
      originalTime: clampedTime,
      quantizedTime: clampedTime,
    });
  }, [clipId, clipDuration, width, addWarpMarker]);

  if (clipDuration <= 0 || width <= 0) return null;
  const pixelsPerSecond = width / clipDuration;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: Z.trackContent + 5 }}
      aria-label="Warp markers"
    >
      {/* Invisible overlay for alt+click to add markers */}
      {allowAdd && (
        <div
          className="absolute inset-0 pointer-events-auto"
          style={{ cursor: 'crosshair' }}
          onClick={handleAddMarker}
          data-testid="warp-add-overlay"
        />
      )}

      {markers.map((marker, index) => {
        const x = marker.quantizedTime * pixelsPerSecond;
        if (x < 0 || x > width) return null;
        const isDragging = draggingIndex === index;
        return (
          <div
            key={`warp-${index}`}
            className="absolute top-0 bottom-0 pointer-events-auto cursor-ew-resize group"
            style={{ left: x - MARKER_WIDTH / 2, width: MARKER_WIDTH }}
            onDoubleClick={handleDoubleClick(index)}
            onMouseDown={handleMouseDown(index)}
            data-testid={`warp-marker-${index}`}
            role="slider"
            aria-label={`Warp marker ${index + 1}: ${marker.originalTime.toFixed(2)}s → ${marker.quantizedTime.toFixed(2)}s`}
            aria-valuenow={marker.quantizedTime}
            tabIndex={0}
          >
            {/* Vertical line */}
            <div
              className={`absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px transition-colors ${
                isDragging ? 'bg-amber-300' : 'bg-amber-400/60 group-hover:bg-amber-300/90'
              }`}
            />
            {/* Top handle diamond */}
            <div
              className={`absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rotate-45 border border-amber-600/40 transition-colors ${
                isDragging ? 'bg-amber-200 scale-125' : 'bg-amber-400 group-hover:bg-amber-300'
              }`}
            />
            {/* Bottom anchor (shows original position offset) */}
            {Math.abs(marker.originalTime - marker.quantizedTime) > 0.01 && (
              <div
                className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-amber-600/50"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
