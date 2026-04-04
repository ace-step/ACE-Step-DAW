/**
 * GateCurve — Transfer curve visualization for gate/expander effect.
 * Shows input vs output dB with threshold, range, and hysteresis zone.
 */
import { useRef, useEffect } from 'react';
import { generateGateCurve } from '../../utils/gateCurve';
import { fillBackground, GRID_COLOR, LABEL_COLOR } from '../../utils/canvasTheme';

const MAX_DB = 0;

interface GateCurveProps {
  threshold: number;
  range: number;
  hysteresis: number;
  mode: 'gate' | 'expander';
  width?: number;
  height?: number;
  color?: string;
}

export function GateCurve({
  threshold,
  range,
  hysteresis,
  mode,
  width = 160,
  height = 120,
  color = '#b8903a',
}: GateCurveProps) {
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

    // X-domain: input range (fixed)
    const minXDb = -80;
    // Y-domain: expand to show full gate attenuation (input + range can go very low)
    const minYDb = Math.min(-80, threshold + range - 10);
    const dbLabels = [-60, -40, -20, 0].filter(db => db >= minYDb);

    const xForDb = (db: number) => ((db - minXDb) / (MAX_DB - minXDb)) * width;
    const yForDb = (db: number) => height - ((db - minYDb) / (MAX_DB - minYDb)) * height;

    ctx.clearRect(0, 0, width, height);
    fillBackground(ctx, width, height);

    // Grid
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 0.5;
    ctx.font = '8px monospace';
    ctx.fillStyle = LABEL_COLOR;

    for (const db of dbLabels) {
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
    ctx.moveTo(xForDb(minXDb), yForDb(minXDb));
    ctx.lineTo(xForDb(MAX_DB), yForDb(MAX_DB));
    ctx.stroke();
    ctx.setLineDash([]);

    // Threshold marker
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    const threshX = xForDb(threshold);
    ctx.moveTo(threshX, 0);
    ctx.lineTo(threshX, height);
    ctx.stroke();

    // Hysteresis zone (close threshold), clamped to plot bounds
    if (hysteresis > 0) {
      const closeX = xForDb(Math.max(minXDb, threshold - hysteresis));
      ctx.strokeStyle = `${color}40`;
      ctx.beginPath();
      ctx.moveTo(closeX, 0);
      ctx.lineTo(closeX, height);
      ctx.stroke();

      // Shade hysteresis zone
      ctx.fillStyle = `${color}10`;
      ctx.fillRect(closeX, 0, threshX - closeX, height);
    }
    ctx.setLineDash([]);

    // Transfer curve
    const points = generateGateCurve(threshold, range, hysteresis, mode, minXDb, MAX_DB, 200);

    // Fill area between curve and unity (attenuation region)
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const x = xForDb(points[i].x);
      const y = yForDb(Math.max(minYDb, points[i].y));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = points.length - 1; i >= 0; i--) {
      ctx.lineTo(xForDb(points[i].x), yForDb(points[i].x));
    }
    ctx.closePath();
    ctx.fillStyle = `${color}15`;
    ctx.fill();

    // Curve stroke
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const x = xForDb(points[i].x);
      const y = yForDb(Math.max(minYDb, points[i].y));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Mode label
    ctx.font = '8px monospace';
    ctx.fillStyle = `${color}80`;
    ctx.textAlign = 'right';
    ctx.fillText(mode.toUpperCase(), width - 3, height - 3);
  }, [threshold, range, hysteresis, mode, width, height, color]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="rounded"
      data-testid="gate-curve"
    />
  );
}
