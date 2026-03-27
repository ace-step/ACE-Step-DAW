/**
 * Shared ADSR envelope curve drawing for canvas-based envelope visualizations.
 * Used by both ADSREnvelopeEditor and FilterEnvelopeEditor.
 */

export interface EnvelopeShape {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

/**
 * Draw an ADSR envelope curve on a canvas.
 * @param ctx Canvas 2D rendering context
 * @param w Canvas logical width (before DPR)
 * @param h Canvas logical height (before DPR)
 * @param env Envelope ADSR values
 * @param color Accent color for stroke and control points (e.g. '#4A5FFF')
 * @param fillColor Fill color under the curve (e.g. 'rgba(74, 95, 255, 0.15)')
 */
export function drawEnvelopeCurve(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  env: EnvelopeShape,
  color: string,
  fillColor: string,
) {
  const dpr = window.devicePixelRatio || 1;
  ctx.clearRect(0, 0, w * dpr, h * dpr);
  ctx.save();
  ctx.scale(dpr, dpr);

  const pad = 4;
  const iw = w - pad * 2;
  const ih = h - pad * 2;

  // Normalize time segments
  const totalTime = env.attack + env.decay + 0.3 + env.release;
  const ax = pad + (env.attack / totalTime) * iw;
  const dx = ax + (env.decay / totalTime) * iw;
  const sx = dx + (0.3 / totalTime) * iw;
  const rx = sx + (env.release / totalTime) * iw;

  const bottom = pad + ih;
  const top = pad;
  const sustainY = pad + ih * (1 - env.sustain);

  // Background grid
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = pad + (ih * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(pad + iw, y);
    ctx.stroke();
  }

  // Envelope curve — fill
  ctx.beginPath();
  ctx.moveTo(pad, bottom);
  ctx.lineTo(ax, top);
  ctx.lineTo(dx, sustainY);
  ctx.lineTo(sx, sustainY);
  ctx.lineTo(rx, bottom);
  ctx.lineTo(pad, bottom);
  ctx.fillStyle = fillColor;
  ctx.fill();

  // Envelope curve — stroke
  ctx.beginPath();
  ctx.moveTo(pad, bottom);
  ctx.lineTo(ax, top);
  ctx.lineTo(dx, sustainY);
  ctx.lineTo(sx, sustainY);
  ctx.lineTo(rx, bottom);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Control points
  const points = [
    { x: ax, y: top },
    { x: dx, y: sustainY },
    { x: sx, y: sustainY },
    { x: rx, y: bottom },
  ];
  for (const pt of points) {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.restore();
}
