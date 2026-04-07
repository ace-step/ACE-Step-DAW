/**
 * ModulationDisplay — Shared LFO waveform visualization for Chorus, Flanger, and Phaser.
 *
 * Shows animated modulation waveforms:
 * - Chorus: stereo LFO pair with phase offset
 * - Flanger: delay sweep with feedback indicator
 * - Phaser: frequency sweep arcs with notch indicators
 */
import { useRef, useEffect } from 'react';
import {
  generateStereoLfo,
  generateCombSweep,
  generatePhaserSweep,
} from '../../utils/modulationWave';

type ModulationType = 'chorus' | 'flanger' | 'phaser';

interface ModulationDisplayProps {
  type: ModulationType;
  /** LFO rate in Hz */
  rate: number;
  /** Modulation depth (0–1) */
  depth: number;
  /** Additional params depending on type */
  centerDelay?: number;  // Flanger: center delay ms
  feedback?: number;     // Flanger: feedback amount
  baseFreq?: number;     // Phaser: base frequency Hz
  stages?: number;       // Phaser: allpass stages
  width?: number;
  height?: number;
  /** Effect accent color */
  color?: string;
}

export function ModulationDisplay({
  type,
  rate,
  depth,
  centerDelay = 3,
  feedback = 0.5,
  baseFreq = 1000,
  stages = 4,
  width = 160,
  height = 100,
  color = '#06b6d4',
}: ModulationDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const phaseRef = useRef(0);

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

    let lastTime = 0;

    function draw(timestamp: number) {
      if (!ctx) return;
      const dt = lastTime > 0 ? (timestamp - lastTime) / 1000 : 0;
      lastTime = timestamp;

      // Advance phase based on rate
      phaseRef.current = (phaseRef.current + rate * dt) % 1.0;
      const phase = phaseRef.current;

      // Background
      ctx.clearRect(0, 0, width, height);
      const bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, 'rgba(8, 12, 24, 0.92)');
      bg.addColorStop(1, 'rgba(4, 8, 18, 0.95)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      // Center line
      const cy = height / 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(width, cy);
      ctx.stroke();

      switch (type) {
        case 'chorus':
          drawChorus(ctx, width, height, depth, phase, color);
          break;
        case 'flanger':
          drawFlanger(ctx, width, height, centerDelay, depth, feedback, phase, color);
          break;
        case 'phaser':
          drawPhaser(ctx, width, height, baseFreq, depth, stages, phase, color);
          break;
      }

      animRef.current = requestAnimationFrame(draw);
    }

    animRef.current = requestAnimationFrame(draw);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [type, rate, depth, centerDelay, feedback, baseFreq, stages, width, height, color]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Modulation visualization"
      style={{ width, height }}
      className="rounded"
      data-testid="modulation-display"
    />
  );
}

function drawChorus(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  depth: number,
  phase: number,
  color: string,
) {
  const { left, right } = generateStereoLfo(depth, 0.25, 150);
  const cy = h / 2;
  const amp = (h / 2) * 0.8;

  // Left channel (solid)
  ctx.save();
  ctx.shadowBlur = 4;
  ctx.shadowColor = `${color}60`;
  ctx.beginPath();
  for (let i = 0; i < left.length; i++) {
    const x = (left[i].x + phase) % 1.0;
    const px = x * w;
    const py = cy - left[i].y * amp;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Right channel (dashed, dimmer)
  ctx.beginPath();
  for (let i = 0; i < right.length; i++) {
    const x = (right[i].x + phase) % 1.0;
    const px = x * w;
    const py = cy - right[i].y * amp;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = `${color}60`;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Labels
  ctx.font = '7px monospace';
  ctx.fillStyle = `${color}bb`;
  ctx.textAlign = 'left';
  ctx.fillText('L', 3, 10);
  ctx.fillStyle = `${color}55`;
  ctx.fillText('R', 3, 20);
}

function drawFlanger(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  centerDelay: number,
  depth: number,
  feedback: number,
  phase: number,
  color: string,
) {
  const { delayLine } = generateCombSweep(centerDelay, depth, feedback, 150);
  const margin = 10;
  const drawH = h - margin;

  // Delay sweep line
  ctx.save();
  ctx.shadowBlur = 4;
  ctx.shadowColor = `${color}60`;
  ctx.beginPath();
  for (let i = 0; i < delayLine.length; i++) {
    const x = ((delayLine[i].x + phase) % 1.0) * w;
    const y = margin + (1 - delayLine[i].y) * (drawH - margin);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Feedback indicator bar
  const fbHeight = Math.abs(feedback) * (drawH * 0.3);
  const fbY = h - fbHeight - 2;
  ctx.fillStyle = feedback >= 0 ? `${color}25` : `#ef444425`;
  ctx.fillRect(w - 12, fbY, 8, fbHeight);
  ctx.strokeStyle = feedback >= 0 ? `${color}55` : '#ef444455';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(w - 12, fbY, 8, fbHeight);

  // Labels
  ctx.font = '7px monospace';
  ctx.fillStyle = `${color}bb`;
  ctx.textAlign = 'left';
  ctx.fillText(`${centerDelay.toFixed(1)}ms`, 3, 10);
  ctx.fillStyle = `${color}66`;
  ctx.textAlign = 'right';
  ctx.fillText(`fb:${(feedback * 100).toFixed(0)}%`, w - 15, 10);
}

function drawPhaser(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  baseFreq: number,
  depth: number,
  stages: number,
  phase: number,
  color: string,
) {
  const { sweep, notchCount } = generatePhaserSweep(baseFreq, depth, stages, 150);
  const margin = 12;
  const drawH = h - margin;

  // Frequency sweep line
  ctx.save();
  ctx.shadowBlur = 4;
  ctx.shadowColor = `${color}60`;
  ctx.beginPath();
  for (let i = 0; i < sweep.length; i++) {
    const x = ((sweep[i].x + phase) % 1.0) * w;
    const y = margin + (1 - sweep[i].y) * (drawH - margin);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Notch indicators (horizontal dashes at current sweep position)
  const currentY = sweep[Math.floor(phase * sweep.length) % sweep.length]?.y ?? 0.5;
  for (let n = 0; n < notchCount; n++) {
    const notchY = margin + (1 - currentY) * (drawH - margin) + (n - notchCount / 2) * 8;
    ctx.strokeStyle = `${color}40`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.3, notchY);
    ctx.lineTo(w * 0.7, notchY);
    ctx.stroke();
  }

  // Labels
  ctx.font = '7px monospace';
  ctx.fillStyle = `${color}bb`;
  ctx.textAlign = 'left';
  const freqLabel = baseFreq >= 1000 ? `${(baseFreq / 1000).toFixed(1)}k` : `${Math.round(baseFreq)}`;
  ctx.fillText(`${freqLabel}Hz`, 3, 10);
  ctx.fillStyle = `${color}66`;
  ctx.textAlign = 'right';
  ctx.fillText(`${notchCount} notch`, w - 3, 10);
}
