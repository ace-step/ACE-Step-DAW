/**
 * LimiterCurve — Transfer curve visualization for the limiter effect.
 * Shows brick-wall ceiling behavior with style-dependent knee shape.
 */
import { useRef, useEffect } from 'react';
import { generateLimiterCurve, type LimiterStyle } from '../../utils/limiterCurve';
import { fillBackground, GRID_COLOR, LABEL_COLOR } from '../../utils/canvasTheme';

const MIN_DB = -60;
const MAX_DB = 6;
const DB_LABELS = [-48, -36, -24, -12, 0];

interface LimiterCurveProps {
  ceiling: number;
  gain: number;
  style: LimiterStyle;
  width?: number;
  height?: number;
  color?: string;
}

export function LimiterCurve({
  ceiling,
  gain,
  style,
  width = 160,
  height = 120,
  color = '#d4a040',
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

    const xForDb = (db: number) => ((db - MIN_DB) / (MAX_DB - MIN_DB)) * width;
    const yForDb = (db: number) => height - ((db - MIN_DB) / (MAX_DB - MIN_DB)) * height;

    ctx.clearRect(0, 0, width, height);
    fillBackground(ctx, width, height);

    // Grid
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 0.5;
    ctx.font = '8px monospace';
    ctx.fillStyle = LABEL_COLOR;

    for (const db of DB_LABELS) {
      const x = xForDb(db);
      const y = yForDb(db);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillText(`${db}`, 2, y - 2);
    }

    // Unity line (45°)
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xForDb(MIN_DB), yForDb(MIN_DB));
    ctx.lineTo(xForDb(MAX_DB), yForDb(MAX_DB));
    ctx.stroke();
    ctx.setLineDash([]);

    // Ceiling line (horizontal)
    ctx.strokeStyle = '#ef4444aa';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    const ceilY = yForDb(ceiling);
    ctx.moveTo(0, ceilY);
    ctx.lineTo(width, ceilY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Ceiling label
    ctx.fillStyle = '#ef4444aa';
    ctx.textAlign = 'right';
    ctx.fillText(`${ceiling.toFixed(1)}dB`, width - 3, ceilY - 2);

    // Transfer curve
    const points = generateLimiterCurve(ceiling, gain, style, MIN_DB, MAX_DB, 200);

    // Fill area between curve and unity
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const x = xForDb(points[i].x);
      const y = yForDb(Math.min(points[i].y, MAX_DB));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = points.length - 1; i >= 0; i--) {
      const boosted = points[i].x + gain;
      ctx.lineTo(xForDb(points[i].x), yForDb(Math.min(boosted, MAX_DB)));
    }
    ctx.closePath();
    ctx.fillStyle = `${color}15`;
    ctx.fill();

    // Curve stroke
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const x = xForDb(points[i].x);
      const y = yForDb(Math.min(points[i].y, MAX_DB));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Style label
    ctx.font = '8px monospace';
    ctx.fillStyle = `${color}80`;
    ctx.textAlign = 'right';
    ctx.fillText(style.toUpperCase(), width - 3, height - 3);
  }, [ceiling, gain, style, width, height, color]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="rounded"
      data-testid="limiter-curve"
    />
  );
}
