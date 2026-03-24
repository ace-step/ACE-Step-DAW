import { useCallback, useRef, useEffect, useState } from 'react';
import { PEAK_STRIDE } from '../../utils/waveformPeaks';
import { renderStereoPeaks, renderSimplePeaks } from './WaveformPreview';

export interface WaveformRangeSelectorProps {
  /** Waveform peak data (interleaved stereo or simple amplitude array) */
  peaks: number[];
  /** Clip duration in seconds */
  duration: number;
  /** Normalized range start (0-1) */
  rangeStart: number;
  /** Normalized range end (0-1) */
  rangeEnd: number;
  /** Callback when range changes */
  onRangeChange: (start: number, end: number) => void;
  /** BPM for snap-to-beat */
  bpm?: number;
  /** Whether to snap to grid */
  snapToGrid?: boolean;
}

/** Format seconds as "X.XXs" */
function fmt(seconds: number): string {
  return `${seconds.toFixed(2)}s`;
}

/** Minimum range as a fraction (roughly 1 beat at 120bpm in a 10s clip) */
const MIN_RANGE_FRACTION = 0.01;

/**
 * Inline waveform-based range picker for Repaint mode.
 * Displays the clip waveform with draggable left/right handles
 * to select the repaint region.
 */
export function WaveformRangeSelector({
  peaks,
  duration,
  rangeStart,
  rangeEnd,
  onRangeChange,
  bpm,
  snapToGrid: snapEnabled,
}: WaveformRangeSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'left' | 'right' | 'click' | null>(null);
  /** Anchor point for click-drag selection */
  const clickAnchorRef = useRef(rangeStart);

  const snapValue = useCallback(
    (normalized: number): number => {
      if (!snapEnabled || !bpm || !duration) return normalized;
      const beatDuration = 60 / bpm;
      const timeInSeconds = normalized * duration;
      const snapped = Math.round(timeInSeconds / beatDuration) * beatDuration;
      return Math.max(0, Math.min(1, snapped / duration));
    },
    [snapEnabled, bpm, duration],
  );

  const getMinRange = useCallback((): number => {
    if (bpm && duration > 0) {
      const beatDuration = 60 / bpm;
      return Math.max(MIN_RANGE_FRACTION, beatDuration / duration);
    }
    return MIN_RANGE_FRACTION;
  }, [bpm, duration]);

  const clientXToNormalized = useCallback(
    (clientX: number): number => {
      const el = containerRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    },
    [],
  );

  const handleLeftDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging('left');
    },
    [],
  );

  const handleRightDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging('right');
    },
    [],
  );

  // Handle click on waveform background (outside handles) to start new selection
  const handleContainerDown = useCallback(
    (e: React.MouseEvent) => {
      // Only handle direct clicks on the container, not on handles
      if ((e.target as HTMLElement).dataset.handle) return;
      const normalized = clientXToNormalized(e.clientX);
      const snapped = snapValue(normalized);
      const minRange = getMinRange();
      const newEnd = Math.min(1, snapped + minRange);
      onRangeChange(snapped, newEnd);
      setDragging('click');
      clickAnchorRef.current = snapped;
    },
    [clientXToNormalized, snapValue, getMinRange, onRangeChange],
  );

  // Mouse move and mouse up handlers
  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const normalized = clientXToNormalized(e.clientX);
      const snapped = snapValue(normalized);
      const minRange = getMinRange();

      if (dragging === 'left') {
        const newStart = Math.min(snapped, rangeEnd - minRange);
        onRangeChange(Math.max(0, newStart), rangeEnd);
      } else if (dragging === 'right') {
        const newEnd = Math.max(snapped, rangeStart + minRange);
        onRangeChange(rangeStart, Math.min(1, newEnd));
      } else if (dragging === 'click') {
        // Extend selection from click start
        const anchor = clickAnchorRef.current;
        if (snapped >= anchor) {
          onRangeChange(anchor, Math.max(snapped, anchor + minRange));
        } else {
          onRangeChange(Math.max(0, snapped), anchor + minRange);
        }
      }
    };

    const handleMouseUp = () => {
      setDragging(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, rangeStart, rangeEnd, clientXToNormalized, snapValue, getMinRange, onRangeChange]);

  // Empty state
  if (!peaks || peaks.length === 0) {
    return (
      <div
        data-testid="waveform-range-selector"
        className="bg-[#1e1e22] rounded flex items-center justify-center"
        style={{ height: 60 }}
      >
        <span className="text-[9px] text-zinc-600">No waveform data</span>
      </div>
    );
  }

  // Determine if stereo peaks
  const isStereo = peaks.length >= PEAK_STRIDE && peaks.length % PEAK_STRIDE === 0;
  const logicalCount = isStereo ? peaks.length / PEAK_STRIDE : peaks.length;

  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const startPct = Number.isFinite(rangeStart) ? rangeStart * 100 : 0;
  const endPct = Number.isFinite(rangeEnd) ? rangeEnd * 100 : 100;

  return (
    <div className="select-none">
      <div
        ref={containerRef}
        data-testid="waveform-range-selector"
        className="relative bg-[#1e1e22] rounded overflow-hidden"
        style={{ height: 60, cursor: dragging ? 'col-resize' : 'crosshair' }}
        onMouseDown={handleContainerDown}
      >
        {/* Waveform SVG */}
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${logicalCount} 100`}
          preserveAspectRatio="none"
          className="absolute inset-0 pointer-events-none"
        >
          {isStereo
            ? renderStereoPeaks(peaks, logicalCount, '#f43f5e')
            : renderSimplePeaks(peaks, '#f43f5e')}
        </svg>

        {/* Keep zone left (gray overlay) */}
        {startPct > 0 && (
          <div
            data-testid="keep-zone-left"
            className="absolute inset-y-0 left-0 pointer-events-none"
            style={{
              width: `${startPct}%`,
              background: 'rgba(0, 0, 0, 0.55)',
            }}
          />
        )}

        {/* Keep zone right (gray overlay) */}
        {endPct < 100 && (
          <div
            data-testid="keep-zone-right"
            className="absolute inset-y-0 right-0 pointer-events-none"
            style={{
              width: `${100 - endPct}%`,
              background: 'rgba(0, 0, 0, 0.55)',
            }}
          />
        )}

        {/* Regenerate zone (colored overlay) */}
        <div
          data-testid="regenerate-zone"
          className="absolute inset-y-0 pointer-events-none"
          style={{
            left: `${startPct}%`,
            width: `${endPct - startPct}%`,
            background: 'rgba(225, 29, 72, 0.15)',
            borderLeft: '1px solid rgba(225, 29, 72, 0.5)',
            borderRight: '1px solid rgba(225, 29, 72, 0.5)',
          }}
        />

        {/* Left handle */}
        <div
          data-testid="range-handle-left"
          data-handle="left"
          className="absolute inset-y-0 z-10 hover:bg-rose-500/30 transition-colors"
          style={{
            left: `${startPct}%`,
            width: 6,
            marginLeft: -3,
            cursor: 'col-resize',
          }}
          onMouseDown={handleLeftDown}
        >
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-4 rounded-full bg-rose-400" />
        </div>

        {/* Right handle */}
        <div
          data-testid="range-handle-right"
          data-handle="right"
          className="absolute inset-y-0 z-10 hover:bg-rose-500/30 transition-colors"
          style={{
            left: `${endPct}%`,
            width: 6,
            marginLeft: -3,
            cursor: 'col-resize',
          }}
          onMouseDown={handleRightDown}
        >
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-4 rounded-full bg-rose-400" />
        </div>
      </div>

      {/* Timestamp labels */}
      <div className="relative h-4 mt-0.5">
        <span
          className="absolute text-[9px] font-mono text-rose-300"
          style={{ left: `${Math.max(0, startPct)}%`, transform: 'translateX(-50%)' }}
        >
          {fmt(rangeStart * safeDuration)}
        </span>
        <span
          className="absolute text-[9px] font-mono text-rose-300"
          style={{ left: `${Math.min(100, endPct)}%`, transform: 'translateX(-50%)' }}
        >
          {fmt(rangeEnd * safeDuration)}
        </span>
      </div>
    </div>
  );
}

