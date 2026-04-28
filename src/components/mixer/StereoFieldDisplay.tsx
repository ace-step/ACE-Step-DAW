/**
 * StereoFieldDisplay — Stereo width visualization for stereo imager effect.
 * Shows a polar/vectorscope-style display of the stereo field.
 */
import { useRef, useEffect } from 'react';
import { fillBackground, GRID_COLOR } from '../../utils/canvasTheme';

interface StereoFieldDisplayProps {
  widthAmount: number;  // 0 to 2 (0=mono, 1=normal, 2=wide)
  midGain: number;      // dB
  sideGain: number;     // dB
  monoFreq: number;     // Hz (mono below this frequency)
  pan: number;          // -1 to 1
  canvasWidth?: number;
  canvasHeight?: number;
  color?: string;
}

export function StereoFieldDisplay({
  widthAmount,
  midGain,
  sideGain,
  monoFreq,
  pan,
  canvasWidth = 160,
  canvasHeight = 100,
  color = '#7a8ab4',
}: StereoFieldDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== canvasWidth * dpr || canvas.height !== canvasHeight * dpr) {
      canvas.width = canvasWidth * dpr;
      canvas.height = canvasHeight * dpr;
      ctx.scale(dpr, dpr);
    }

    const w = canvasWidth;
    const h = canvasHeight;
    const cx = w / 2;
    const cy = h * 0.55;
    const maxR = Math.min(w, h) * 0.4;

    ctx.clearRect(0, 0, w, h);
    fillBackground(ctx, w, h);

    // Reference circles
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 0.5;
    for (const r of [0.33, 0.66, 1.0]) {
      ctx.beginPath();
      ctx.arc(cx, cy, maxR * r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Center lines (L-R axis and M-S axis)
    ctx.beginPath(); ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR); ctx.stroke();

    // L/R labels
    ctx.font = '8px monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.textAlign = 'center';
    ctx.fillText('L', cx - maxR - 6, cy + 3);
    ctx.fillText('R', cx + maxR + 6, cy + 3);
    ctx.fillText('M', cx, cy - maxR - 3);

    // Draw stereo field shape (ellipse representing width)
    const widthFactor = Math.max(0.05, widthAmount);
    const midFactor = Math.pow(10, midGain / 20);
    const sideFactor = Math.pow(10, sideGain / 20);

    // Ellipse: height = mid level, width = side level * width
    // Soft-normalize so the ellipse stays within the plot radius
    const rawEllipseW = maxR * widthFactor * sideFactor * 0.8;
    const rawEllipseH = maxR * midFactor * 0.8;
    const ellipseScale = Math.min(1, maxR / Math.max(rawEllipseW, rawEllipseH, 1));
    const ellipseW = rawEllipseW * ellipseScale;
    const ellipseH = rawEllipseH * ellipseScale;

    // Pan offset
    const panOffset = pan * maxR * 0.3;

    // Gradient fill
    const grad = ctx.createRadialGradient(
      cx + panOffset, cy, 0,
      cx + panOffset, cy, Math.max(ellipseW, ellipseH),
    );
    grad.addColorStop(0, `${color}40`);
    grad.addColorStop(0.7, `${color}18`);
    grad.addColorStop(1, `${color}05`);

    ctx.beginPath();
    ctx.ellipse(cx + panOffset, cy, ellipseW, ellipseH, 0, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Mono frequency indicator (inner circle)
    if (monoFreq > 0) {
      const monoRadius = maxR * 0.15;
      ctx.beginPath();
      ctx.arc(cx + panOffset, cy, monoRadius, 0, Math.PI * 2);
      ctx.strokeStyle = `${color}60`;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = '6px monospace';
      ctx.fillStyle = `${color}60`;
      ctx.textAlign = 'center';
      ctx.fillText(`${monoFreq}Hz`, cx + panOffset, cy + monoRadius + 8);
    }

    // Width label
    ctx.font = '8px monospace';
    ctx.fillStyle = `${color}80`;
    ctx.textAlign = 'right';
    ctx.fillText(`W:${(widthAmount * 100).toFixed(0)}%`, w - 3, h - 3);
  }, [widthAmount, midGain, sideGain, monoFreq, pan, canvasWidth, canvasHeight, color]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Stereo field visualization"
      style={{ width: canvasWidth, height: canvasHeight }}
      className="rounded"
      data-testid="stereo-field-display"
    />
  );
}
