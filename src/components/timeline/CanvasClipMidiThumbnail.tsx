import { useRef, useEffect } from 'react';
import type { MidiClipData } from '../../types/project';
import { drawMidiThumbnail } from './waveformRenderer';

interface CanvasClipMidiThumbnailProps {
  midiData: MidiClipData;
  width: number;
  duration: number;
  bpm: number;
  color: string;
}

/**
 * Canvas-based MIDI thumbnail replacing the SVG ClipMidiThumbnail.
 * Renders note rectangles on a Canvas with HiDPI support.
 */
export function CanvasClipMidiThumbnail({
  midiData,
  width,
  duration,
  bpm,
  color,
}: CanvasClipMidiThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || midiData.notes.length === 0 || width <= 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssHeight = canvas.clientHeight;
    if (cssHeight <= 0) return;

    // Set backing store dimensions for HiDPI. If capped at 16384,
    // adjust transform to map logical width to capped backing size.
    const backingWidth = Math.min(Math.round(width * dpr), 16384);
    const backingHeight = Math.round(cssHeight * dpr);
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;

    const scaleX = backingWidth / width;
    const scaleY = backingHeight / cssHeight;
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    ctx.clearRect(0, 0, width, cssHeight);

    drawMidiThumbnail(ctx, midiData.notes, width, cssHeight, duration, bpm, color);
  }, [midiData, width, duration, bpm, color]);

  if (midiData.notes.length === 0) {
    return null;
  }

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ top: 14 }}>
      <canvas
        ref={canvasRef}
        data-testid="canvas-midi-thumbnail"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
