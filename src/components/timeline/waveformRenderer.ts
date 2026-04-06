/**
 * Pure Canvas 2D drawing functions for waveform rendering.
 * Replaces SVG path-based waveforms with direct Canvas drawing
 * for better performance with many tracks.
 */

import { PEAK_STRIDE } from '../../utils/waveformPeaks';
import { getClipSourceSpan, getClipWaveformLayout } from '../../utils/clipAudio';
import type { StretchMode } from '../../types/project';

export interface WaveformDrawParams {
  peaks: number[];
  audioDuration: number;
  audioOffset: number;
  clipDuration: number;
  contentOffset?: number;
  timeStretchRate?: number;
  stretchMode?: StretchMode;
  width: number;
  height: number;
  color: string;
  opacity?: number;
  trackVolume?: number;
  /** Max columns to compute (limits work when backing store is capped). */
  maxColumns?: number;
}

interface PeakSlice {
  startPeakIdx: number;
  numBars: number;
}

/**
 * Compute the visible peak range for the current clip window.
 */
export function getVisiblePeakSlice(
  logicalPeakCount: number,
  audioDuration: number,
  audioOffset: number,
  sourceSpan: number,
): PeakSlice {
  if (logicalPeakCount === 0 || audioDuration <= 0) {
    return { startPeakIdx: 0, numBars: 0 };
  }

  const clampedAudioOffset = Math.min(Math.max(0, audioOffset), audioDuration);
  const startPeakIdx = Math.floor((clampedAudioOffset / audioDuration) * logicalPeakCount);
  const visibleAudioSec = Math.min(sourceSpan, Math.max(0, audioDuration - clampedAudioOffset));
  const endPeakIdx = Math.min(
    Math.ceil(((clampedAudioOffset + visibleAudioSec) / audioDuration) * logicalPeakCount),
    logicalPeakCount,
  );

  return {
    startPeakIdx,
    numBars: Math.max(0, endPeakIdx - startPeakIdx),
  };
}

/**
 * For a given display column, find the min and max sample values
 * across the corresponding peak range for a specific channel.
 */
