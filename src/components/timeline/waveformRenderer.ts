/**
 * Pure Canvas 2D waveform renderer.
 *
 * Per-pixel-column vertical bar rendering: for each pixel column, draw a
 * vertical line from min to max peak value. This is the standard technique
 * used by Ableton, Logic, ACE Studio and every professional DAW.
 *
 * Single merged L+R display, centered and mirrored around the midline.
 * Dark waveform on colored clip background for maximum readability.
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
  maxColumns?: number;
}

interface PeakSlice {
  startPeakIdx: number;
  numBars: number;
}

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
  return { startPeakIdx, numBars: Math.max(0, endPeakIdx - startPeakIdx) };
}

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

export function drawCenterDivider(
  ctx: CanvasRenderingContext2D,
  leftPx: number,
  widthPx: number,
  centerY: number,
  color: string,
): void {
  const prevAlpha = ctx.globalAlpha;
  ctx.beginPath();
  ctx.moveTo(leftPx, centerY);
  ctx.lineTo(leftPx + widthPx, centerY);
  ctx.strokeStyle = color;
  ctx.globalAlpha = prevAlpha * 0.15;
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.globalAlpha = prevAlpha;
}

/**
 * Main entry: per-pixel-column vertical bar waveform.
 *
 * For each pixel column, computes the merged L+R min/max and draws a
 * 1px-wide vertical bar from min to max. This produces the crisp, sharp
 * waveform look seen in professional DAWs.
 */
export function drawWaveform(
  ctx: CanvasRenderingContext2D,
  params: WaveformDrawParams,
): void {
  const {
    peaks, audioDuration, audioOffset, clipDuration,
    contentOffset, timeStretchRate, stretchMode,
    width, height, color,
    opacity = 0.9, trackVolume = 1, maxColumns,
  } = params;

  const contentWidth = Math.max(width, 0);
  const clipWindow = {
    startTime: 0, duration: clipDuration, audioDuration,
    audioOffset, contentOffset, timeStretchRate, stretchMode,
  };
  const waveformLayout = getClipWaveformLayout(clipWindow, contentWidth);
  if (peaks.length === 0 || contentWidth <= 0 || waveformLayout.widthPx <= 0) return;

  const logicalPeakCount = Math.floor(peaks.length / PEAK_STRIDE);
  if (logicalPeakCount === 0) return;

  const peakSlice = getVisiblePeakSlice(
    logicalPeakCount, audioDuration, audioOffset, getClipSourceSpan(clipWindow),
  );
  if (peakSlice.numBars === 0) return;

  const rawColumnCount = Math.max(1, Math.floor(waveformLayout.widthPx));
  const columnCount = maxColumns ? Math.min(rawColumnCount, maxColumns) : rawColumnCount;

  // Precompute L and R channels separately
  const leftData = precomputeColumnMinMax(peaks, peakSlice, columnCount, 0);
  const rightData = precomputeColumnMinMax(peaks, peakSlice, columnCount, 2);

  // Dual channel: L in top half, R in bottom half, no overlap.
  // Each channel centered in its own half, amplitude clamped to 88% of half-height.
  const halfHeight = height * 0.5;
  const amplitude = halfHeight * 0.88 * Math.min(1, trackVolume);
  const leftCenterY = halfHeight * 0.5;
  const rightCenterY = height - halfHeight * 0.5;

  ctx.save();
  ctx.globalAlpha = opacity;

  // Center divider between L and R
  drawCenterDivider(ctx, waveformLayout.leftPx, waveformLayout.widthPx, halfHeight, color);

  // Per-pixel-column vertical bars — 1 bar = 1 backing-store pixel.
  // Use integer coordinates exclusively (|0 truncation) for pixel-perfect edges.
  ctx.fillStyle = color;
  const left0 = waveformLayout.leftPx | 0;

  for (let i = 0; i < columnCount; i++) {
    const x = left0 + i;

    // Left channel (top half)
    const lTop = (leftCenterY - leftData.maxArr[i] * amplitude) | 0;
    const lBot = (leftCenterY - leftData.minArr[i] * amplitude) | 0;
    const lH = lBot - lTop;
    if (lH > 0) {
      ctx.fillRect(x, lTop, 1, lH);
    }

    // Right channel (bottom half)
    const rTop = (rightCenterY - rightData.maxArr[i] * amplitude) | 0;
    const rBot = (rightCenterY - rightData.minArr[i] * amplitude) | 0;
    const rH = rBot - rTop;
    if (rH > 0) {
      ctx.fillRect(x, rTop, 1, rH);
    }
  }

  ctx.restore();
}

/**
 * Draw MIDI note rectangles as a thumbnail.
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
  let minPitch = notes[0].pitch;
  let maxPitch = notes[0].pitch;
  for (let i = 1; i < notes.length; i++) {
    const p = notes[i].pitch;
    if (p < minPitch) minPitch = p;
    if (p > maxPitch) maxPitch = p;
  }
  const range = Math.max(maxPitch - minPitch, 12);
  const pad = 2;

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
