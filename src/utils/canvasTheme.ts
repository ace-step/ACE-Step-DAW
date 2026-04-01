/**
 * canvasTheme — Shared visual constants for all canvas-based effect visualizations.
 *
 * Provides consistent background, grid, and accent styling across
 * CompressorCurve, DistortionCurve, FilterResponseCurve, ReverbDecayCurve,
 * DelayTapTimeline, and SpectrumAnalyzer.
 */

/** Standard canvas background with subtle vignette gradient. */
export function drawCanvasBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  accentColor?: string,
) {
  // Base gradient: dark center, darker edges (vignette)
  const grad = ctx.createRadialGradient(
    width / 2, height / 2, 0,
    width / 2, height / 2, Math.max(width, height) * 0.7,
  );
  grad.addColorStop(0, 'rgba(12, 16, 28, 0.92)');
  grad.addColorStop(1, 'rgba(4, 6, 14, 0.98)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Optional accent tint at center
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

/** Standard grid lines for dB/frequency axes. */
export const CANVAS_GRID = {
  lineColor: 'rgba(255, 255, 255, 0.06)',
  labelColor: 'rgba(255, 255, 255, 0.25)',
  labelFont: '9px ui-monospace, monospace',
  zeroLineColor: 'rgba(255, 255, 255, 0.12)',
} as const;

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
