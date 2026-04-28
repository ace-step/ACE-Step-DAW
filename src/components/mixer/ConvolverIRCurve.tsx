/**
 * ConvolverIRCurve — Impulse response waveform visualization for convolution reverb.
 * Shows pre-delay gap, early reflection region, and decay tail.
 * Inspired by FabFilter Pro-R and Altiverb IR displays.
 */
import { useRef, useEffect } from 'react';
import {
  generateIREnvelope,
  getIRReflections,
  getERBoundary,
  getIRLength,
} from '../../utils/convolverIR';
import { fillBackground, GRID_COLOR, LABEL_AREA_BG } from '../../utils/canvasTheme';
import type { FactoryIRType } from '../../types/project';

interface ConvolverIRCurveProps {
  irType: FactoryIRType;
  preDelay: number;    // Pre-delay in ms
  wet: number;         // Dry/wet mix 0–1
  width?: number;
  height?: number;
  color: string;
}

export function ConvolverIRCurve({
  irType,
  preDelay,
  wet,
  width = 160,
  height = 100,
  color,
}: ConvolverIRCurveProps) {
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

    const labelH = 13;
    const drawH = height - labelH;
    const PAD_LEFT = 2;
    const totalLength = getIRLength(irType, preDelay);

    const xForT = (t: number) => PAD_LEFT + ((t / totalLength) * (width - PAD_LEFT));
    const PAD_TOP = 2;
    const yForAmp = (a: number) => PAD_TOP + (drawH - PAD_TOP * 2) * (1 - a * 0.85);

    // ── Background ──────────────────────────────────────────────────────────
    ctx.clearRect(0, 0, width, height);
    fillBackground(ctx, width, height);

    // Label area
    ctx.fillStyle = LABEL_AREA_BG;
    ctx.fillRect(0, drawH, width, labelH);

    // ── Grid ────────────────────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 0.5;
    for (const amp of [0.75, 0.5, 0.25]) {
      const y = yForAmp(amp);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Time labels
    const gridStep = totalLength <= 0.5 ? 0.1 : totalLength <= 1.5 ? 0.25 : totalLength <= 3 ? 0.5 : 1;
    ctx.font = '7px monospace';
    for (let t = gridStep; t < totalLength - gridStep * 0.3; t += gridStep) {
      const x = xForT(t);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, drawH);
      ctx.stroke();
      // Tick
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, drawH);
      ctx.lineTo(x, drawH + 3);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.textAlign = 'center';
      const label = totalLength <= 0.5 ? `${(t * 1000).toFixed(0)}ms` : `${t.toFixed(1)}s`;
      ctx.fillText(label, x, height - 2);
    }

    // ── Pre-delay region ────────────────────────────────────────────────────
    const preDelayS = preDelay / 1000;
    if (preDelayS > 0.001) {
      const pdX = xForT(preDelayS);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.fillRect(PAD_LEFT, 0, pdX - PAD_LEFT, drawH);
      ctx.strokeStyle = `${color}50`;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(pdX, 2);
      ctx.lineTo(pdX, drawH - 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── ER boundary marker ──────────────────────────────────────────────────
    const erBoundary = getERBoundary(irType, preDelay);
    const erX = xForT(erBoundary);
    if (erX > PAD_LEFT + 5 && erX < width - 10) {
      ctx.strokeStyle = `${color}30`;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(erX, 2);
      ctx.lineTo(erX, drawH - 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // ER label
      ctx.font = '6px monospace';
      ctx.fillStyle = `${color}60`;
      ctx.textAlign = 'left';
      ctx.fillText('ER', erX + 2, 9);
      ctx.fillText('TAIL', erX + 2, 17);
    }

    // ── IR envelope fill ────────────────────────────────────────────────────
    const pts = generateIREnvelope(irType, preDelay, 200);

    // Waveform-style: draw symmetric around center for bipolar look
    const centerY = drawH * 0.5 + 2;

    // Fill area (top half)
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const x = xForT(pts[i].t);
      const halfH = pts[i].amplitude * drawH * 0.42 * wet;
      if (i === 0) ctx.moveTo(x, centerY - halfH);
      else ctx.lineTo(x, centerY - halfH);
    }
    // Bottom half (mirror)
    for (let i = pts.length - 1; i >= 0; i--) {
      const x = xForT(pts[i].t);
      const halfH = pts[i].amplitude * drawH * 0.42 * wet;
      ctx.lineTo(x, centerY + halfH);
    }
    ctx.closePath();

    const fillGrad = ctx.createLinearGradient(0, centerY - drawH * 0.4, 0, centerY + drawH * 0.4);
    fillGrad.addColorStop(0, `${color}35`);
    fillGrad.addColorStop(0.5, `${color}18`);
    fillGrad.addColorStop(1, `${color}35`);
    ctx.fillStyle = fillGrad;
    ctx.fill();

    // ── IR envelope stroke (top edge with glow) ─────────────────────────────
    ctx.save();
    ctx.shadowBlur = 4;
    ctx.shadowColor = `${color}60`;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const x = xForT(pts[i].t);
      const halfH = pts[i].amplitude * drawH * 0.42 * wet;
      if (i === 0) ctx.moveTo(x, centerY - halfH);
      else ctx.lineTo(x, centerY - halfH);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
    // Bottom edge
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const x = xForT(pts[i].t);
      const halfH = pts[i].amplitude * drawH * 0.42 * wet;
      if (i === 0) ctx.moveTo(x, centerY + halfH);
      else ctx.lineTo(x, centerY + halfH);
    }
    ctx.strokeStyle = `${color}80`;
    ctx.lineWidth = 0.75;
    ctx.stroke();
    ctx.restore();

    // ── Early reflection spikes ─────────────────────────────────────────────
    const reflections = getIRReflections(irType, preDelay);
    for (let i = 0; i < reflections.length; i++) {
      const { t, amplitude } = reflections[i];
      if (t > totalLength) break;

      const x = xForT(t);
      const spikeH = amplitude * drawH * 0.42 * wet;

      // Vertical spike line (both directions from center)
      const spikeGrad = ctx.createLinearGradient(x, centerY, x, centerY - spikeH);
      spikeGrad.addColorStop(0, `${color}00`);
      spikeGrad.addColorStop(0.5, `${color}90`);
      spikeGrad.addColorStop(1, `${color}ff`);
      ctx.strokeStyle = spikeGrad;
      ctx.lineWidth = i < 3 ? 1.5 : 1;

      // Top spike
      ctx.beginPath();
      ctx.moveTo(x, centerY);
      ctx.lineTo(x, centerY - spikeH);
      ctx.stroke();
      // Bottom spike
      ctx.beginPath();
      ctx.moveTo(x, centerY);
      ctx.lineTo(x, centerY + spikeH);
      ctx.stroke();

      // Tip dots
      if (i < 4) {
        const dotR = i === 0 ? 2 : 1.5;
        ctx.beginPath();
        ctx.arc(x, centerY - spikeH, dotR, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
    }

    // ── Center line ─────────────────────────────────────────────────────────
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(PAD_LEFT, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    // ── Type badge ──────────────────────────────────────────────────────────
    const badgeLabels: Record<FactoryIRType, string> = {
      smallRoom: 'ROOM',
      largeHall: 'HALL',
      plate: 'PLATE',
      spring: 'SPRING',
    };
    const badge = badgeLabels[irType];
    ctx.font = '7px monospace';
    const badgeW = ctx.measureText(badge).width + 6;
    ctx.fillStyle = `${color}20`;
    ctx.beginPath();
    ctx.roundRect(width - badgeW - 2, height - 12, badgeW, 10, 2);
    ctx.fill();
    ctx.fillStyle = `${color}cc`;
    ctx.textAlign = 'center';
    ctx.fillText(badge, width - badgeW / 2 - 2, height - 4);
  }, [irType, preDelay, wet, width, height, color]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Convolution reverb impulse response"
      style={{ width, height }}
      className="rounded"
      data-testid="convolver-ir-curve"
    />
  );
}
