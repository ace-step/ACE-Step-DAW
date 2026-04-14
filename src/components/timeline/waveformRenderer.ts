/**
 * DAW-standard waveform renderer.
 *
 * Renders per-pixel-column min-max bars (fillRect) — the same technique used by
 * Ableton, peaks.js, wavesurfer.js, and every professional DAW. Each pixel column
 * shows the full dynamic range of samples in that column's time window.
 *
 * When zoomed in past sample-level (< ~8 samples per pixel), switches to a
 * continuous lineTo curve connecting actual audio samples.
 *
 * All drawing is mono-merged (max of L/R channels) for arrangement timeline view.
 */

import { PEAK_STRIDE } from '../../utils/waveformPeaks';
import { getClipSourceSpan, getClipWaveformLayout } from '../../utils/clipAudio';
import type { Clip, StretchMode } from '../../types/project';
import { evaluateBezierFadeGain } from '../../utils/clipFade';

/** Samples-per-pixel where we start blending in sample line. */
const BLEND_START = 16;
/** Samples-per-pixel where sample line is fully visible. */
const BLEND_END = 4;

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
  rawSamples?: { left: Float32Array; right: Float32Array; sampleRate: number } | null;
  /** Fade envelope for amplitude-modulating the waveform per pixel column. */
  fadeEnvelope?: FadeEnvelope;
}

/**
 * Per-pixel-column fade gain envelope, expressed in CSS pixels of the
 * full clip width. Both fade widths are non-negative and clamped so that
 * `fadeInPx + fadeOutPx <= totalWidthPx`. Curve names follow the project's
 * `fadeInCurve` / `fadeOutCurve` union type.
 */
export interface FadeEnvelope {
  totalWidthPx: number;
  fadeInPx: number;
  fadeOutPx: number;
  fadeInCurve: 'linear' | 'exponential' | 'equal-power';
  fadeOutCurve: 'linear' | 'exponential' | 'equal-power';
  /** Optional bezier control point overriding `fadeInCurve`. */
  fadeInCurvePoint?: Clip['fadeInCurvePoint'];
  /** Optional bezier control point overriding `fadeOutCurve`. */
  fadeOutCurvePoint?: Clip['fadeOutCurvePoint'];
  /** Optional pixel offset applied before the envelope is sampled.
   *  Used by chunked canvases that draw a sub-range of the full clip. */
  offsetPx?: number;
}

/**
 * Returns the fade gain ∈ [0, 1] at a given pixel column relative to the
 * envelope's total clip width. Outside the fade-in / fade-out regions the
 * gain is exactly 1 so the rest of the clip renders at full amplitude.
 *
 * When a bezier curve point is present in the envelope, the bezier is the
 * source of truth (matches what the audio engine will play); otherwise the
 * preset curve is used.
 */
export function fadeGainAtPixel(env: FadeEnvelope | undefined, pixelX: number): number {
  if (!env || env.totalWidthPx <= 0) return 1;
  const x = pixelX + (env.offsetPx ?? 0);
  if (env.fadeInPx > 0 && x < env.fadeInPx) {
    const progress = Math.max(0, Math.min(1, x / env.fadeInPx));
    if (env.fadeInCurvePoint) {
      return evaluateBezierFadeGain(env.fadeInCurvePoint, 0, 1, progress);
    }
    return curveValue(env.fadeInCurve, 0, 1, progress);
  }
  const fadeOutStart = env.totalWidthPx - env.fadeOutPx;
  if (env.fadeOutPx > 0 && x > fadeOutStart) {
    const progress = Math.max(0, Math.min(1, (x - fadeOutStart) / env.fadeOutPx));
    if (env.fadeOutCurvePoint) {
      return evaluateBezierFadeGain(env.fadeOutCurvePoint, 1, 0, progress);
    }
    return curveValue(env.fadeOutCurve, 1, 0, progress);
  }
  return 1;
}

