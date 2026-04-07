/**
 * NoiseReductionDisplay — Threshold visualization for noise reduction effect.
 * Shows noise floor threshold with reduction amount and mode indicator.
 */
import { useRef, useEffect } from 'react';
import { fillBackground, GRID_COLOR, LABEL_COLOR } from '../../utils/canvasTheme';

interface NoiseReductionDisplayProps {
  threshold: number;   // dB
  amount: number;      // 0 to 1
  mode: 'gentle' | 'standard' | 'aggressive';
  hfEmphasis: number;  // 0 to 1
  width?: number;
  height?: number;
  color?: string;
}

export function NoiseReductionDisplay({
  threshold,
  amount,
  mode,
  hfEmphasis,
  width = 160,
  height = 100,
  color = '#8a8a8a',
}: NoiseReductionDisplayProps) {
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

    const dbMin = -80;
    const dbMax = 0;
    const dbToY = (db: number) => height - ((db - dbMin) / (dbMax - dbMin)) * height;

    ctx.clearRect(0, 0, width, height);
    fillBackground(ctx, width, height);

    // Frequency axis (simplified: low to high)
    const freqLabels = ['100', '1k', '5k', '10k'];
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 0.5;
    ctx.font = '7px monospace';
    ctx.fillStyle = LABEL_COLOR;

    for (let i = 0; i < freqLabels.length; i++) {
      const x = ((i + 1) / (freqLabels.length + 1)) * width;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillText(freqLabels[i], x, height - 2);
    }

    // dB grid
    for (const db of [-60, -40, -20, 0]) {
      const y = dbToY(db);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    // Simulated noise floor shape (frequency-dependent)
    const noiseFloor: number[] = [];
    const reductionLine: number[] = [];
    const steps = 100;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps; // 0=low freq, 1=high freq
      // Noise floor typically rises slightly at high frequencies
      const baseNoise = threshold + 5 * Math.sin(t * Math.PI * 0.5);
      // HF emphasis: more reduction at high frequencies
      const hfBoost = hfEmphasis * t * 10;
      noiseFloor.push(baseNoise + (1 - t) * 3);
      reductionLine.push(baseNoise - amount * 20 - hfBoost);
    }

    // Noise floor region (filled area above reduction line)
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * width;
      const y = dbToY(noiseFloor[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = `${color}15`;
    ctx.fill();

    // Noise floor line
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * width;
      const y = dbToY(noiseFloor[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Threshold line
    const threshY = dbToY(threshold);
    ctx.strokeStyle = '#ef4444aa';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(0, threshY); ctx.lineTo(width, threshY); ctx.stroke();
    ctx.setLineDash([]);

    // Reduction curve (how much is being removed)
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * width;
      const y = dbToY(Math.max(reductionLine[i], dbMin));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Reduction fill
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * width;
      if (i === 0) ctx.moveTo(x, dbToY(noiseFloor[i]));
      else ctx.lineTo(x, dbToY(noiseFloor[i]));
    }
    for (let i = steps; i >= 0; i--) {
      ctx.lineTo((i / steps) * width, dbToY(Math.max(reductionLine[i], dbMin)));
    }
    ctx.closePath();
    ctx.fillStyle = `${color}12`;
    ctx.fill();

    // Labels
    ctx.font = '8px monospace';
    ctx.fillStyle = `${color}80`;
    ctx.textAlign = 'right';
    const modeLabels: Record<string, string> = { gentle: 'GENTLE', standard: 'STD', aggressive: 'AGGR' };
    ctx.fillText(modeLabels[mode] ?? mode.toUpperCase(), width - 3, 10);

    ctx.fillStyle = '#ef4444aa';
    ctx.textAlign = 'left';
    ctx.fillText(`${threshold}dB`, 2, threshY - 2);
  }, [threshold, amount, mode, hfEmphasis, width, height, color]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Noise reduction display"
      style={{ width, height }}
      className="rounded"
      data-testid="noise-reduction-display"
    />
  );
}
