/**
 * CompressorCurve — Transfer curve visualization for the compressor effect.
 * Shows input vs output dB with threshold, ratio, and knee.
 */
import { useRef, useEffect } from 'react';
import { generateTransferCurve } from '../../utils/compressorCurve';
import { fillBackground, GRID_COLOR, LABEL_COLOR } from '../../utils/canvasTheme';

const MIN_DB = -60;
const MAX_DB = 0;
const DB_LABELS = [-48, -36, -24, -12, 0];

interface CompressorCurveProps {
  threshold: number;
  ratio: number;
  kneeDb: number;
  /** Current gain reduction in dB (negative) for the animated dot */
  reduction?: number;
  width?: number;
  height?: number;
  /** Accent color for the curve */
  color?: string;
}

export function CompressorCurve({
  threshold,
  ratio,
  kneeDb,
  reduction = 0,
  width = 160,
  height = 120,
  color = '#f59e0b',
}: CompressorCurveProps) {
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

    // Coordinate helpers
    const xForDb = (db: number) => ((db - MIN_DB) / (MAX_DB - MIN_DB)) * width;
    const yForDb = (db: number) => height - ((db - MIN_DB) / (MAX_DB - MIN_DB)) * height;

    // Clear + vignette background
    ctx.clearRect(0, 0, width, height);
    fillBackground(ctx, width, height);

    // Grid lines
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 0.5;
    ctx.font = '8px monospace';
    ctx.fillStyle = LABEL_COLOR;

    for (const db of DB_LABELS) {
      const x = xForDb(db);
      const y = yForDb(db);
      // Vertical
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      // Horizontal
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      // Label
      ctx.textAlign = 'left';
      ctx.fillText(`${db}`, 2, y - 2);
    }

    // Unity line (45° dashed)
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xForDb(MIN_DB), yForDb(MIN_DB));
    ctx.lineTo(xForDb(MAX_DB), yForDb(MAX_DB));
    ctx.stroke();
    ctx.setLineDash([]);

    // Threshold marker (vertical)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    const threshX = xForDb(threshold);
    ctx.moveTo(threshX, 0);
    ctx.lineTo(threshX, height);
    ctx.stroke();
    ctx.setLineDash([]);

    // Transfer curve
    const points = generateTransferCurve(threshold, ratio, kneeDb, MIN_DB, MAX_DB, 200);

    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const x = xForDb(points[i].x);
      const y = yForDb(points[i].y);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Fill area between curve and unity line (compression region)
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const x = xForDb(points[i].x);
      const y = yForDb(points[i].y);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    // Close back along unity line
    for (let i = points.length - 1; i >= 0; i--) {
      const x = xForDb(points[i].x);
      const y = yForDb(points[i].x); // unity line: output = input
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = `${color}15`; // ~8% opacity
    ctx.fill();

    // GR indicator dot (shows current operating point)
    if (Math.abs(reduction) > 0.1) {
      // Estimate input level from reduction: input ≈ threshold - reduction * ratio / (ratio - 1)
      // Simplified: just show the dot at threshold position moving down
      const dotInputDb = Math.max(MIN_DB, threshold - reduction);
      const dotOutputDb = dotInputDb + reduction;
      const dotX = xForDb(dotInputDb);
      const dotY = yForDb(dotOutputDb);
      ctx.beginPath();
      ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }, [threshold, ratio, kneeDb, reduction, width, height, color]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Compressor threshold curve visualization"
      style={{ width, height }}
      className="rounded"
      data-testid="compressor-curve"
    />
  );
}
