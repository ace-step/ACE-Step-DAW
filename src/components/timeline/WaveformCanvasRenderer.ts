import { PEAK_STRIDE } from '../../utils/waveformPeaks';
import type { StretchMode } from '../../types/project';
import { getClipSourceSpan, getClipWaveformLayout } from '../../utils/clipAudio';

export interface WaveformRenderParams {
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
  opacity?: number;
  trackVolume?: number;
}

/**
 * Draw a stereo waveform onto a 2D canvas context.
 *
 * Port of the SVG-based ClipWaveform to Canvas for GPU-accelerated rendering.
 * Follows the same peak-data layout: interleaved [Lmax, Lmin, Rmax, Rmin, ...].
 */
export function drawWaveform(ctx: CanvasRenderingContext2D, params: WaveformRenderParams): void {
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

  if (!peaks || peaks.length === 0 || contentWidth <= 0 || waveformLayout.widthPx <= 0) {
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

  const columnCount = Math.max(1, Math.floor(waveformLayout.widthPx));
  const columnWidth = waveformLayout.widthPx / columnCount;

  // Each channel occupies its own vertical half.
  // Left channel: y = 0..halfH, center at halfH/2
  // Right channel: y = halfH..height, center at halfH + halfH/2
  const halfH = height / 2;
  const scaledAmplitude = (halfH * 0.46) * Math.min(1, trackVolume);

  ctx.save();
  ctx.globalAlpha = opacity;

  // Center divider between channels
  ctx.strokeStyle = color;
  ctx.globalAlpha = opacity * 0.2;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(waveformLayout.leftPx, halfH);
  ctx.lineTo(waveformLayout.leftPx + waveformLayout.widthPx, halfH);
  ctx.stroke();

  ctx.globalAlpha = opacity;

  // Pre-compute per-column min/max once per channel to avoid redundant iterations
  const leftMinMax = computeColumnMinMax(peaks, peakSlice, columnCount, 0);
  const rightMinMax = computeColumnMinMax(peaks, peakSlice, columnCount, 2);

  // Draw filled waveform shapes + peak envelope lines for both channels
  drawChannelFill(ctx, leftMinMax, columnCount, columnWidth, waveformLayout.leftPx,
    halfH / 2, scaledAmplitude, color, 0.6);
  drawChannelFill(ctx, rightMinMax, columnCount, columnWidth, waveformLayout.leftPx,
    halfH + halfH / 2, scaledAmplitude, color, 0.6);

  drawChannelPeakLine(ctx, leftMinMax, columnCount, columnWidth, waveformLayout.leftPx,
    halfH / 2, scaledAmplitude, color, 1.0, 0.8);
  drawChannelPeakLine(ctx, rightMinMax, columnCount, columnWidth, waveformLayout.leftPx,
    halfH + halfH / 2, scaledAmplitude, color, 1.0, 0.8);

  ctx.restore();
}

/** Pre-computed per-column min/max values for one channel. */
interface ColumnMinMax {
  maxValues: Float32Array;
  minValues: Float32Array;
}

/**
 * Pre-compute per-column min/max once per channel.
 * Avoids redundant getMinMaxForColumn calls between fill and peak line drawing.
 */
function computeColumnMinMax(
  peaks: number[],
  peakSlice: { startPeakIdx: number; numBars: number },
  columnCount: number,
  channelOffset: number,
): ColumnMinMax {
  const maxValues = new Float32Array(columnCount);
  const minValues = new Float32Array(columnCount);

  for (let i = 0; i < columnCount; i++) {
    const { max, min } = getMinMaxForColumn(peaks, peakSlice, i, columnCount, channelOffset);
    maxValues[i] = max;
    minValues[i] = min;
  }

  return { maxValues, minValues };
}

/**
 * Draw the filled waveform shape for one channel using pre-computed min/max.
 * Upper contour (max) left-to-right, lower contour (min) right-to-left, then close.
 */
function drawChannelFill(
  ctx: CanvasRenderingContext2D,
  minMax: ColumnMinMax,
  columnCount: number,
  columnWidth: number,
  leftPx: number,
  centerY: number,
  maxAmplitude: number,
  color: string,
  fillOpacity: number,
): void {
  if (columnCount === 0) return;

  ctx.beginPath();

  // Upper contour (max, going upward from center)
  for (let i = 0; i < columnCount; i++) {
    const x = leftPx + (i + 0.5) * columnWidth;
    const yTop = centerY - minMax.maxValues[i] * maxAmplitude;
    if (i === 0) ctx.moveTo(x, yTop);
    else ctx.lineTo(x, yTop);
  }

  // Lower contour (min, going below center) — right to left
  for (let i = columnCount - 1; i >= 0; i--) {
    const x = leftPx + (i + 0.5) * columnWidth;
    const yBottom = centerY - minMax.minValues[i] * maxAmplitude;
    ctx.lineTo(x, yBottom);
  }

  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha *= fillOpacity;
  ctx.fill();
  ctx.globalAlpha /= fillOpacity;
}

/**
 * Draw the peak envelope line (positive peaks only) for one channel using pre-computed min/max.
 */
function drawChannelPeakLine(
  ctx: CanvasRenderingContext2D,
  minMax: ColumnMinMax,
  columnCount: number,
  columnWidth: number,
  leftPx: number,
  centerY: number,
  maxAmplitude: number,
  color: string,
  strokeOpacity: number,
  lineWidth: number,
): void {
  if (columnCount === 0) return;

  ctx.beginPath();
  for (let i = 0; i < columnCount; i++) {
    const x = leftPx + (i + 0.5) * columnWidth;
    const yTop = centerY - minMax.maxValues[i] * maxAmplitude;
    if (i === 0) ctx.moveTo(x, yTop);
    else ctx.lineTo(x, yTop);
  }

  ctx.strokeStyle = color;
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * strokeOpacity;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.globalAlpha = prevAlpha;
}

function getVisiblePeakSlice(
  logicalPeakCount: number,
  audioDuration: number,
  audioOffset: number,
  sourceSpan: number,
): { startPeakIdx: number; numBars: number } {
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
  peakSlice: { startPeakIdx: number; numBars: number },
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
