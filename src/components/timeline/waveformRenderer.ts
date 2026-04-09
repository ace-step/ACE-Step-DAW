/**
 * Professional waveform renderer — dual mode (Ableton / ACE Studio style).
 *
 * Mode 1 (zoomed out): Filled peak envelope — min/max area shows dynamics.
 * Mode 2 (zoomed in): Thin sample line — actual audio waveform curve.
 * Mode auto-switches based on samples-per-pixel ratio.
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
  /** Raw audio samples for sample-level rendering when zoomed in. */
  rawSamples?: { left: Float32Array; right: Float32Array; sampleRate: number } | null;
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
 * Draw a channel as filled peak envelope (zoomed-out mode).
 * Upper contour (max) → lower contour (min) reversed → fill.
 */
function drawChannelPeakFill(
  ctx: CanvasRenderingContext2D,
  columnCount: number,
  colW: number,
  leftPx: number,
  centerY: number,
  amplitude: number,
  maxArr: Float64Array,
  minArr: Float64Array,
  color: string,
  fillAlpha: number,
): void {
  const prevAlpha = ctx.globalAlpha;

  // Filled envelope
  ctx.beginPath();
  for (let i = 0; i < columnCount; i++) {
    const x = leftPx + (i + 0.5) * colW;
    const y = centerY - maxArr[i] * amplitude;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  for (let i = columnCount - 1; i >= 0; i--) {
    ctx.lineTo(leftPx + (i + 0.5) * colW, centerY - minArr[i] * amplitude);
  }
  ctx.closePath();
  ctx.globalAlpha = prevAlpha * fillAlpha;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = prevAlpha;

  // Thin outline stroke on top for crispness
  ctx.beginPath();
  for (let i = 0; i < columnCount; i++) {
    const x = leftPx + (i + 0.5) * colW;
    const y = centerY - maxArr[i] * amplitude;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

/**
 * Draw a channel as thin sample line (zoomed-in mode).
 * Connects individual audio samples as a continuous curve.
 */
function drawChannelSampleLine(
  ctx: CanvasRenderingContext2D,
  samples: Float32Array,
  sampleRate: number,
  audioOffset: number,
  clipDuration: number,
  leftPx: number,
  widthPx: number,
  centerY: number,
  amplitude: number,
  color: string,
): void {
  const startSample = Math.max(0, Math.floor(audioOffset * sampleRate));
  const endSample = Math.min(samples.length, Math.ceil((audioOffset + clipDuration) * sampleRate));
  const sampleCount = endSample - startSample;
  if (sampleCount <= 0) return;

  const pxPerSample = widthPx / sampleCount;

  ctx.beginPath();
  for (let i = 0; i < sampleCount; i++) {
    const x = leftPx + i * pxPerSample;
    const y = centerY - samples[startSample + i] * amplitude;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();
}

/**
 * Main entry: dual-mode waveform rendering.
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
    rawSamples,
  } = params;

  const contentWidth = Math.max(width, 0);
  const clipWindow = {
    startTime: 0, duration: clipDuration, audioDuration,
    audioOffset, contentOffset, timeStretchRate, stretchMode,
  };
  const waveformLayout = getClipWaveformLayout(clipWindow, contentWidth);
  if (contentWidth <= 0 || waveformLayout.widthPx <= 0) return;

  // Nothing to draw if no peaks and no raw samples
  const hasPeaks = peaks.length > 0;
  const hasSamples = rawSamples && rawSamples.sampleRate > 0;
  if (!hasPeaks && !hasSamples) return;

  // Layout
  const halfHeight = height * 0.5;
  const amplitude = halfHeight * 0.85 * Math.min(1, trackVolume);
  const leftCenterY = halfHeight * 0.5;
  const rightCenterY = height - halfHeight * 0.5;

  ctx.save();
  ctx.globalAlpha = opacity;

  // Center divider
  drawCenterDivider(ctx, waveformLayout.leftPx, waveformLayout.widthPx, halfHeight, color);

  // Determine mode: sample line vs peak envelope
  const useSampleMode = rawSamples
    && rawSamples.sampleRate > 0
    && (audioDuration * rawSamples.sampleRate / waveformLayout.widthPx) <= 8;

  if (useSampleMode && rawSamples) {
    // Mode 2: thin sample line (zoomed in)
    drawChannelSampleLine(
      ctx, rawSamples.left, rawSamples.sampleRate, audioOffset, clipDuration,
      waveformLayout.leftPx, waveformLayout.widthPx, leftCenterY, amplitude, color,
    );
    drawChannelSampleLine(
      ctx, rawSamples.right, rawSamples.sampleRate, audioOffset, clipDuration,
      waveformLayout.leftPx, waveformLayout.widthPx, rightCenterY, amplitude, color,
    );
  } else if (peaks.length > 0) {
    // Mode 1: filled peak envelope (zoomed out)
    const logicalPeakCount = Math.floor(peaks.length / PEAK_STRIDE);
    if (logicalPeakCount === 0) { ctx.restore(); return; }

    const peakSlice = getVisiblePeakSlice(
      logicalPeakCount, audioDuration, audioOffset, getClipSourceSpan(clipWindow),
    );
    if (peakSlice.numBars === 0) { ctx.restore(); return; }

    const rawColumnCount = Math.max(1, Math.floor(waveformLayout.widthPx));
    const columnCount = maxColumns ? Math.min(rawColumnCount, maxColumns) : rawColumnCount;
    const colW = waveformLayout.widthPx / columnCount;

    const leftData = precomputeColumnMinMax(peaks, peakSlice, columnCount, 0);
    const rightData = precomputeColumnMinMax(peaks, peakSlice, columnCount, 2);

    drawChannelPeakFill(ctx, columnCount, colW, waveformLayout.leftPx,
      leftCenterY, amplitude, leftData.maxArr, leftData.minArr, color, 0.7);
    drawChannelPeakFill(ctx, columnCount, colW, waveformLayout.leftPx,
      rightCenterY, amplitude, rightData.maxArr, rightData.minArr, color, 0.7);
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
