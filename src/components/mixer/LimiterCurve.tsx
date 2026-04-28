/**
 * LimiterCurve — Transfer curve visualization for the limiter effect.
 * Shows input/output transfer function with ceiling line and gain reduction region.
 * Inspired by FabFilter Pro-L and iZotope Maximizer displays.
 */
import { useRef, useEffect } from 'react';
import { generateLimiterCurve, type LimiterStyle } from '../../utils/limiterCurve';
import {
  fillBackground,
  GRID_COLOR,
  GRID_COLOR_STRONG,
  LABEL_AREA_BG,
  LABEL_COLOR,
} from '../../utils/canvasTheme';

interface LimiterCurveProps {
  ceiling: number;    // Output ceiling in dB
  gain: number;       // Input gain in dB
  style: LimiterStyle;
  width?: number;
  height?: number;
  color: string;
}

export function LimiterCurve({
  ceiling,
  gain,
  style,
  width = 160,
  height = 100,
  color,
}: LimiterCurveProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    }

    const MIN_DB = -48;
    const MAX_DB = 6;
    const DB_RANGE = MAX_DB - MIN_DB;
    const labelH = 13;
    const drawH = height - labelH;
    const PAD = 2;

    const xForDb = (db: number) => PAD + ((db - MIN_DB) / DB_RANGE) * (width - PAD * 2);
    const yForDb = (db: number) => PAD + (drawH - PAD * 2) * (1 - (db - MIN_DB) / DB_RANGE);

    // ── Background ──────────────────────────────────────────────────────────
    ctx.clearRect(0, 0, width, height);
    fillBackground(ctx, width, height);

    // Label area
    ctx.fillStyle = LABEL_AREA_BG;
    ctx.fillRect(0, drawH, width, labelH);

    // ── Grid ────────────────────────────────────────────────────────────────
    const gridDbs = [-36, -24, -12, 0];
    ctx.font = '7px monospace';
    for (const db of gridDbs) {
      const x = xForDb(db);
      const y = yForDb(db);
      const isZero = db === 0;

      // Vertical grid line
      ctx.strokeStyle = isZero ? GRID_COLOR_STRONG : GRID_COLOR;
      ctx.lineWidth = isZero ? 0.75 : 0.5;
      ctx.beginPath();
      ctx.moveTo(x, PAD);
      ctx.lineTo(x, drawH);
      ctx.stroke();

      // Horizontal grid line
      ctx.beginPath();
      ctx.moveTo(PAD, y);
      ctx.lineTo(width - PAD, y);
      ctx.stroke();

      // Input labels (bottom)
      ctx.fillStyle = LABEL_COLOR;
      ctx.textAlign = 'center';
      ctx.fillText(`${db}`, x, height - 2);
    }

    // ── Unity line (diagonal) ───────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(xForDb(MIN_DB), yForDb(MIN_DB));
    ctx.lineTo(xForDb(MAX_DB), yForDb(MAX_DB));
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Ceiling line ────────────────────────────────────────────────────────
    const ceilY = yForDb(ceiling);
    ctx.strokeStyle = `${color}60`;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(PAD, ceilY);
    ctx.lineTo(width - PAD, ceilY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Ceiling label
    ctx.font = '7px monospace';
    ctx.fillStyle = `${color}90`;
    ctx.textAlign = 'right';
    ctx.fillText(`${ceiling.toFixed(1)} dB`, width - 4, ceilY - 3);

    // ── Fill area between the transfer curve and the unity line (gain-reduction region) ──
    const pts = generateLimiterCurve(ceiling, gain, style, MIN_DB, MAX_DB, 200);

    ctx.beginPath();
    let startedGR = false;
    for (let i = 0; i < pts.length; i++) {
      const x = xForDb(pts[i].inputDb);
      const yTransfer = yForDb(pts[i].outputDb);
      const yUnity = yForDb(pts[i].inputDb + gain);
      if (yTransfer < yUnity - 0.5) continue; // transfer is above unity (no GR)

      if (pts[i].outputDb < pts[i].inputDb + gain - 0.1) {
        if (!startedGR) {
          ctx.moveTo(x, yTransfer);
          startedGR = true;
        } else {
          ctx.lineTo(x, yTransfer);
        }
      }
    }
    if (startedGR) {
      // Close back along unity line
      for (let i = pts.length - 1; i >= 0; i--) {
        const yUnity = yForDb(pts[i].inputDb + gain);
        if (pts[i].outputDb < pts[i].inputDb + gain - 0.1) {
          ctx.lineTo(xForDb(pts[i].inputDb), yUnity);
        }
      }
      ctx.closePath();
      const grGrad = ctx.createLinearGradient(0, ceilY, 0, ceilY + 30);
      grGrad.addColorStop(0, `${color}25`);
      grGrad.addColorStop(1, `${color}05`);
      ctx.fillStyle = grGrad;
      ctx.fill();
    }

    // ── Transfer curve ──────────────────────────────────────────────────────
    ctx.save();
    ctx.shadowBlur = 5;
    ctx.shadowColor = `${color}70`;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const x = xForDb(pts[i].inputDb);
      const y = yForDb(pts[i].outputDb);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // ── Gain indicator dot ──────────────────────────────────────────────────
    const indicatorDb = Math.min(0, ceiling - gain);
    const dotX = xForDb(indicatorDb);
    const dotY = yForDb(Math.min(indicatorDb + gain, ceiling));
    ctx.beginPath();
    ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(dotX - 0.5, dotY - 0.5, 1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fill();

    // ── Type badge ──────────────────────────────────────────────────────────
    const badge = style.toUpperCase();
    ctx.font = '7px monospace';
    const badgeW = ctx.measureText(badge).width + 6;
    ctx.fillStyle = `${color}20`;
    ctx.beginPath();
    ctx.roundRect(width - badgeW - 2, height - 12, badgeW, 10, 2);
    ctx.fill();
    ctx.fillStyle = `${color}cc`;
    ctx.textAlign = 'center';
    ctx.fillText(badge, width - badgeW / 2 - 2, height - 4);
  }, [ceiling, gain, style, width, height, color]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Limiter ceiling curve"
      style={{ width, height }}
      className="rounded"
      data-testid="limiter-curve"
    />
  );
}
