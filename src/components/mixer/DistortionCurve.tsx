/**
 * DistortionCurve — Waveshaping transfer function visualization.
 * Shows input vs output amplitude with the characteristic shape for each type.
 */
import { useRef, useEffect } from 'react';
import { generateDistortionCurve, type DistortionType } from '../../utils/distortionCurve';
import { fillBackground, GRID_COLOR } from '../../utils/canvasTheme';

interface DistortionCurveProps {
  drive: number;
  distortionType: DistortionType;
  width?: number;
  height?: number;
  /** Accent color for the curve */
  color?: string;
}

export function DistortionCurve({
  drive,
  distortionType,
  width = 160,
  height = 120,
  color = '#c46454',
}: DistortionCurveProps) {
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

    // Map amplitude (-1..1) to canvas coordinates
    const xForAmp = (a: number) => ((a + 1) / 2) * width;
    const yForAmp = (a: number) => height - ((a + 1) / 2) * height;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Background (radial vignette)
    fillBackground(ctx, width, height);

    // Grid lines at -1, -0.5, 0, +0.5, +1
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 0.5;
    ctx.font = '8px monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';

    for (const amp of [-1, -0.5, 0, 0.5, 1]) {
      const x = xForAmp(amp);
      const y = yForAmp(amp);
      // Vertical
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.strokeStyle = GRID_COLOR;
      ctx.stroke();
      // Horizontal
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Clip boundary markers (±1 dashed lines)
    ctx.setLineDash([2, 2]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 0.5;
    [xForAmp(-1), xForAmp(1)].forEach((x) => {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    });
    [yForAmp(-1), yForAmp(1)].forEach((y) => {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    });
    ctx.setLineDash([]);

    // Unity line (45° dashed)
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xForAmp(-1), yForAmp(-1));
    ctx.lineTo(xForAmp(1), yForAmp(1));
    ctx.stroke();
    ctx.setLineDash([]);

    // Transfer curve
    const points = generateDistortionCurve(drive, distortionType, 200);

    // Fill area between curve and unity line
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const px = xForAmp(points[i].x);
      const py = yForAmp(points[i].y);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    // Close back along unity line
    for (let i = points.length - 1; i >= 0; i--) {
      ctx.lineTo(xForAmp(points[i].x), yForAmp(points[i].x));
    }
    ctx.closePath();
    ctx.fillStyle = `${color}18`;
    ctx.fill();

    // Curve stroke
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const px = xForAmp(points[i].x);
      const py = yForAmp(points[i].y);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Center crosshair dot
    ctx.beginPath();
    ctx.arc(xForAmp(0), yForAmp(0), 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fill();

    // Type label
    const label = distortionType.toUpperCase();
    ctx.font = '8px monospace';
    ctx.fillStyle = `${color}80`;
    ctx.textAlign = 'right';
    ctx.fillText(label, width - 3, height - 3);
  }, [drive, distortionType, width, height, color]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="rounded"
      data-testid="distortion-curve"
    />
  );
}
