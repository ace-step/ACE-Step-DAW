import { useRef, useEffect, useCallback } from 'react';
import type { MidiClipData } from '../../types/project';
import { drawMidiThumbnail, CANVAS_CONSTANTS } from './waveformRenderer';

interface CanvasClipMidiThumbnailProps {
  midiData: MidiClipData;
  width: number;
  duration: number;
  bpm: number;
  color: string;
}

/**
 * Canvas-based MIDI note thumbnail replacing the SVG-based ClipMidiThumbnail.
 */
export function CanvasClipMidiThumbnail({
  midiData,
  width,
  duration,
  bpm,
  color,
}: CanvasClipMidiThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heightRef = useRef(0);

  if (midiData.notes.length === 0) return null;

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

    drawMidiThumbnail(ctx, {
      notes: midiData.notes,
      width: cssW,
      height: cssH,
      duration,
      bpm,
      color,
    });
  }, [midiData.notes, width, duration, bpm, color]);

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

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      style={{ top: CANVAS_CONSTANTS.MIDI_THUMBNAIL_TOP }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          willChange: 'transform',
        }}
        data-testid="canvas-midi-thumbnail"
      />
    </div>
  );
}
