/**
 * Canvas-based waveform and MIDI thumbnail drawing functions.
 *
 * These replace the SVG-based rendering in ClipWaveform for improved
 * performance with many tracks/clips. All drawing is done via
 * CanvasRenderingContext2D — no DOM element creation in hot paths.
 */
import { getClipSourceSpan, getClipWaveformLayout } from '../../utils/clipAudio';
import { PEAK_STRIDE } from '../../utils/waveformPeaks';
import type { StretchMode } from '../../types/project';

export const CANVAS_CONSTANTS = {
  /** Top offset for MIDI thumbnails (below clip header) */
  MIDI_THUMBNAIL_TOP: 14,
  /** Max CSS pixels for a single canvas dimension (prevent GPU OOM) */
  MAX_CANVAS_CSS_PX: 16384,
} as const;

// ─── Waveform ───────────────────────────────────────────────────────

export interface DrawWaveformOptions {
  peaks: number[] | null;
  audioDuration: number;
  audioOffset: number;
  clipDuration: number;
  contentOffset?: number;
  timeStretchRate?: number;
  stretchMode?: StretchMode;
  width: number;
  height: number;
  color: string;
  trackVolume?: number;
}

export function drawWaveform(ctx: CanvasRenderingContext2D, opts: DrawWaveformOptions): void {
  const {
    peaks, audioDuration, audioOffset, clipDuration,
    contentOffset, timeStretchRate, stretchMode,
    width, height, color, trackVolume = 1,
  } = opts;

  ctx.clearRect(0, 0, width, height);

  if (!peaks || peaks.length === 0 || width <= 0 || height <= 0) return;

  const logicalPeakCount = Math.floor(peaks.length / PEAK_STRIDE);
  if (logicalPeakCount === 0) return;

  const clipWindow = {
    startTime: 0,
    duration: clipDuration,
    audioDuration,
    audioOffset,
    contentOffset,
    timeStretchRate,
    stretchMode,
  };

  const waveformLayout = getClipWaveformLayout(clipWindow, width);
  if (waveformLayout.widthPx <= 0) return;

  const peakSlice = getVisiblePeakSlice(
    logicalPeakCount, audioDuration, audioOffset, getClipSourceSpan(clipWindow),
  );
  if (peakSlice.numBars === 0) return;

  const columnCount = Math.max(1, Math.floor(waveformLayout.widthPx));
  const columnWidth = waveformLayout.widthPx / columnCount;
  const scaledAmplitude = (height * 0.23) * Math.min(1, trackVolume);

  // Center divider
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.2;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(waveformLayout.leftPx, height * 0.5);
  ctx.lineTo(waveformLayout.leftPx + waveformLayout.widthPx, height * 0.5);
  ctx.stroke();
  ctx.restore();

  // Draw filled waveforms for both channels
  drawChannel(ctx, peaks, peakSlice, columnCount, columnWidth,
    waveformLayout.leftPx, 0, height * 0.25, scaledAmplitude, color, 0.6);
  drawChannel(ctx, peaks, peakSlice, columnCount, columnWidth,
    waveformLayout.leftPx, 2, height * 0.75, scaledAmplitude, color, 0.6);

  // Draw peak envelope lines (brighter highlight)
  drawPeakEnvelope(ctx, peaks, peakSlice, columnCount, columnWidth,
    waveformLayout.leftPx, 0, height * 0.25, scaledAmplitude, color);
  drawPeakEnvelope(ctx, peaks, peakSlice, columnCount, columnWidth,
    waveformLayout.leftPx, 2, height * 0.75, scaledAmplitude, color);
}

