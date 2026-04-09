import { useRef, useEffect, useState, useCallback } from 'react';
import type { StretchMode } from '../../types/project';
import { drawWaveform } from './waveformRenderer';

interface CanvasClipWaveformProps {
  peaks: number[] | null;
  audioDuration: number;
  audioOffset: number;
  clipDuration: number;
  contentOffset?: number;
  timeStretchRate?: number;
  stretchMode?: StretchMode;
  width: number;
  color: string;
  opacityClassName?: string;
  trackVolume?: number;
}

/**
 * Canvas-based waveform renderer replacing the SVG ClipWaveform.
 * Uses a single <canvas> element with HiDPI scaling for crisp rendering.
 * Tracks element height via ResizeObserver to redraw on layout changes.
 *
 * Uses a callback ref to set up the ResizeObserver at the exact moment the
 * canvas element enters the DOM, avoiding timing issues where a `useEffect([], [])`
 * might fire before layout is complete.
 */
export function CanvasClipWaveform({
  peaks,
  audioDuration,
  audioOffset,
  clipDuration,
  contentOffset,
  timeStretchRate,
  stretchMode,
  width,
  color,
  opacityClassName = 'opacity-90',
  trackVolume = 1,
}: CanvasClipWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  // Incremented whenever the canvas size changes, triggering a redraw.
  const [resizeTick, setResizeTick] = useState(0);

  const contentWidth = Math.max(width, 0);

  // Callback ref: attaches / detaches the ResizeObserver exactly when the
  // canvas element mounts / unmounts — no timing gap.
  const setCanvasRef = useCallback((el: HTMLCanvasElement | null) => {
    // Clean up previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    canvasRef.current = el;

    if (el) {
      const observer = new ResizeObserver(() => {
        setResizeTick((t) => t + 1);
      });
      observer.observe(el);
      observerRef.current = observer;
      // Trigger an initial draw
      setResizeTick((t) => t + 1);
    }
  }, []);

  // Clean up observer on unmount (safety net)
  useEffect(() => () => {
    observerRef.current?.disconnect();
  }, []);

  // Draw effect — reads clientHeight directly from the canvas element so it
  // never relies on stale state.  `resizeTick` is in the dep array only to
  // trigger a re-run when the element resizes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || peaks.length === 0 || contentWidth <= 0) return;

    const canvasHeight = canvas.clientHeight;
    if (canvasHeight <= 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    // Set backing store dimensions for HiDPI. If capped at 16384,
    // adjust transform to map logical width to the capped backing size.
    const backingWidth = Math.min(Math.round(contentWidth * dpr), 16384);
    const backingHeight = Math.round(canvasHeight * dpr);
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;

    const scaleX = backingWidth / contentWidth;
    const scaleY = backingHeight / canvasHeight;
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    ctx.clearRect(0, 0, contentWidth, canvasHeight);

    // Limit column count to effective backing resolution to avoid wasted work
    const effectiveMaxColumns = Math.ceil(backingWidth / (window.devicePixelRatio || 1));

    drawWaveform(ctx, {
      peaks,
      audioDuration,
      audioOffset,
      clipDuration,
      contentOffset,
      timeStretchRate,
      stretchMode,
      width: contentWidth,
      height: canvasHeight,
      color,
      opacity: 1, // opacity controlled by CSS class on container
      trackVolume,
      maxColumns: effectiveMaxColumns,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peaks, audioDuration, audioOffset, clipDuration, contentOffset, timeStretchRate, stretchMode, contentWidth, color, trackVolume, resizeTick]);

  if (!peaks || peaks.length === 0 || contentWidth <= 0) {
    return null;
  }

  return (
    <div className={`absolute inset-0 flex items-center overflow-hidden ${opacityClassName}`}>
      <canvas
        ref={setCanvasRef}
        role="img"
        aria-label="Audio waveform"
        data-testid="canvas-waveform"
        style={{
          width: contentWidth,
          height: '100%',
        }}
      />
    </div>
  );
}
