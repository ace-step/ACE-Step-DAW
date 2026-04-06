import { useRef, useEffect } from 'react';
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

  const contentWidth = Math.max(width, 0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || peaks.length === 0 || contentWidth <= 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssHeight = canvas.clientHeight;
    if (cssHeight <= 0) return;

    // Set backing store dimensions for HiDPI
    const backingWidth = Math.min(Math.round(contentWidth * dpr), 16384);
    const backingHeight = Math.round(cssHeight * dpr);
    canvas.width = backingWidth;
    canvas.height = backingHeight;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, contentWidth, cssHeight);

    drawWaveform(ctx, {
      peaks,
      audioDuration,
      audioOffset,
      clipDuration,
      contentOffset,
      timeStretchRate,
      stretchMode,
      width: contentWidth,
      height: cssHeight,
      color,
      opacity: 1, // opacity controlled by CSS class on container
      trackVolume,
    });
  }, [peaks, audioDuration, audioOffset, clipDuration, contentOffset, timeStretchRate, stretchMode, contentWidth, color, trackVolume]);

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