function drawChannel(
  ctx: CanvasRenderingContext2D,
  peaks: number[],
  peakSlice: PeakSlice,
  columnCount: number,
  columnWidth: number,
  leftPx: number,
  channelOffset: number,
  centerY: number,
  maxAmplitude: number,
  color: string,
  fillOpacity: number,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = fillOpacity;
  ctx.beginPath();

  // Upper contour (left to right)
  for (let i = 0; i < columnCount; i++) {
    const x = leftPx + (i + 0.5) * columnWidth;
    const { max } = getMinMaxForColumn(peaks, peakSlice, i, columnCount, channelOffset);
    const y = centerY - max * maxAmplitude;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }

  // Lower contour (right to left)
  for (let i = columnCount - 1; i >= 0; i--) {
    const x = leftPx + (i + 0.5) * columnWidth;
    const { min } = getMinMaxForColumn(peaks, peakSlice, i, columnCount, channelOffset);
    const y = centerY - min * maxAmplitude; // min is negative, so this goes below center
    ctx.lineTo(x, y);
  }

  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPeakEnvelope(
  ctx: CanvasRenderingContext2D,
  peaks: number[],
  peakSlice: PeakSlice,
  columnCount: number,
  columnWidth: number,
  leftPx: number,
  channelOffset: number,
  centerY: number,
  maxAmplitude: number,
  color: string,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 1;
  ctx.lineWidth = 0.8;
  ctx.beginPath();

  for (let i = 0; i < columnCount; i++) {
    const x = leftPx + (i + 0.5) * columnWidth;
    const { max } = getMinMaxForColumn(peaks, peakSlice, i, columnCount, channelOffset);
    const y = centerY - max * maxAmplitude;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }

  ctx.stroke();
  ctx.restore();
}

// ─── MIDI Thumbnail ─────────────────────────────────────────────────

export interface MidiNote {
  pitch: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
}

export interface DrawMidiThumbnailOptions {
  notes: MidiNote[];
  width: number;
  height: number;
  duration: number;
  bpm: number;
  color: string;
}

export function drawMidiThumbnail(ctx: CanvasRenderingContext2D, opts: DrawMidiThumbnailOptions): void {
  const { notes, width, height, duration, bpm, color } = opts;

  ctx.clearRect(0, 0, width, height);

  if (
    notes.length === 0 ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(duration) ||
    !Number.isFinite(bpm) ||
    duration <= 0 ||
    bpm <= 0
  ) return;

  const secPerBeat = 60 / bpm;
  const pitches = notes.map((n) => n.pitch);
  const minPitch = Math.min(...pitches);
  const maxPitch = Math.max(...pitches);
  const range = Math.max(maxPitch - minPitch, 12);
  const pad = 2;

  // Zoom-adaptive density: skip notes when narrow to avoid visual noise
  const maxNotes = Math.max(20, Math.floor(width / 2));
  const filteredNotes = notes.length > maxNotes
    ? notes.filter((_, i) => i % Math.ceil(notes.length / maxNotes) === 0)
    : notes;

  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.7;

  for (const note of filteredNotes) {
    const x = (note.startBeat * secPerBeat / duration) * width;
    const noteWidth = Math.max((note.durationBeats * secPerBeat / duration) * width, 1);
    const y = height - ((note.pitch - minPitch + pad) / (range + pad * 2)) * height;
    const noteHeight = Math.max(height / (range + pad * 2), 2);
    ctx.fillRect(x, y, noteWidth, noteHeight);
  }

  ctx.restore();
}

// ─── Shared helpers ─────────────────────────────────────────────────

interface PeakSlice {
  startPeakIdx: number;
  numBars: number;
}

function getVisiblePeakSlice(
  logicalPeakCount: number,
  audioDuration: number,
  audioOffset: number,
  sourceSpan: number,
): PeakSlice {
  if (logicalPeakCount === 0 || audioDuration <= 0) {
    return { startPeakIdx: 0, numBars: 0 };
  }

  const startPeakIdx = Math.floor((audioOffset / audioDuration) * logicalPeakCount);
  const visibleAudioSec = Math.min(sourceSpan, Math.max(0, audioDuration - audioOffset));
  const endPeakIdx = Math.min(
    Math.ceil(((audioOffset + visibleAudioSec) / audioDuration) * logicalPeakCount),
    logicalPeakCount,
  );

  return {
    startPeakIdx,
    numBars: Math.max(0, endPeakIdx - startPeakIdx),
  };
}

function getMinMaxForColumn(
  peaks: number[],
  peakSlice: PeakSlice,
  columnIndex: number,
  columnCount: number,
  channelOffset: number,
): { max: number; min: number } {
  const start = peakSlice.startPeakIdx + Math.floor((columnIndex / columnCount) * peakSlice.numBars);
  const end = peakSlice.startPeakIdx + Math.ceil(((columnIndex + 1) / columnCount) * peakSlice.numBars);
  let max = 0;
  let min = 0;

  for (let i = start; i < end; i++) {
    const idx = i * PEAK_STRIDE + channelOffset;
    const peakMax = peaks[idx] ?? 0;
    const peakMin = peaks[idx + 1] ?? 0;
    if (peakMax > max) max = peakMax;
    if (peakMin < min) min = peakMin;
  }

  return { max, min };
}
