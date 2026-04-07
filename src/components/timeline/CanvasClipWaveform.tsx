import { useRef, useEffect, useState } from 'react';
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasHeight, setCanvasHeight] = useState(0);

  const contentWidth = Math.max(width, 0);

  // Track canvas element height changes via ResizeObserver
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentRect.height;
        if (h > 0) setCanvasHeight(h);
      }
    });
    observer.observe(canvas);
    // Initialize from current size
    const h = canvas.clientHeight;
    if (h > 0) setCanvasHeight(h);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || peaks.length === 0 || contentWidth <= 0 || canvasHeight <= 0) return;

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
  }, [peaks, audioDuration, audioOffset, clipDuration, contentOffset, timeStretchRate, stretchMode, contentWidth, color, trackVolume, canvasHeight]);

  if (!peaks || peaks.length === 0 || contentWidth <= 0) {
    return null;
  }

  return (
    <div className={`absolute inset-0 flex items-center overflow-hidden ${opacityClassName}`}>
      <canvas
        ref={canvasRef}
        data-testid="canvas-waveform"
        style={{
          width: contentWidth,
          height: '100%',
        }}
      />
    </div>
  );
}
