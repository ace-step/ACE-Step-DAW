import { useRef, useEffect, useCallback, useMemo } from 'react';
import { drawMidiThumbnail, MAX_CANVAS_CSS_PX } from './waveformRenderer';
import type { MidiClipData } from '../../types/project';

/** Exported so callers can compute available height without duplicating magic numbers. */
export const MIDI_THUMBNAIL_TOP = 14;

interface CanvasClipMidiThumbnailProps {
  midiData: MidiClipData;
  width: number;
  height: number;
  duration: number;
  bpm: number;
  color: string;
}

export function CanvasClipMidiThumbnail({
  midiData,
  width,
  height,
  duration,
  bpm,
  color,
}: CanvasClipMidiThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasMetricsRef = useRef<{ width: number; height: number; dpr: number } | null>(null);

  // Cap width for backing store to stay within browser canvas limits.
  // CSS uses 100% width so wide clips may stretch beyond safeWidth.
  const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
  const safeWidth = useMemo(() => Math.min(width, MAX_CANVAS_CSS_PX / dpr), [width, dpr]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || midiData.notes.length === 0 || safeWidth <= 0 || height <= 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Only resize backing store when dimensions change
    const metrics = canvasMetricsRef.current;
    const needsResize =
      !metrics || metrics.width !== safeWidth || metrics.height !== height || metrics.dpr !== dpr;

    if (needsResize) {
      canvas.width = safeWidth * dpr;
      canvas.height = height * dpr;
      canvasMetricsRef.current = { width: safeWidth, height, dpr };
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, safeWidth, height);

    drawMidiThumbnail({
      ctx,
      width: safeWidth,
      height,
      notes: midiData.notes,
      duration,
      bpm,
      color,
    });
  }, [midiData, safeWidth, height, duration, bpm, color, dpr]);

  useEffect(() => {
    draw();
  }, [draw]);

  if (midiData.notes.length === 0 || height <= 0 || safeWidth <= 0) {
    return null;
  }

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ top: MIDI_THUMBNAIL_TOP }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height }}
        data-testid="midi-thumbnail-canvas"
      />
    </div>
  );
}
