import { useRef, useEffect, useCallback } from 'react';
import { drawMidiThumbnail } from './waveformRenderer';
import { HEADER_RAIL_HEIGHT_PX } from './useClipDrag';
import type { MidiClipData } from '../../types/project';

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

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || midiData.notes.length === 0 || width <= 0 || height <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    drawMidiThumbnail({
      ctx,
      width,
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
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ top: HEADER_RAIL_HEIGHT_PX }}>
      <canvas
        ref={canvasRef}
        style={{ width, height }}
        data-testid="midi-thumbnail-canvas"
      />
    </div>
  );
}
