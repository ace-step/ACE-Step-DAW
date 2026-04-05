import { useRef, useEffect, useCallback, useState, useLayoutEffect } from 'react';
import { drawWaveform } from './waveformRenderer';
import type { StretchMode } from '../../types/project';

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
  opacity = 0.6,
  trackVolume = 1,
}: CanvasClipWaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasMetricsRef = useRef<{ width: number; height: number; dpr: number } | null>(null);
  const [measuredHeight, setMeasuredHeight] = useState(0);

  // Measure the container height (replaces SVG height="100%")
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setMeasuredHeight(entry.contentRect.height);
      }
    });
    ro.observe(el);
    setMeasuredHeight(el.clientHeight);

    return () => ro.disconnect();
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || peaks.length === 0 || width <= 0 || measuredHeight <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    // Cap backing store to safe browser canvas limit (most browsers: 16384–32768px)
    const safeWidth = Math.min(width, 16384 / dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Only resize backing store when dimensions change (avoids expensive reallocation)
    const metrics = canvasMetricsRef.current;
    const needsResize =
      !metrics || metrics.width !== safeWidth || metrics.height !== measuredHeight || metrics.dpr !== dpr;

    if (needsResize) {
      canvas.width = safeWidth * dpr;
      canvas.height = measuredHeight * dpr;
      canvasMetricsRef.current = { width: safeWidth, height: measuredHeight, dpr };
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, safeWidth, measuredHeight);

    drawWaveform({
      ctx,
      width: safeWidth,
      height: measuredHeight,
      peaks,
      audioDuration,
      audioOffset,
      clipDuration,
      contentOffset,
      timeStretchRate,
      stretchMode,
      color,
      trackVolume,
      opacity,
    });
  }, [peaks, audioDuration, audioOffset, clipDuration, contentOffset, timeStretchRate, stretchMode, width, measuredHeight, color, trackVolume, opacity]);

  useEffect(() => {
    draw();
  }, [draw]);

  if (!peaks || peaks.length === 0 || width <= 0) {
    return null;
  }

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        style={{ width, height: measuredHeight || '100%' }}
        data-testid="waveform-canvas"
      />
    </div>
  );
}
