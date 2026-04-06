import { drawWaveform, type WaveformRenderParams } from './WaveformCanvasRenderer';
import type { ClipPresentation } from './clipPresentation';
import type { StretchMode } from '../../types/project';

export interface ClipCanvasParams {
  width: number;
  height: number;
  headerHeight: number;
  clipColor: string;
  presentation: ClipPresentation;
  isSelected: boolean;
  isMuted: boolean;
  borderRadius: number;
  // Waveform params (optional — null if MIDI clip)
  waveform?: {
    peaks: number[] | null;
    audioDuration: number;
    audioOffset: number;
    clipDuration: number;
    contentOffset?: number;
    timeStretchRate?: number;
    stretchMode?: StretchMode;
    trackVolume?: number;
    opacity?: number;
  };
}

/**
 * Draw the complete clip visual (header + body + waveform) on a Canvas.
 * This consolidates what was 3+ DOM layers + SVG into a single paint.
 */
export function drawClipCanvas(ctx: CanvasRenderingContext2D, params: ClipCanvasParams): void {
  const { width, height, headerHeight, clipColor, presentation, isSelected, isMuted, borderRadius, waveform } = params;
  if (width <= 0 || height <= 0) return;

  ctx.save();

  // Clip to rounded rectangle
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, borderRadius);
  ctx.clip();

  // Body background (below header)
  drawBodyBackground(ctx, width, height, headerHeight, clipColor, isSelected);

  // Header background
  drawHeaderBackground(ctx, width, headerHeight, clipColor, isSelected);

  // Header bottom border
  ctx.strokeStyle = hexToRgba(clipColor, 0.38);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, headerHeight);
  ctx.lineTo(width, headerHeight);
  ctx.stroke();

  // Waveform (rendered into body area)
  if (waveform?.peaks && waveform.peaks.length > 0) {
    ctx.save();
    ctx.translate(0, headerHeight);
    const bodyHeight = height - headerHeight;
    drawWaveform(ctx, {
      peaks: waveform.peaks,
      audioDuration: waveform.audioDuration,
      audioOffset: waveform.audioOffset,
      clipDuration: waveform.clipDuration,
      contentOffset: waveform.contentOffset,
      timeStretchRate: waveform.timeStretchRate,
      stretchMode: waveform.stretchMode,
      width,
      height: bodyHeight,
      color: presentation.waveformColor,
      opacity: waveform.opacity ?? 0.9,
      trackVolume: waveform.trackVolume,
    });
    ctx.restore();
  }

  // Muted overlay
  if (isMuted) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, 0, width, height);
  }

  ctx.restore();

  // Outer border (drawn after clip to avoid being clipped)
  if (isSelected) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.lineWidth = 2;
  } else {
    ctx.strokeStyle = hexToRgba(clipColor, 0.5);
    ctx.lineWidth = 1;
  }
  ctx.beginPath();
  ctx.roundRect(0.5, 0.5, width - 1, height - 1, borderRadius);
  ctx.stroke();
}

function drawHeaderBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  headerHeight: number,
  clipColor: string,
  isSelected: boolean,
): void {
  // Create gradient matching CSS: linear-gradient(180deg, ...)
  const grad = ctx.createLinearGradient(0, 0, 0, headerHeight);
  if (isSelected) {
    grad.addColorStop(0, hexToRgba(clipColor, 0.96));
    grad.addColorStop(1, hexToRgba(clipColor, 0.88));
  } else {
    grad.addColorStop(0, hexToRgba(clipColor, 0.96));
    grad.addColorStop(1, hexToRgba(clipColor, 0.9));
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, headerHeight);
}

function drawBodyBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  headerHeight: number,
  clipColor: string,
  isSelected: boolean,
): void {
  const bodyHeight = height - headerHeight;
  const grad = ctx.createLinearGradient(0, headerHeight, 0, height);
  if (isSelected) {
    grad.addColorStop(0, 'rgba(253, 251, 246, 0.98)');
    grad.addColorStop(1, 'rgba(244, 238, 228, 0.96)');
  } else {
    grad.addColorStop(0, hexToRgba(clipColor, 0.56));
    grad.addColorStop(1, hexToRgba(clipColor, 0.42));
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, headerHeight, width, bodyHeight);

  // Inner shadow at top of body
  const shadowGrad = ctx.createLinearGradient(0, headerHeight, 0, headerHeight + 4);
  shadowGrad.addColorStop(0, isSelected ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.3)');
  shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shadowGrad;
  ctx.fillRect(0, headerHeight, width, 4);
}

/** Convert hex color to rgba string */
function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(128,128,128,${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
