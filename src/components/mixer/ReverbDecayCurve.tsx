/**
 * ReverbDecayCurve — Impulse response decay envelope visualization.
 * Shows pre-delay gap, early reflection spikes, and exponential decay tail.
 * Inspired by FabFilter Pro-R and Valhalla VintageVerb decay displays.
 */
import { useRef, useEffect } from 'react';
import {
  generateReverbEnvelope,
  getEarlyReflectionTimes,
} from '../../utils/reverbCurve';
import type { AlgorithmicReverbType } from '../../types/project';

interface ReverbDecayCurveProps {
  decay: number;       // RT60 in seconds
  preDelay: number;    // Pre-delay in seconds (not ms)
  damping: number;     // 0–1
  erLevel: number;     // Early reflections level 0–1
  reverbType?: AlgorithmicReverbType;
  width?: number;
  height?: number;
  color?: string;
}

export function ReverbDecayCurve({
  decay,
  preDelay,
  damping,
  erLevel,
  reverbType = 'hall',
  width = 160,
  height = 100,
  color = '#7a6fb8',
}: ReverbDecayCurveProps) {
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

    const displayEnd = Math.min(preDelay + decay * 1.2, preDelay + 8);
    const labelH = 13;
    const drawH = height - labelH;
    const PAD_LEFT = 2;

    // Coordinate helpers
    const xForT = (t: number) => PAD_LEFT + ((t / displayEnd) * (width - PAD_LEFT));
    const yForAmp = (a: number) => 2 + drawH * (1 - a * 0.9);

    // ── Background ──────────────────────────────────────────────────────────
    ctx.clearRect(0, 0, width, height);

    // Subtle atmospheric gradient background — slightly lighter where decay tail lives
    const bgGrad = ctx.createLinearGradient(0, 0, width, 0);
    bgGrad.addColorStop(0, 'rgba(8, 12, 24, 0.95)');
    bgGrad.addColorStop(0.15, `${color}08`);
    bgGrad.addColorStop(1, 'rgba(8, 12, 24, 0.95)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Bottom label area separator
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, drawH, width, labelH);

    // ── Grid ────────────────────────────────────────────────────────────────
    // Horizontal amplitude guides (very subtle)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 0.5;
    for (const amp of [0.75, 0.5, 0.25, 0.1]) {
      const y = yForAmp(amp);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Time ticks + labels
    const gridStep = displayEnd <= 2 ? 0.5 : displayEnd <= 5 ? 1 : 2;
    ctx.font = '7px monospace';
    for (let t = gridStep; t < displayEnd - gridStep * 0.3; t += gridStep) {
      const x = xForT(t);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, drawH);
      ctx.stroke();
      // Tick mark at label boundary
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, drawH);
      ctx.lineTo(x, drawH + 3);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.textAlign = 'center';
      ctx.fillText(`${t.toFixed(0)}s`, x, height - 2);
    }

    // ── Pre-delay region ────────────────────────────────────────────────────
    if (preDelay > 0.003) {
      const pdX = xForT(preDelay);
      // Shade
      ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.fillRect(PAD_LEFT, 0, pdX - PAD_LEFT, drawH);
      // Boundary — color-tinted dashed line
      ctx.strokeStyle = `${color}50`;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(pdX, 2);
      ctx.lineTo(pdX, drawH - 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // Label
      const pdMs = Math.round(preDelay * 1000);
      ctx.font = '7px monospace';
      ctx.fillStyle = `${color}70`;
      ctx.textAlign = 'left';
      ctx.fillText(`▸${pdMs}ms`, PAD_LEFT + 2, 10);
    }

    // ── Decay envelope fill ─────────────────────────────────────────────────
    const pts = generateReverbEnvelope(decay, preDelay, damping, erLevel, 200);

    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const x = xForT(pts[i].t);
      const y = yForAmp(pts[i].amplitude);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(xForT(pts[pts.length - 1].t), drawH);
    ctx.lineTo(xForT(pts[0].t), drawH);
    ctx.closePath();

    // Two-pass fill: base + highlight
    const fillGrad = ctx.createLinearGradient(0, 0, 0, drawH);
    fillGrad.addColorStop(0, `${color}45`);
    fillGrad.addColorStop(0.4, `${color}25`);
    fillGrad.addColorStop(1, `${color}05`);
    ctx.fillStyle = fillGrad;
    ctx.fill();

    // ── Decay curve stroke (with glow) ──────────────────────────────────────
    ctx.save();
    ctx.shadowBlur = 6;
    ctx.shadowColor = `${color}80`;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const x = xForT(pts[i].t);
      const y = yForAmp(pts[i].amplitude);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // ── Early reflections ───────────────────────────────────────────────────
    const erTimes = getEarlyReflectionTimes(reverbType, decay);
    const erBaseAmps = [0.92, 0.72, 0.56, 0.43, 0.32, 0.24, 0.18];
    const erColor = `${color}`;

    for (let i = 0; i < erTimes.length; i++) {
      const erT = preDelay + erTimes[i];
      if (erT > displayEnd) break;

      const baseAmp = erBaseAmps[Math.min(i, erBaseAmps.length - 1)];
      const amp = baseAmp * (0.2 + erLevel * 0.8);
      const erX = xForT(erT);
      const erTopY = yForAmp(amp);

      // Gradient bar: transparent at base → colored at tip
      const barGrad = ctx.createLinearGradient(erX, drawH, erX, erTopY);
      barGrad.addColorStop(0, `${erColor}00`);
      barGrad.addColorStop(0.6, `${erColor}88`);
      barGrad.addColorStop(1, `${erColor}ff`);
      ctx.strokeStyle = barGrad;
      ctx.lineWidth = i === 0 ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(erX, drawH);
      ctx.lineTo(erX, erTopY);
      ctx.stroke();

      // Bright cap dot — first reflection is largest
      const dotR = i === 0 ? 2.5 : i < 3 ? 2 : 1.5;
      ctx.beginPath();
      ctx.arc(erX, erTopY, dotR, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      // White highlight on first spike
      if (i === 0) {
        ctx.beginPath();
        ctx.arc(erX - 0.5, erTopY - 0.5, 0.8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fill();
      }
    }

    // ── RT60 decay marker ───────────────────────────────────────────────────
    const rtX = xForT(preDelay + decay);
    if (rtX > PAD_LEFT + 20 && rtX < width - 6) {
      ctx.strokeStyle = `${color}30`;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(rtX, 2);
      ctx.lineTo(rtX, drawH - 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = '7px monospace';
      ctx.fillStyle = `${color}bb`;
      ctx.textAlign = 'center';
      const rtLabel = `${decay.toFixed(1)}s`;
      ctx.fillText(rtLabel, rtX, 9);
    }

    // ── Type badge (bottom-right) ────────────────────────────────────────────
    const badge = reverbType.toUpperCase();
    ctx.font = '7px monospace';
    const badgeW = ctx.measureText(badge).width + 6;
    ctx.fillStyle = `${color}20`;
    ctx.beginPath();
    ctx.roundRect(width - badgeW - 2, height - 12, badgeW, 10, 2);
    ctx.fill();
    ctx.fillStyle = `${color}cc`;
    ctx.textAlign = 'center';
    ctx.fillText(badge, width - badgeW / 2 - 2, height - 4);
  }, [decay, preDelay, damping, erLevel, reverbType, width, height, color]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="rounded"
      data-testid="reverb-decay-curve"
    />
  );
}
