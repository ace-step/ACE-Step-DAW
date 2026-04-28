/**
 * ConvolverDisplay — Impulse response waveform visualization for convolver effect.
 * Shows a stylized IR waveform indicating the reverb character.
 */
import { useRef, useEffect } from 'react';
import { fillBackground, GRID_COLOR, LABEL_COLOR } from '../../utils/canvasTheme';

interface ConvolverDisplayProps {
  irType: string;       // Factory IR type name
  wet: number;          // 0 to 1
  preDelay: number;     // seconds
  width?: number;
  height?: number;
  color?: string;
}

// Synthetic IR shapes per factory type (duration in seconds, decay character)
const IR_SHAPES: Record<string, { duration: number; earlyDensity: number; decayRate: number }> = {
  smallRoom:   { duration: 0.5,  earlyDensity: 0.8, decayRate: 4 },
  mediumRoom:  { duration: 1.0,  earlyDensity: 0.6, decayRate: 2.5 },
  largeHall:   { duration: 2.5,  earlyDensity: 0.4, decayRate: 1.2 },
  cathedral:   { duration: 4.0,  earlyDensity: 0.3, decayRate: 0.8 },
  plate:       { duration: 1.5,  earlyDensity: 0.9, decayRate: 2.0 },
  spring:      { duration: 0.8,  earlyDensity: 1.0, decayRate: 3.0 },
  chamber:     { duration: 1.2,  earlyDensity: 0.5, decayRate: 2.0 },
  ambient:     { duration: 3.0,  earlyDensity: 0.2, decayRate: 1.0 },
};

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

export function ConvolverDisplay({
  irType,
  wet,
  preDelay,
  width = 160,
  height = 80,
  color = '#a07cc8',
}: ConvolverDisplayProps) {
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

    ctx.clearRect(0, 0, width, height);
    fillBackground(ctx, width, height);

    const shape = IR_SHAPES[irType] ?? IR_SHAPES.mediumRoom;
    const totalDuration = shape.duration + preDelay;
    const timeToX = (t: number) => (t / totalDuration) * width;
    const midY = height / 2;

    // Time grid
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 0.5;
    ctx.font = '7px monospace';
    ctx.fillStyle = LABEL_COLOR;

    const timeStep = totalDuration <= 1 ? 0.2 : totalDuration <= 2 ? 0.5 : 1.0;
    for (let t = timeStep; t < totalDuration; t += timeStep) {
      const x = timeToX(t);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillText(`${t.toFixed(1)}s`, x, height - 2);
    }

    // Center line
    ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(width, midY); ctx.stroke();

    // Pre-delay region
    if (preDelay > 0.001) {
      const pdX = timeToX(preDelay);
      ctx.fillStyle = `${color}08`;
      ctx.fillRect(0, 0, pdX, height);
      ctx.strokeStyle = `${color}40`;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(pdX, 0); ctx.lineTo(pdX, height); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Generate synthetic IR waveform
    // Simple string hash for unique waveform per IR type
    let hash = 0;
    for (let i = 0; i < irType.length; i++) {
      hash = ((hash << 5) - hash + irType.charCodeAt(i)) | 0;
    }
    const rand = seededRandom(Math.abs(hash) + 1);
    const steps = 300;
    const maxAmp = height * 0.4 * wet;

    // Decay envelope fill
    const envGrad = ctx.createLinearGradient(timeToX(preDelay), 0, width, 0);
    envGrad.addColorStop(0, `${color}25`);
    envGrad.addColorStop(1, `${color}05`);

    ctx.beginPath();
    ctx.moveTo(timeToX(preDelay), midY);

    for (let i = 0; i <= steps; i++) {
      const t = preDelay + (i / steps) * shape.duration;
      const x = timeToX(t);
      const progress = i / steps;

      // Exponential decay envelope
      const envelope = Math.exp(-progress * shape.decayRate * 2);
      // Early reflections add density
      const earlyBoost = progress < 0.1 ? (1 + shape.earlyDensity * (1 - progress / 0.1)) : 1;
      // Random noise-like waveform
      const noise = (rand() - 0.5) * 2;
      const amp = noise * envelope * earlyBoost * maxAmp;

      ctx.lineTo(x, midY - amp);
    }

    // Mirror for bottom fill
    for (let i = steps; i >= 0; i--) {
      const t = preDelay + (i / steps) * shape.duration;
      const x = timeToX(t);
      const progress = i / steps;
      const envelope = Math.exp(-progress * shape.decayRate * 2);
      ctx.lineTo(x, midY + envelope * maxAmp * 0.3);
    }
    ctx.closePath();
    ctx.fillStyle = envGrad;
    ctx.fill();

    // Draw waveform outline
    const rand2 = seededRandom(irType.length * 137);
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = preDelay + (i / steps) * shape.duration;
      const x = timeToX(t);
      const progress = i / steps;
      const envelope = Math.exp(-progress * shape.decayRate * 2);
      const earlyBoost = progress < 0.1 ? (1 + shape.earlyDensity * (1 - progress / 0.1)) : 1;
      const noise = (rand2() - 0.5) * 2;
      const amp = noise * envelope * earlyBoost * maxAmp;

      if (i === 0) ctx.moveTo(x, midY - amp);
      else ctx.lineTo(x, midY - amp);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Decay envelope line
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = preDelay + (i / steps) * shape.duration;
      const x = timeToX(t);
      const progress = i / steps;
      const envelope = Math.exp(-progress * shape.decayRate * 2) * maxAmp;
      if (i === 0) ctx.moveTo(x, midY - envelope);
      else ctx.lineTo(x, midY - envelope);
    }
    ctx.strokeStyle = `${color}40`;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.stroke();
    ctx.setLineDash([]);

    // IR type label
    ctx.font = '8px monospace';
    ctx.fillStyle = `${color}80`;
    ctx.textAlign = 'right';
    ctx.fillText(irType.replace(/([A-Z])/g, ' $1').trim().toUpperCase(), width - 3, 10);
  }, [irType, wet, preDelay, width, height, color]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Convolution reverb display"
      style={{ width, height }}
      className="rounded"
      data-testid="convolver-display"
    />
  );
}
