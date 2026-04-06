import { useRef, useEffect, useCallback } from 'react';
import type { StretchMode } from '../../types/project';
import { drawWaveform, CANVAS_CONSTANTS } from './waveformRenderer';

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
  opacity?: number;
  trackVolume?: number;
}

/**
 * Canvas-based stereo waveform renderer replacing the SVG-based ClipWaveform.
 * Uses HiDPI scaling and ResizeObserver for dynamic height measurement.
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
  opacity = 0.9,
  trackVolume = 1,
}: CanvasClipWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heightRef = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cssW = Math.min(width, CANVAS_CONSTANTS.MAX_CANVAS_CSS_PX);
    const cssH = heightRef.current;
    if (cssW <= 0 || cssH <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    const backingW = Math.round(cssW * dpr);
    const backingH = Math.round(cssH * dpr);

    if (canvas.width !== backingW || canvas.height !== backingH) {
      canvas.width = backingW;
      canvas.height = backingH;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawWaveform(ctx, {
      peaks,
      audioDuration,
      audioOffset,
      clipDuration,
      contentOffset,
      timeStretchRate,
      stretchMode,
      width: cssW,
      height: cssH,
      color,
      trackVolume,
    });
  }, [peaks, audioDuration, audioOffset, clipDuration, contentOffset, timeStretchRate, stretchMode, width, color, trackVolume]);

  // ResizeObserver for dynamic height
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
        if (h > 0 && h !== heightRef.current) {
          heightRef.current = h;
          draw();
        }
      }
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);

  // Redraw when data changes
  useEffect(() => {
    draw();
  }, [draw]);

  const cssW = Math.min(width, CANVAS_CONSTANTS.MAX_CANVAS_CSS_PX);

  return (
    <div className="absolute inset-0 flex items-center overflow-hidden">
      <canvas
        ref={canvasRef}
        style={{
          width: cssW,
          height: '100%',
          opacity,
          willChange: 'transform',
        }}
        data-testid="canvas-waveform"
      />
    </div>
  );
}
