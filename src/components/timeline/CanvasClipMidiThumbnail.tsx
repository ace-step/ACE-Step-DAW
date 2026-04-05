import { useRef, useEffect, useCallback } from 'react';
import { drawMidiThumbnail } from './waveformRenderer';
import type { MidiClipData } from '../../types/project';

/**
 * Vertical offset for the MIDI thumbnail within the clip block.
 * Intentionally smaller than HEADER_RAIL_HEIGHT_PX (20) to show more
 * note content — matches the original SVG implementation's `top: 14`.
 */
const MIDI_THUMBNAIL_TOP = 14;

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

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || midiData.notes.length === 0 || width <= 0 || height <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    // Cap backing store to safe browser canvas limit
    const safeWidth = Math.min(width, 16384 / dpr);
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
  }, [midiData, width, height, duration, bpm, color]);

  useEffect(() => {
    draw();
  }, [draw]);

  if (midiData.notes.length === 0) {
    return null;
  }

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ top: MIDI_THUMBNAIL_TOP }}>
      <canvas
        ref={canvasRef}
        style={{ width, height }}
        data-testid="midi-thumbnail-canvas"
      />
    </div>
  );
}
