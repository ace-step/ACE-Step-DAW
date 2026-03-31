/**
 * ModulationDisplay — Shared LFO waveform visualization for Chorus, Flanger, Phaser.
 *
 * Rendering follows openDAW CanvasPainter patterns:
 * - Path2D for efficient single-pass stroke + fill
 * - Canvas resized every render (actualWidth = clientWidth * dpr)
 * - Work in actual-pixel coordinates, lineWidth = dpr
 * - Stroke the path first, then extend path to close and fill with gradient
 * - Gradient: color → transparent (top to bottom)
 *
 * Each effect type gets a distinctive visual character:
 * - Chorus: wave + bright stereo-width gradient fill from center
 * - Flanger: wave + mirrored ghost showing comb-filter character
 * - Phaser: wave + horizontal allpass stage sweep bands
 */
import { useRef, useEffect } from 'react';
import { generateLfoWave, type ModulationType } from '../../utils/modulationWave';

interface ModulationDisplayProps {
  frequency: number;
  depth: number;
  baseDelay?: number;
  type: ModulationType;
  width?: number;
  height?: number;
  color?: string;
}

/** HSL-based stroke style (mirrors openDAW DisplayPaint pattern) */
function strokeStyle(color: string, opacity: number): string {
  return `${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
}

export function ModulationDisplay({
  frequency,
  depth,
  baseDelay = 5,
  type,
  width = 160,
  height = 100,
  color = '#a78bfa',
}: ModulationDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // openDAW pattern: resize canvas every render, work in actual pixels
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const W = canvas.width;   // actual pixel width
    const H = canvas.height;  // actual pixel height

    const labelH = 13 * dpr;
    const topPad = 12 * dpr;
    const drawH = H - labelH;
    const displayDuration = Math.max(2 / Math.max(frequency, 0.1), 0.5);
    const yCenter = topPad + (drawH - topPad) / 2;
    const yAmp = (drawH - topPad - 4 * dpr) / 2;

    const xForT = (t: number) => (t / displayDuration) * W;
    const yForVal = (v: number) => yCenter - v * yAmp;

    // ── Background ──────────────────────────────────────────────────────────
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(8, 12, 24, 0.95)';
    ctx.fillRect(0, 0, W, H);

    // Label area
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, drawH, W, labelH);

    // ── Center line ─────────────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.lineWidth = dpr;
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.beginPath();
    ctx.moveTo(0, yCenter);
    ctx.lineTo(W, yCenter);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Generate primary waveform ────────────────────────────────────────────
    const pts = generateLfoWave(frequency, depth, displayDuration, Math.max(200, W));

    // openDAW pattern: build Path2D, stroke once, then extend + fill
    const buildWavePath = (points: typeof pts): Path2D => {
      const path = new Path2D();
      path.moveTo(xForT(points[0].t), yForVal(points[0].value));
      for (let i = 1; i < points.length; i++) {
        path.lineTo(xForT(points[i].t), yForVal(points[i].value));
      }
      return path;
    };

    // Stroke then fill pattern (openDAW WaveformDisplay.tsx)
    const strokeAndFill = (points: typeof pts, fillGrad: CanvasGradient) => {
      const path = buildWavePath(points);
      // 1) Stroke the visible curve
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeStyle = strokeStyle(color, 0.85);
      ctx.stroke(path);
      // 2) Extend path to close against center line, then fill
      path.lineTo(xForT(points[points.length - 1].t), yCenter);
      path.lineTo(xForT(points[0].t), yCenter);
      path.closePath();
      ctx.fillStyle = fillGrad;
      ctx.fill(path);
    };

    // ── Effect-specific rendering ────────────────────────────────────────────

    if (type === 'chorus') {
      // Gradient: bright at extremes, transparent at center (stereo spread)
      const grad = ctx.createLinearGradient(0, yCenter - yAmp, 0, yCenter + yAmp);
      grad.addColorStop(0, strokeStyle(color, 0.30));
      grad.addColorStop(0.4, strokeStyle(color, 0.12));
      grad.addColorStop(0.5, 'transparent');
      grad.addColorStop(0.6, strokeStyle(color, 0.12));
      grad.addColorStop(1, strokeStyle(color, 0.30));
      strokeAndFill(pts, grad);

      // Stereo L/R indicators
      if (depth > 0.05) {
        const peakTop = yForVal(depth);
        const peakBot = yForVal(-depth);
        ctx.strokeStyle = strokeStyle(color, 0.18);
        ctx.lineWidth = dpr * 0.5;
        ctx.setLineDash([2 * dpr, 3 * dpr]);
        ctx.beginPath();
        ctx.moveTo(0, peakTop); ctx.lineTo(W - 6 * dpr, peakTop);
        ctx.moveTo(0, peakBot); ctx.lineTo(W - 6 * dpr, peakBot);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = `${6 * dpr}px monospace`;
        ctx.fillStyle = strokeStyle(color, 0.35);
        ctx.textAlign = 'left';
        ctx.fillText('L', 3 * dpr, peakTop + 3 * dpr);
        ctx.textAlign = 'right';
        ctx.fillText('R', W - 8 * dpr, peakBot + 3 * dpr);
      }

    } else if (type === 'flanger') {
      // Fill: gradient from peaks to transparent center
      const grad = ctx.createLinearGradient(0, yCenter - yAmp, 0, yCenter + yAmp);
      grad.addColorStop(0, strokeStyle(color, 0.25));
      grad.addColorStop(0.5, 'transparent');
      grad.addColorStop(1, strokeStyle(color, 0.25));
      strokeAndFill(pts, grad);

      // Mirrored ghost wave (inverted, subtle) for comb-filter character
      const ghostPath = new Path2D();
      ghostPath.moveTo(xForT(pts[0].t), yForVal(-pts[0].value * 0.6));
      for (let i = 1; i < pts.length; i++) {
        ghostPath.lineTo(xForT(pts[i].t), yForVal(-pts[i].value * 0.6));
      }
      ctx.lineWidth = dpr;
      ctx.strokeStyle = strokeStyle(color, 0.18);
      ctx.stroke(ghostPath);

    } else {
      // Phaser: wave + allpass stage bands
      const grad = ctx.createLinearGradient(0, yCenter - yAmp, 0, yCenter + yAmp);
      grad.addColorStop(0, strokeStyle(color, 0.22));
      grad.addColorStop(0.5, 'transparent');
      grad.addColorStop(1, strokeStyle(color, 0.22));
      strokeAndFill(pts, grad);

      // Allpass stage bands — horizontal lines that wobble with the LFO
      const stages = 5;
      for (let s = 0; s < stages; s++) {
        const bandY = yCenter + ((s - (stages - 1) / 2) * yAmp * 0.38);
        const bandPath = new Path2D();
        for (let i = 0; i < pts.length; i += 3) {
          const x = xForT(pts[i].t);
          const wobble = pts[i].value * yAmp * 0.08 * (s + 1);
          if (i === 0) bandPath.moveTo(x, bandY + wobble);
          else bandPath.lineTo(x, bandY + wobble);
        }
        ctx.lineWidth = dpr * 0.75;
        ctx.strokeStyle = strokeStyle(color, 0.12);
        ctx.stroke(bandPath);
      }
    }

    // ── Depth bar (right edge) ───────────────────────────────────────────────
    if (depth > 0.02) {
      const barX = W - 4 * dpr;
      const topY = yForVal(depth);
      const botY = yForVal(-depth);
      const barGrad = ctx.createLinearGradient(barX, topY, barX, botY);
      barGrad.addColorStop(0, color);
      barGrad.addColorStop(0.5, strokeStyle(color, 0.12));
      barGrad.addColorStop(1, color);
      ctx.fillStyle = barGrad;
      ctx.fillRect(barX - dpr, topY, 2 * dpr, botY - topY);
      ctx.fillStyle = color;
      ctx.fillRect(barX - 2 * dpr, topY, 4 * dpr, dpr);
      ctx.fillRect(barX - 2 * dpr, botY - dpr, 4 * dpr, dpr);
    }

    // ── Labels (in actual-pixel coordinates) ─────────────────────────────────
    const fontSize = Math.ceil(7 * dpr);
    ctx.font = `${fontSize}px monospace`;

    // Rate (bottom-left)
    ctx.fillStyle = strokeStyle(color, 0.85);
    ctx.textAlign = 'left';
    ctx.fillText(`${frequency.toFixed(1)}Hz`, 3 * dpr, H - 2 * dpr);

    // Depth (bottom-center)
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.textAlign = 'center';
    ctx.fillText(`d:${Math.round(depth * 100)}%`, W / 2, H - 2 * dpr);

    // Type badge (bottom-right)
    const typeLabels: Record<ModulationType, string> = { chorus: 'CHR', flanger: 'FLG', phaser: 'PHS' };
    const badge = typeLabels[type];
    const bw = ctx.measureText(badge).width + 6 * dpr;
    ctx.fillStyle = strokeStyle(color, 0.14);
    ctx.beginPath();
    ctx.roundRect(W - bw - 2 * dpr, H - 12 * dpr, bw, 10 * dpr, 2 * dpr);
    ctx.fill();
    ctx.fillStyle = strokeStyle(color, 0.85);
    ctx.textAlign = 'center';
    ctx.fillText(badge, W - bw / 2 - 2 * dpr, H - 3.5 * dpr);
  }, [frequency, depth, baseDelay, type, width, height, color]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, imageRendering: 'pixelated' }}
      className="rounded"
      data-testid="modulation-display"
    />
  );
}
