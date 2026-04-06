/**
 * waveformRenderer — Canvas-based waveform drawing for timeline clips.
 *
 * Replaces the SVG-based ClipWaveform paths with direct Canvas 2D calls
 * for significantly better performance with many tracks/clips.
 *
 * Mirrors the same visual output as the SVG version:
 * - Stereo waveform (left channel top half, right channel bottom half)
 * - Filled waveform shapes with peak envelope highlight lines
 * - Center divider line between channels
 */

import { PEAK_STRIDE } from '../../utils/waveformPeaks';
import { getClipSourceSpan, getClipWaveformLayout } from '../../utils/clipAudio';
import type { StretchMode } from '../../types/project';

export interface WaveformRenderParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  peaks: number[];
  audioDuration: number;
  audioOffset: number;
  clipDuration: number;
  contentOffset?: number;
  timeStretchRate?: number;
  stretchMode?: StretchMode;
  color: string;
  trackVolume?: number;
  opacity?: number;
}

export interface VisiblePeakSlice {
  startPeakIdx: number;
  numBars: number;
}

/**
 * Compute which range of logical peaks is visible for the current clip window.
 */
export function getVisiblePeakSlice(
  logicalPeakCount: number,
  audioDuration: number,
  audioOffset: number,
  sourceSpan: number,
): VisiblePeakSlice {
  if (logicalPeakCount === 0 || audioDuration <= 0) {
    return { startPeakIdx: 0, numBars: 0 };
  }

  const startPeakIdx = Math.min(Math.max(0, Math.floor((audioOffset / audioDuration) * logicalPeakCount)), logicalPeakCount);
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

/**
 * For a given display column, find the min and max sample values across
 * the corresponding peak range for a specific channel.
 */
export function getMinMaxForColumn(
  peaks: number[],
  peakSlice: VisiblePeakSlice,
  columnIndex: number,
  columnCount: number,
  channelOffset: number,
): { max: number; min: number } {
  if (columnCount <= 0) {
    return { max: 0, min: 0 };
  }
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

/**
 * Precompute min/max for all columns of a channel.
 * Avoids triple-scanning the same peak range (fill upper, fill lower, envelope).
 */
function precomputeChannelMinMax(
  peaks: number[],
  peakSlice: VisiblePeakSlice,
  columnCount: number,
  channelOffset: number,
): Array<{ max: number; min: number }> {
  const result: Array<{ max: number; min: number }> = new Array(columnCount);
  for (let i = 0; i < columnCount; i++) {
    result[i] = getMinMaxForColumn(peaks, peakSlice, i, columnCount, channelOffset);
  }
  return result;
}

/**
 * Draw one channel's waveform (filled shape + peak envelope) onto the canvas.
 * Uses precomputed min/max to avoid redundant peak scans.
 */
function drawChannelComplete(
  ctx: CanvasRenderingContext2D,
  columnMinMax: Array<{ max: number; min: number }>,
  columnCount: number,
  columnWidth: number,
  leftPx: number,
  centerY: number,
  maxAmplitude: number,
  color: string,
  fillOpacity: number,
  strokeOpacity: number,
  lineWidth: number,
): void {
  if (columnCount <= 0) return;

  // --- Filled waveform shape ---
  ctx.beginPath();

  // Upper contour (max values, left to right)
  for (let i = 0; i < columnCount; i++) {
    const x = leftPx + (i + 0.5) * columnWidth;
    const yTop = centerY - columnMinMax[i].max * maxAmplitude;
    if (i === 0) ctx.moveTo(x, yTop);
    else ctx.lineTo(x, yTop);
  }

  // Lower contour (min values, right to left)
  for (let i = columnCount - 1; i >= 0; i--) {
    const x = leftPx + (i + 0.5) * columnWidth;
    const yBottom = centerY - columnMinMax[i].min * maxAmplitude;
    ctx.lineTo(x, yBottom);
  }

  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = fillOpacity;
  ctx.fill();

  // --- Peak envelope highlight line ---
  ctx.beginPath();
  for (let i = 0; i < columnCount; i++) {
    const x = leftPx + (i + 0.5) * columnWidth;
    const yTop = centerY - columnMinMax[i].max * maxAmplitude;
    if (i === 0) ctx.moveTo(x, yTop);
    else ctx.lineTo(x, yTop);
  }

  ctx.strokeStyle = color;
  ctx.globalAlpha = strokeOpacity;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/**
 * Main entry point: draw a stereo waveform onto a canvas context.
 *
 * Replicates the visual output of the SVG-based ClipWaveform component:
 * - Two channels vertically stacked (left at 25%, right at 75%)
 * - Filled waveform shapes with 60% opacity
 * - Peak envelope lines at full opacity
 * - Center divider line at 50%
 */
export function drawWaveform(params: WaveformRenderParams): void {
  const {
    ctx,
    width,
    height,
    peaks,
    audioDuration,
    audioOffset,
    clipDuration,
    contentOffset,
    timeStretchRate,
    stretchMode,
    color,
    trackVolume = 1,
    opacity = 0.6,
  } = params;

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

  if (!peaks || peaks.length === 0 || width <= 0 || waveformLayout.widthPx <= 0) {
    return;
  }

  const logicalPeakCount = Math.floor(peaks.length / PEAK_STRIDE);
  if (logicalPeakCount === 0) return;

  const peakSlice = getVisiblePeakSlice(logicalPeakCount, audioDuration, audioOffset, getClipSourceSpan(clipWindow));
  if (peakSlice.numBars === 0) return;

  const columnCount = Math.max(1, Math.floor(waveformLayout.widthPx));
  const columnWidth = waveformLayout.widthPx / columnCount;
  const scaledAmplitude = (height * 0.23) * Math.min(1, trackVolume);

  // Apply opacity as overall multiplier (matches SVG opacityClassName behavior).
  // Internal opacities: fill 0.6, stroke 1.0, divider 0.2 — all scaled by the overall opacity.
  const fillAlpha = 0.6 * opacity;
  const strokeAlpha = 1.0 * opacity;
  const dividerAlpha = 0.2 * opacity;

  // Scale line widths to match SVG viewBox="0 0 width 100" proportions.
  // The SVG strokeWidth values (0.5, 0.8) were in viewBox units that scaled with height.
  const viewBoxScale = height / 100;

  // Center divider
  const centerDividerY = height * 0.5;
  ctx.strokeStyle = color;
  ctx.globalAlpha = dividerAlpha;
  ctx.lineWidth = 0.5 * viewBoxScale;
  ctx.beginPath();
  ctx.moveTo(waveformLayout.leftPx, centerDividerY);
  ctx.lineTo(waveformLayout.leftPx + waveformLayout.widthPx, centerDividerY);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Precompute min/max for both channels (single scan per channel)
  const leftMinMax = precomputeChannelMinMax(peaks, peakSlice, columnCount, 0);
  const rightMinMax = precomputeChannelMinMax(peaks, peakSlice, columnCount, 2);

  // Left channel (centered at 25%) — fill + envelope in one pass
  drawChannelComplete(
    ctx, leftMinMax, columnCount, columnWidth,
    waveformLayout.leftPx, height * 0.25, scaledAmplitude, color, fillAlpha, strokeAlpha, 0.8 * viewBoxScale,
  );

  // Right channel (centered at 75%) — fill + envelope in one pass
  drawChannelComplete(
    ctx, rightMinMax, columnCount, columnWidth,
    waveformLayout.leftPx, height * 0.75, scaledAmplitude, color, fillAlpha, strokeAlpha, 0.8 * viewBoxScale,
  );
}

export interface MidiThumbnailRenderParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  notes: Array<{ pitch: number; startBeat: number; durationBeats: number }>;
  duration: number;
  bpm: number;
  color: string;
}

/**
 * Draw a MIDI note thumbnail onto a canvas context.
 * Replaces the SVG-based ClipMidiThumbnail.
 */
export function drawMidiThumbnail(params: MidiThumbnailRenderParams): void {
  const { ctx, width, height, notes, duration, bpm, color } = params;

  if (notes.length === 0 || width <= 0 || height <= 0 || duration <= 0) return;

  const secPerBeat = 60 / bpm;
  const pitches = notes.map((n) => n.pitch);
  const minPitch = Math.min(...pitches);
  const maxPitch = Math.max(...pitches);
  const range = Math.max(maxPitch - minPitch, 12);
  const pad = 2;

  // Zoom-adaptive density: skip notes that would overlap at narrow widths
  const maxNotes = Math.max(20, Math.floor(width / 2));
  const filteredNotes = notes.length > maxNotes
    ? notes.filter((_, i) => i % Math.ceil(notes.length / maxNotes) === 0)
    : notes;

  ctx.fillStyle = color;
  ctx.globalAlpha = 0.7;

  // Detect roundRect support (missing in older Safari)
  const hasRoundRect = typeof ctx.roundRect === 'function';

  for (const note of filteredNotes) {
    const x = (note.startBeat * secPerBeat / duration) * width;
    const noteWidth = Math.max((note.durationBeats * secPerBeat / duration) * width, 1);
    const y = height - ((note.pitch - minPitch + pad) / (range + pad * 2)) * height;
    const noteHeight = Math.max(height / (range + pad * 2), 2);

    ctx.beginPath();
    if (hasRoundRect) {
      ctx.roundRect(x, y, noteWidth, noteHeight, Math.max(0.5, height / 200));
    } else {
      ctx.rect(x, y, noteWidth, noteHeight);
    }
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}
