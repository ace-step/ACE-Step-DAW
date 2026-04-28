/**
 * TransientShaperDisplay — Envelope visualization for transient shaper effect.
 * Shows how attack and sustain parameters shape the transient envelope.
 */
import { useRef, useEffect } from 'react';
import { fillBackground, GRID_COLOR } from '../../utils/canvasTheme';

interface TransientShaperDisplayProps {
  attack: number;   // -100 to 100
  sustain: number;  // -100 to 100
  width?: number;
  height?: number;
  color?: string;
}

export function TransientShaperDisplay({
  attack,
  sustain,
  width = 160,
  height = 100,
  color = '#b89340',
}: TransientShaperDisplayProps) {
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

    // Grid
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 0.5;
    const midY = height / 2;
    ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(width, midY); ctx.stroke();

    // Time markers
    ctx.font = '7px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.textAlign = 'center';
    const timePoints = [0.25, 0.5, 0.75];
    for (const t of timePoints) {
      const x = t * width;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }

    // Generate envelope shapes
    // Original envelope: fast attack, exponential decay
    const steps = 200;
    const attackPhase = 0.05; // 5% of time = attack portion
    const sustainPhase = 0.3; // 30% = sustain portion

    const originalEnv: number[] = [];
    const shapedEnv: number[] = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      let env: number;

      if (t < attackPhase) {
        // Attack rise
        env = t / attackPhase;
      } else if (t < attackPhase + sustainPhase) {
        // Sustain decay
        const decay = (t - attackPhase) / sustainPhase;
        env = 1 - decay * 0.4;
      } else {
        // Tail
        const tail = (t - attackPhase - sustainPhase) / (1 - attackPhase - sustainPhase);
        env = 0.6 * Math.exp(-3 * tail);
      }

      originalEnv.push(env);

      // Apply attack/sustain shaping
      let shaped = env;
      const attackMod = attack / 100; // -1 to 1
      const sustainMod = sustain / 100; // -1 to 1

      if (t < attackPhase + 0.05) {
        // Attack region: boost or cut transient
        shaped = env * (1 + attackMod * 0.8);
      } else {
        // Sustain region: boost or cut body
        shaped = env * (1 + sustainMod * 0.6);
      }

      shapedEnv.push(Math.max(0, Math.min(1.5, shaped)));
    }

    const envToY = (v: number) => height - (v / 1.5) * height;

    // Draw original envelope (dimmed)
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * width;
      const y = envToY(originalEnv[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Fill between original and shaped
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * width;
      if (i === 0) ctx.moveTo(x, envToY(shapedEnv[i]));
      else ctx.lineTo(x, envToY(shapedEnv[i]));
    }
    for (let i = steps; i >= 0; i--) {
      ctx.lineTo((i / steps) * width, envToY(originalEnv[i]));
    }
    ctx.closePath();
    ctx.fillStyle = `${color}20`;
    ctx.fill();

    // Draw shaped envelope
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * width;
      const y = envToY(shapedEnv[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Labels
    ctx.font = '7px monospace';
    ctx.fillStyle = `${color}90`;
    ctx.textAlign = 'left';
    ctx.fillText(`ATK ${attack > 0 ? '+' : ''}${attack}`, 3, 10);
    ctx.fillText(`SUS ${sustain > 0 ? '+' : ''}${sustain}`, 3, 20);
  }, [attack, sustain, width, height, color]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Transient shaper display"
      style={{ width, height }}
      className="rounded"
      data-testid="transient-shaper-display"
    />
  );
}
