/**
 * SaturationCurve — Waveshaping transfer function visualization for saturation.
 * Shows input vs output amplitude with characteristic shape per saturation type.
 */
import { useRef, useEffect } from 'react';
import { generateSaturationCurve, type SaturationType } from '../../utils/saturationCurve';
import { fillBackground, GRID_COLOR } from '../../utils/canvasTheme';

const TYPE_LABELS: Record<SaturationType, string> = {
  tape: 'TAPE',
  tube: 'TUBE',
  transistor: 'TRSTOR',
  soft: 'SOFT',
  hard: 'HARD',
};

interface SaturationCurveProps {
  drive: number;
  saturationType: SaturationType;
  width?: number;
  height?: number;
  color?: string;
}

export function SaturationCurve({
  drive,
  saturationType,
  width = 160,
  height = 120,
  color = '#b87060',
}: SaturationCurveProps) {
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

    const xForAmp = (a: number) => ((a + 1) / 2) * width;
    const yForAmp = (a: number) => height - ((a + 1) / 2) * height;

    ctx.clearRect(0, 0, width, height);
    fillBackground(ctx, width, height);

    // Grid
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 0.5;
    for (const amp of [-1, -0.5, 0, 0.5, 1]) {
      const x = xForAmp(amp);
      const y = yForAmp(amp);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

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
    const points = generateSaturationCurve(drive, saturationType, 200);

    // Fill area between curve and unity
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const px = xForAmp(points[i].x);
      const py = yForAmp(points[i].y);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
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

    // Type label
    ctx.font = '8px monospace';
    ctx.fillStyle = `${color}80`;
    ctx.textAlign = 'right';
    ctx.fillText(TYPE_LABELS[saturationType] ?? saturationType.toUpperCase(), width - 3, height - 3);
  }, [drive, saturationType, width, height, color]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Saturation curve visualization"
      style={{ width, height }}
      className="rounded"
      data-testid="saturation-curve"
    />
  );
}