export function getMinMaxForColumn(
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

/**
 * Precompute per-column min/max values for a channel.
 * Avoids redundant scans when drawing both filled shape and envelope line.
 */
export function precomputeColumnMinMax(
  peaks: number[],
  peakSlice: PeakSlice,
  columnCount: number,
  channelOffset: number,
): { maxArr: Float64Array; minArr: Float64Array } {
  const maxArr = new Float64Array(columnCount);
  const minArr = new Float64Array(columnCount);
  for (let i = 0; i < columnCount; i++) {
    const { max, min } = getMinMaxForColumn(peaks, peakSlice, i, columnCount, channelOffset);
    maxArr[i] = max;
    minArr[i] = min;
  }
  return { maxArr, minArr };
}

/**
 * Draw a single channel's waveform as a filled shape on Canvas.
 * Upper contour (max) from left to right, lower contour (min) right to left.
 */
export function drawChannelWaveform(
  ctx: CanvasRenderingContext2D,
  columnCount: number,
  columnWidth: number,
  leftPx: number,
  centerY: number,
  maxAmplitude: number,
  color: string,
  fillOpacity: number,
  maxArr: Float64Array,
  minArr: Float64Array,
): void {
  if (columnCount <= 0) return;

  const previousAlpha = ctx.globalAlpha;
  ctx.beginPath();

  // Upper contour (max values)
  for (let i = 0; i < columnCount; i++) {
    const x = leftPx + (i + 0.5) * columnWidth;
    const yTop = centerY - maxArr[i] * maxAmplitude;
    if (i === 0) {
      ctx.moveTo(x, yTop);
    } else {
      ctx.lineTo(x, yTop);
    }
  }

  // Lower contour (min values, right to left)
  for (let i = columnCount - 1; i >= 0; i--) {
    const x = leftPx + (i + 0.5) * columnWidth;
    const yBottom = centerY - minArr[i] * maxAmplitude;
    ctx.lineTo(x, yBottom);
  }

  ctx.closePath();
  ctx.globalAlpha = previousAlpha * fillOpacity;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = previousAlpha;
}

/**
 * Draw the peak envelope highlight line (positive peaks only).
 */
export function drawPeakEnvelopeLine(
  ctx: CanvasRenderingContext2D,
  columnCount: number,
  columnWidth: number,
  leftPx: number,
  centerY: number,
  maxAmplitude: number,
  color: string,
  lineWidth: number,
  maxArr: Float64Array,
): void {
  if (columnCount <= 0) return;

  ctx.beginPath();

  for (let i = 0; i < columnCount; i++) {
    const x = leftPx + (i + 0.5) * columnWidth;
    const yTop = centerY - maxArr[i] * maxAmplitude;
    if (i === 0) {
      ctx.moveTo(x, yTop);
    } else {
      ctx.lineTo(x, yTop);
    }
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

/**
 * Draw the center divider line between left and right channels.
 */
export function drawCenterDivider(
  ctx: CanvasRenderingContext2D,
  leftPx: number,
  widthPx: number,
  centerY: number,
  color: string,
): void {
  const previousAlpha = ctx.globalAlpha;
  ctx.beginPath();
  ctx.moveTo(leftPx, centerY);
  ctx.lineTo(leftPx + widthPx, centerY);
  ctx.strokeStyle = color;
  ctx.globalAlpha = previousAlpha * 0.2;
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.globalAlpha = previousAlpha;
}

/**
 * Main drawing entry point: renders a complete stereo waveform on a Canvas.
 * This is the Canvas equivalent of the SVG-based ClipWaveform component.
 */
export function drawWaveform(
  ctx: CanvasRenderingContext2D,
  params: WaveformDrawParams,
): void {
  const {
    peaks,
    audioDuration,
    audioOffset,
    clipDuration,
    contentOffset,
    timeStretchRate,
    stretchMode,
    width,
    height,
    color,
    opacity = 0.9,
    trackVolume = 1,
    maxColumns,
  } = params;

  const contentWidth = Math.max(width, 0);
  const clipWindow = {
    startTime: 0,
    duration: clipDuration,
    audioDuration,
    audioOffset,
    contentOffset,
    timeStretchRate,
    stretchMode,
  };
  const waveformLayout = getClipWaveformLayout(clipWindow, contentWidth);

  if (peaks.length === 0 || contentWidth <= 0 || waveformLayout.widthPx <= 0) {
    return;
  }

  const logicalPeakCount = Math.floor(peaks.length / PEAK_STRIDE);
  if (logicalPeakCount === 0) return;

  const peakSlice = getVisiblePeakSlice(
    logicalPeakCount,
    audioDuration,
    audioOffset,
    getClipSourceSpan(clipWindow),
  );
  if (peakSlice.numBars === 0) return;

  // Limit columns to backing store resolution when capped at 16384px
  const rawColumnCount = Math.max(1, Math.floor(waveformLayout.widthPx));
  const columnCount = maxColumns ? Math.min(rawColumnCount, maxColumns) : rawColumnCount;
  const columnWidth = waveformLayout.widthPx / columnCount;

  // Scale amplitude by track volume (visual feedback of output level).
  // Each channel occupies half the height, centered at 0.25/0.75.
  // Max amplitude = 0.23 * height matches the SVG renderer (23 units in 100px viewBox).
  const scaledAmplitude = (height * 0.23) * Math.min(1, trackVolume);

  // Channel center Y positions (50% for each channel)
  const leftCenterY = height * 0.25;
  const rightCenterY = height * 0.75;

  // Precompute per-column min/max for both channels (avoids redundant peak scans)
  const leftMinMax = precomputeColumnMinMax(peaks, peakSlice, columnCount, 0);
  const rightMinMax = precomputeColumnMinMax(peaks, peakSlice, columnCount, 2);

  ctx.save();
  ctx.globalAlpha = opacity;

  // Center divider
  drawCenterDivider(ctx, waveformLayout.leftPx, waveformLayout.widthPx, height * 0.5, color);

  // Filled waveform shapes
  drawChannelWaveform(
    ctx, columnCount, columnWidth, waveformLayout.leftPx,
    leftCenterY, scaledAmplitude, color, 0.6,
    leftMinMax.maxArr, leftMinMax.minArr,
  );
  drawChannelWaveform(
    ctx, columnCount, columnWidth, waveformLayout.leftPx,
    rightCenterY, scaledAmplitude, color, 0.6,
    rightMinMax.maxArr, rightMinMax.minArr,
  );

  // Peak envelope lines
  const lineWidth = Math.max(0.5, height / 125);
  drawPeakEnvelopeLine(
    ctx, columnCount, columnWidth, waveformLayout.leftPx,
    leftCenterY, scaledAmplitude, color, lineWidth, leftMinMax.maxArr,
  );
  drawPeakEnvelopeLine(
    ctx, columnCount, columnWidth, waveformLayout.leftPx,
    rightCenterY, scaledAmplitude, color, lineWidth, rightMinMax.maxArr,
  );

  ctx.restore();
}

/**
 * Draw MIDI note rectangles as a thumbnail representation.
 */
export function drawMidiThumbnail(
  ctx: CanvasRenderingContext2D,
  notes: Array<{ pitch: number; startBeat: number; durationBeats: number }>,
  width: number,
  height: number,
  duration: number,
  bpm: number,
  color: string,
  opacity: number = 0.7,
): void {
  if (notes.length === 0 || width <= 0 || height <= 0 || bpm <= 0 || duration <= 0) return;

  const secPerBeat = 60 / bpm;
  // Compute min/max pitch in a single loop (avoids spread argument limit on large arrays)
  let minPitch = notes[0].pitch;
  let maxPitch = notes[0].pitch;
  for (let i = 1; i < notes.length; i++) {
    const p = notes[i].pitch;
    if (p < minPitch) minPitch = p;
    if (p > maxPitch) maxPitch = p;
  }
  const range = Math.max(maxPitch - minPitch, 12);
  const pad = 2;

  // Density-adaptive: skip overlapping notes at narrow widths
  const maxNotes = Math.max(20, Math.floor(width / 2));
  const filteredNotes = notes.length > maxNotes
    ? notes.filter((_, i) => i % Math.ceil(notes.length / maxNotes) === 0)
    : notes;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;

  for (const note of filteredNotes) {
    const x = (note.startBeat * secPerBeat / duration) * width;
    const noteWidth = Math.max((note.durationBeats * secPerBeat / duration) * width, 1);
    const y = height - ((note.pitch - minPitch + pad) / (range + pad * 2)) * height;
    const noteHeight = Math.max(height / (range + pad * 2), 2);

    // Rounded rectangle with fallback for browsers without roundRect
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      const r = Math.min(0.5, noteWidth / 2, noteHeight / 2);
      ctx.roundRect(x, y, noteWidth, noteHeight, r);
    } else {
      ctx.rect(x, y, noteWidth, noteHeight);
    }
    ctx.fill();
  }

  ctx.restore();
}
