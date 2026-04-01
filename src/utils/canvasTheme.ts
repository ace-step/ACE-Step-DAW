/**
 * canvasTheme — Shared visual constants for all canvas-based effect visualizations.
 *
 * Provides consistent background, grid, and accent styling across
 * CompressorCurve, DistortionCurve, FilterResponseCurve, ReverbDecayCurve,
 * DelayTapTimeline, ModulationDisplay, and SpectrumAnalyzer.
 *
 * Follows openDAW CanvasPainter patterns:
 * - Unified background, grid, and label styling
 * - lineWidth scales with dpr for crisp lines
 */

/** Standard canvas background with subtle vignette gradient. */
export function drawCanvasBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  accentColor?: string,
) {
  const grad = ctx.createRadialGradient(
    width / 2, height / 2, 0,
    width / 2, height / 2, Math.max(width, height) * 0.7,
  );
  grad.addColorStop(0, 'rgba(12, 16, 28, 0.92)');
  grad.addColorStop(1, 'rgba(4, 6, 14, 0.98)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  if (accentColor) {
    const tint = ctx.createRadialGradient(
      width / 2, height * 0.6, 0,
      width / 2, height * 0.6, width * 0.5,
    );
    tint.addColorStop(0, `${accentColor}08`);
    tint.addColorStop(1, 'transparent');
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, width, height);
  }
}

/** Alias for backward compat with canvases that use the simpler API */
export const fillBackground = (ctx: CanvasRenderingContext2D, w: number, h: number) =>
  drawCanvasBackground(ctx, w, h);

/** Standard grid lines for dB/frequency axes. */
export const CANVAS_GRID = {
  lineColor: 'rgba(255, 255, 255, 0.06)',
  labelColor: 'rgba(255, 255, 255, 0.25)',
  labelFont: '9px ui-monospace, monospace',
  zeroLineColor: 'rgba(255, 255, 255, 0.12)',
} as const;

/** Aliases for simpler import */
export const GRID_COLOR = CANVAS_GRID.lineColor;
export const GRID_COLOR_STRONG = CANVAS_GRID.zeroLineColor;
export const LABEL_COLOR = CANVAS_GRID.labelColor;
export const LABEL_COLOR_BRIGHT = 'rgba(255, 255, 255, 0.30)';
export const LABEL_AREA_BG = 'rgba(0, 0, 0, 0.22)';

/** Draw a horizontal grid line. */
export function drawHGridLine(
  ctx: CanvasRenderingContext2D,
  y: number,
  width: number,
  isZero = false,
) {
  ctx.strokeStyle = isZero ? CANVAS_GRID.zeroLineColor : CANVAS_GRID.lineColor;
  ctx.lineWidth = isZero ? 0.75 : 0.5;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(width, y);
  ctx.stroke();
}

/** Draw a vertical grid line. */
export function drawVGridLine(
  ctx: CanvasRenderingContext2D,
  x: number,
  height: number,
) {
  ctx.strokeStyle = CANVAS_GRID.lineColor;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, height);
  ctx.stroke();
}

/** Stroke style helper — color + opacity (like openDAW DisplayPaint) */
export function stroke(color: string, opacity: number): string {
  return `${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
}

/** Standard label area height in logical pixels */
export const LABEL_H = 13;

/** Draw label area background at the bottom */
export function drawLabelArea(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  dpr: number,
) {
  ctx.fillStyle = LABEL_AREA_BG;
  ctx.fillRect(0, H - LABEL_H * dpr, W, LABEL_H * dpr);
}

/** Draw a type badge pill in the bottom-right corner */
export function drawBadge(
  ctx: CanvasRenderingContext2D,
  label: string,
  W: number,
  H: number,
  dpr: number,
  color: string,
) {
  const fontSize = Math.ceil(7 * dpr);
  ctx.font = `${fontSize}px monospace`;
  const bw = ctx.measureText(label).width + 6 * dpr;
  ctx.fillStyle = stroke(color, 0.14);
  ctx.beginPath();
  ctx.roundRect(W - bw - 2 * dpr, H - 12 * dpr, bw, 10 * dpr, 2 * dpr);
  ctx.fill();
  ctx.fillStyle = stroke(color, 0.85);
  ctx.textAlign = 'center';
  ctx.fillText(label, W - bw / 2 - 2 * dpr, H - 3.5 * dpr);
}

/** Setup canvas for HiDPI rendering (openDAW pattern: resize every render) */
export function setupCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): { ctx: CanvasRenderingContext2D; W: number; H: number; dpr: number } | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  return { ctx, W: canvas.width, H: canvas.height, dpr };
}

/** Dashed line pattern (in actual pixels) */
export function dashPattern(dpr: number): number[] {
  return [3 * dpr, 3 * dpr];
}
