/**
 * Pure Canvas 2D waveform renderer — professional DAW style.
 *
 * Dual-channel (L/R) display, each channel in its own half of the clip body,
 * clearly separated by a center divider. No overlap between channels.
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

/**
 * Draw a single channel waveform as a filled shape.
 * The waveform is drawn mirrored around centerY: max goes up, min goes down.
 * Amplitude is clamped to stay within the channel's half-height so channels
 * never overlap.
 */
function drawChannelFill(
  ctx: CanvasRenderingContext2D,
  columnCount: number,
  columnWidth: number,
  leftPx: number,
  centerY: number,
  halfHeight: number,
  maxArr: Float64Array,
  minArr: Float64Array,
  fillColor: string,
  fillAlpha: number,
): void {
  if (columnCount <= 0) return;

  const prevAlpha = ctx.globalAlpha;

  ctx.beginPath();
  // Upper contour (max, goes upward from center)
  for (let i = 0; i < columnCount; i++) {
    const x = leftPx + (i + 0.5) * columnWidth;
    // Clamp to half-height so it never crosses into the other channel
    const y = centerY - Math.min(maxArr[i], 1) * halfHeight;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  // Lower contour (min, goes downward from center)
  for (let i = columnCount - 1; i >= 0; i--) {
    const x = leftPx + (i + 0.5) * columnWidth;
    const y = centerY - Math.max(minArr[i], -1) * halfHeight;
    ctx.lineTo(x, y);
  }
  ctx.closePath();

  ctx.globalAlpha = prevAlpha * fillAlpha;
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.globalAlpha = prevAlpha;
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
  ctx.globalAlpha = prevAlpha * 0.2;
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.globalAlpha = prevAlpha;
}

/**
 * Main entry: dual-channel waveform, L top half, R bottom half.
 * Each channel is constrained to its own half — no overlap.
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
  const columnWidth = waveformLayout.widthPx / columnCount;

  const leftData = precomputeColumnMinMax(peaks, peakSlice, columnCount, 0);
  const rightData = precomputeColumnMinMax(peaks, peakSlice, columnCount, 2);

  // Each channel gets exactly half the height. halfHeight is the max amplitude
  // a channel can use — 90% of its half to leave a small gap at the divider.
  const channelHalfHeight = height * 0.5;
  const amplitude = channelHalfHeight * 0.88 * Math.min(1, trackVolume);

  const leftCenterY = channelHalfHeight * 0.5;      // center of top half
  const rightCenterY = height - channelHalfHeight * 0.5; // center of bottom half

  ctx.save();
  ctx.globalAlpha = opacity;

  // Center divider between L and R
  drawCenterDivider(ctx, waveformLayout.leftPx, waveformLayout.widthPx, height * 0.5, color);

  // Left channel (top half)
  drawChannelFill(
    ctx, columnCount, columnWidth, waveformLayout.leftPx,
    leftCenterY, amplitude, leftData.maxArr, leftData.minArr,
    color, 0.85,
  );

  // Right channel (bottom half)
  drawChannelFill(
    ctx, columnCount, columnWidth, waveformLayout.leftPx,
    rightCenterY, amplitude, rightData.maxArr, rightData.minArr,
    color, 0.85,
  );

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
