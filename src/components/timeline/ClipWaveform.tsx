import { useRef, useEffect, useCallback } from 'react';
import type { MidiClipData, StretchMode } from '../../types/project';
import { drawWaveform } from './WaveformCanvasRenderer';

interface ClipWaveformProps {
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
  /** Track volume (0..1). Scales the waveform visually to reflect actual output level. */
  trackVolume?: number;
}

/** Parse Tailwind-style opacity-XX class names to numeric values (XX/100). */
function parseOpacityClass(className: string): number {
  const match = /^opacity-(\d+)$/.exec(className);
  if (match) return Math.min(1, parseInt(match[1], 10) / 100);
  return 0.9;
}

export function ClipWaveform({
  peaks,
  audioDuration,
  audioOffset,
  clipDuration,
  contentOffset,
  timeStretchRate,
  stretchMode,
  width,
  color,
  opacityClassName = 'opacity-60',
  trackVolume = 1,
}: ClipWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contentWidth = Math.max(width, 0);
  const opacity = parseOpacityClass(opacityClassName);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.parentElement?.getBoundingClientRect();
    const h = rect?.height ?? 60;
    const dpr = window.devicePixelRatio || 1;
    const w = contentWidth;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    drawWaveform(ctx, {
      peaks,
      audioDuration,
      audioOffset,
      clipDuration,
      contentOffset,
      timeStretchRate,
      stretchMode,
      width: w,
      height: h,
      color,
      opacity,
      trackVolume,
    });
  }, [peaks, audioDuration, audioOffset, clipDuration, contentOffset, timeStretchRate, stretchMode, contentWidth, color, opacity, trackVolume]);

  useEffect(() => {
    render();
  }, [render]);

  if (!peaks || peaks.length === 0 || contentWidth <= 0) {
    return null;
  }

  return (
    <div className="absolute inset-0 flex items-center overflow-hidden">
      <canvas
        ref={canvasRef}
        data-testid="waveform-canvas"
        style={{ width: contentWidth, imageRendering: 'auto' }}
      />
    </div>
  );
}

interface ClipMidiThumbnailProps {
  midiData: MidiClipData;
  width: number;
  duration: number;
  bpm: number;
  color: string;
}

export function ClipMidiThumbnail({ midiData, width, duration, bpm, color }: ClipMidiThumbnailProps) {
  if (midiData.notes.length === 0) {
    return null;
  }

  const secPerBeat = 60 / bpm;
  const pitches = midiData.notes.map((note) => note.pitch);
  const minPitch = Math.min(...pitches);
  const maxPitch = Math.max(...pitches);
  const range = Math.max(maxPitch - minPitch, 12);
  const pad = 2;

  // Zoom-adaptive density: when clip is narrow, skip notes that would overlap
  // to avoid visual noise. At wider widths, show all notes.
  const maxNotes = Math.max(20, Math.floor(width / 2));
  const notes = midiData.notes.length > maxNotes
    ? midiData.notes.filter((_, i) => i % Math.ceil(midiData.notes.length / maxNotes) === 0)
    : midiData.notes;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ top: 14 }}>
      <svg width="100%" height="100%" preserveAspectRatio="none" viewBox={`0 0 ${width} 100`}>
        {notes.map((note, index) => {
          const x = (note.startBeat * secPerBeat / duration) * width;
          const noteWidth = Math.max((note.durationBeats * secPerBeat / duration) * width, 1);
          const y = 100 - ((note.pitch - minPitch + pad) / (range + pad * 2)) * 100;
          const height = Math.max(100 / (range + pad * 2), 2);

          return <rect key={index} x={x} y={y} width={noteWidth} height={height} fill={color} opacity={0.7} rx={0.5} />;
        })}
      </svg>
    </div>
  );
}