function curveValue(
  curve: 'linear' | 'exponential' | 'equal-power',
  from: number,
  to: number,
  progress: number,
): number {
  const t = Math.max(0, Math.min(1, progress));
  if (curve === 'equal-power') {
    return from < to ? Math.sin((t * Math.PI) / 2) : Math.cos((t * Math.PI) / 2);
  }
  if (curve === 'exponential') {
    if (from < to) return t === 0 ? 0 : Math.pow(t, 2);
    return t === 1 ? 0 : Math.pow(1 - t, 2);
  }
  return from + (to - from) * t;
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
 * Merge L/R peak data into mono: max(Lmax, Rmax), min(Lmin, Rmin).
 */
export function precomputeMergedMonoMinMax(
  peaks: number[],
  peakSlice: PeakSlice,
  columnCount: number,
): { maxArr: Float64Array; minArr: Float64Array } {
  const left = precomputeColumnMinMax(peaks, peakSlice, columnCount, 0);
  const right = precomputeColumnMinMax(peaks, peakSlice, columnCount, 2);
  const maxArr = new Float64Array(columnCount);
  const minArr = new Float64Array(columnCount);
  for (let i = 0; i < columnCount; i++) {
    maxArr[i] = Math.max(left.maxArr[i], right.maxArr[i]);
    minArr[i] = Math.min(left.minArr[i], right.minArr[i]);
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
 * Draw per-pixel-column min-max bars (fillRect).
 * This is THE standard DAW waveform rendering technique.
 * Each pixel column gets one vertical bar from min to max.
 */
function drawMinMaxBars(
  ctx: CanvasRenderingContext2D,
  columnCount: number,
  leftPx: number,
  centerY: number,
  amplitude: number,
  maxArr: Float64Array,
  minArr: Float64Array,
  color: string,
  barAlpha: number,
  colW: number = 1,
  fadeEnvelope?: FadeEnvelope,
): void {
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * barAlpha;
  ctx.fillStyle = color;

  for (let i = 0; i < columnCount; i++) {
    const x = leftPx + i * colW;
    const gain = fadeGainAtPixel(fadeEnvelope, x);
    const scaled = amplitude * gain;
    const yTop = centerY - maxArr[i] * scaled;
    const yBottom = centerY - minArr[i] * scaled;
    const barHeight = Math.max(yBottom - yTop, 0.5);
    ctx.fillRect(x, yTop, Math.max(colW, 0.5), barHeight);
  }

  ctx.globalAlpha = prevAlpha;
}

/**
 * Draw mono sample line (zoomed-in mode).
 * Averages L/R channels, connects as continuous lineTo curve.
 */
function drawMonoSampleLine(
  ctx: CanvasRenderingContext2D,
  left: Float32Array,
  right: Float32Array,
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
  const endSample = Math.min(left.length, Math.ceil((audioOffset + clipDuration) * sampleRate));
  const sampleCount = endSample - startSample;
  if (sampleCount <= 0) return;

  const pxPerSample = widthPx / sampleCount;

  ctx.beginPath();
  for (let i = 0; i < sampleCount; i++) {
    const x = leftPx + i * pxPerSample;
    const mono = (left[startSample + i] + right[startSample + i]) * 0.5;
    const y = centerY - mono * amplitude;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();
}

/**
 * Compute blend factor for cross-fade between peak bars and sample line.
 * Returns 0 (pure bars) to 1 (pure sample line).
 */
export function computeBlendFactor(samplesPerPixel: number): number {
  if (samplesPerPixel >= BLEND_START) return 0;
  if (samplesPerPixel <= BLEND_END) return 1;
  return (BLEND_START - samplesPerPixel) / (BLEND_START - BLEND_END);
}

/**
 * Main entry: DAW-standard waveform rendering.
 * Mono-merged, per-pixel-column min-max bars with sample-line crossfade.
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
    fadeEnvelope,
  } = params;

  const contentWidth = Math.max(width, 0);
  const clipWindow = {
    startTime: 0, duration: clipDuration, audioDuration,
    audioOffset, contentOffset, timeStretchRate, stretchMode,
  };
  const waveformLayout = getClipWaveformLayout(clipWindow, contentWidth);
  if (contentWidth <= 0 || waveformLayout.widthPx <= 0) return;

  const hasPeaks = peaks.length > 0;
  const hasSamples = rawSamples && rawSamples.sampleRate > 0;
  if (!hasPeaks && !hasSamples) return;

  // Mono layout: centered, using full height
  const centerY = height * 0.5;
  const amplitude = centerY * 0.88 * Math.min(1, trackVolume);

  ctx.save();
  ctx.globalAlpha = opacity;

  // Compute blend factor for smooth transition
  const samplesPerPixel = hasSamples
    ? audioDuration * rawSamples!.sampleRate / waveformLayout.widthPx
    : Infinity;
  const blendFactor = computeBlendFactor(samplesPerPixel);

  // Draw min-max bars (when blend < 1)
  if (blendFactor < 1 && peaks.length > 0) {
    const logicalPeakCount = Math.floor(peaks.length / PEAK_STRIDE);
    if (logicalPeakCount > 0) {
      const peakSlice = getVisiblePeakSlice(
        logicalPeakCount, audioDuration, audioOffset, getClipSourceSpan(clipWindow),
      );
      if (peakSlice.numBars > 0) {
        // Use peak count as column count (not pixel width).
        // This ensures each peak maps to a fixed proportional position —
        // bar width scales smoothly with zoom, no integer quantization jumps.
        const columnCount = maxColumns
          ? Math.min(peakSlice.numBars, maxColumns)
          : peakSlice.numBars;

        const monoData = precomputeMergedMonoMinMax(peaks, peakSlice, columnCount);

        const barAlpha = blendFactor > 0 ? 0.85 * (1 - blendFactor) : 0.85;
        const colW = waveformLayout.widthPx / columnCount;
        drawMinMaxBars(ctx, columnCount, waveformLayout.leftPx,
          centerY, amplitude, monoData.maxArr, monoData.minArr, color, barAlpha, colW, fadeEnvelope);
      }
    }
  }

  // Draw sample line (when blend > 0)
  if (blendFactor > 0 && rawSamples) {
    const savedAlpha = ctx.globalAlpha;
    ctx.globalAlpha = savedAlpha * blendFactor;
    drawMonoSampleLine(
      ctx, rawSamples.left, rawSamples.right, rawSamples.sampleRate,
      audioOffset, clipDuration,
      waveformLayout.leftPx, waveformLayout.widthPx, centerY, amplitude, color,
    );
    ctx.globalAlpha = savedAlpha;
  }

  ctx.restore();
}

// ---- Mipmap rendering (stride-6: min_l, max_l, rms_l, min_r, max_r, rms_r) ----

/** Stride for mipmap peak data from ace-waveform WASM. */
export const MIPMAP_STRIDE = 6;

export interface MipmapDrawParams {
  /** Float32Array with stride 6 per column: min_l, max_l, rms_l, min_r, max_r, rms_r */
  peakData: Float32Array;
  leftPx: number;
  width: number;
  height: number;
  color: string;
  opacity?: number;
  trackVolume?: number;
  fadeEnvelope?: FadeEnvelope;
}

/**
 * Draw waveform from mipmap query results as a smooth filled polygon.
 * Traces the max envelope forward, then the min envelope backward,
 * producing a single filled path that looks like a continuous curve.
 */
export function drawMipmapWaveform(
  ctx: CanvasRenderingContext2D,
  params: MipmapDrawParams,
): void {
  const {
    peakData, leftPx, width, height, color,
    opacity = 0.9, trackVolume = 1, fadeEnvelope,
  } = params;

  const numColumns = Math.floor(peakData.length / MIPMAP_STRIDE);
  if (numColumns === 0 || width <= 0 || height <= 0) return;

  const centerY = height * 0.5;
  const amplitude = centerY * 0.88 * Math.min(1, trackVolume);
  const colW = width / numColumns;

  ctx.save();
  ctx.globalAlpha = opacity * 0.85;
  ctx.fillStyle = color;

  // Draw as filled polygon: top edge (max) forward, bottom edge (min) backward.
  // Per-column gain comes from the optional fade envelope so the polygon's
  // top and bottom edges shrink toward centerY inside fade-in / fade-out regions.
  ctx.beginPath();

  // Forward pass: trace max envelope (top edge of waveform)
  for (let i = 0; i < numColumns; i++) {
    const off = i * MIPMAP_STRIDE;
    const maxVal = Math.max(peakData[off + 1], peakData[off + 4]);
    const x = leftPx + (i + 0.5) * colW;
    const gain = fadeGainAtPixel(fadeEnvelope, x);
    const y = centerY - maxVal * amplitude * gain;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }

  // Backward pass: trace min envelope (bottom edge of waveform)
  for (let i = numColumns - 1; i >= 0; i--) {
    const off = i * MIPMAP_STRIDE;
    const minVal = Math.min(peakData[off], peakData[off + 3]);
    const x = leftPx + (i + 0.5) * colW;
    const gain = fadeGainAtPixel(fadeEnvelope, x);
    const y = centerY - minVal * amplitude * gain;
    ctx.lineTo(x, y);
  }

  ctx.closePath();
  ctx.fill();

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
