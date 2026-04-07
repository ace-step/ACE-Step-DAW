/**
 * DeEsserDisplay — Frequency band visualization for de-esser effect.
 * Shows the detection band on a frequency axis with threshold line.
 */
import { useRef, useEffect } from 'react';
import { fillBackground, GRID_COLOR, LABEL_COLOR } from '../../utils/canvasTheme';

const MIN_FREQ = 1000;
const MAX_FREQ = 20000;
const FREQ_LABELS = [2000, 4000, 8000, 16000];

function freqToX(freq: number, width: number): number {
  return ((Math.log2(freq) - Math.log2(MIN_FREQ)) / (Math.log2(MAX_FREQ) - Math.log2(MIN_FREQ))) * width;
}

interface DeEsserDisplayProps {
  frequency: number;
  bandwidth: number;
  threshold: number;
  range: number;
  mode: 'wideband' | 'split';
  width?: number;
  height?: number;
  color?: string;
}

export function DeEsserDisplay({
  frequency,
  bandwidth,
  threshold,
  range,
  mode,
  width = 160,
  height = 100,
  color = '#c4a654',
}: DeEsserDisplayProps) {
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

    const dbMin = -60;
    const dbMax = 0;
    const dbToY = (db: number) => height - ((db - dbMin) / (dbMax - dbMin)) * height;

    ctx.clearRect(0, 0, width, height);
    fillBackground(ctx, width, height);

    // Frequency grid
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 0.5;
    ctx.font = '7px monospace';
    ctx.fillStyle = LABEL_COLOR;

    for (const f of FREQ_LABELS) {
      const x = freqToX(f, width);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x, height - 2);
    }

    // dB grid lines
    for (const db of [-40, -20, 0]) {
      const y = dbToY(db);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Detection band fill
    const lowFreq = frequency / Math.pow(2, bandwidth / 2);
    const highFreq = frequency * Math.pow(2, bandwidth / 2);
    const bandLeft = freqToX(Math.max(lowFreq, MIN_FREQ), width);
    const bandRight = freqToX(Math.min(highFreq, MAX_FREQ), width);
    const bandWidth = bandRight - bandLeft;

    // Band highlight
    const bandGrad = ctx.createLinearGradient(bandLeft, 0, bandLeft, height);
    bandGrad.addColorStop(0, `${color}30`);
    bandGrad.addColorStop(1, `${color}08`);
    ctx.fillStyle = bandGrad;
    ctx.fillRect(bandLeft, 0, bandWidth, height);

    // Band borders
    ctx.strokeStyle = `${color}60`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(bandLeft, 0); ctx.lineTo(bandLeft, height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bandRight, 0); ctx.lineTo(bandRight, height); ctx.stroke();

    // Center frequency marker
    const centerX = freqToX(frequency, width);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 2]);
    ctx.beginPath(); ctx.moveTo(centerX, 0); ctx.lineTo(centerX, height); ctx.stroke();
    ctx.setLineDash([]);

    // Threshold line
    const threshY = dbToY(threshold);
    ctx.strokeStyle = '#ef4444aa';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(0, threshY); ctx.lineTo(width, threshY); ctx.stroke();
    ctx.setLineDash([]);

    // Range indicator (how much reduction below threshold)
    const rangeY = dbToY(threshold - range);
    const rangeTopY = Math.min(threshY, rangeY);
    const rangeHeight = Math.abs(rangeY - threshY);
    ctx.fillStyle = `${color}12`;
    ctx.fillRect(bandLeft, rangeTopY, bandWidth, rangeHeight);

    // Labels
    ctx.font = '8px monospace';
    ctx.fillStyle = `${color}80`;
    ctx.textAlign = 'right';
    ctx.fillText(mode.toUpperCase(), width - 3, 10);

    ctx.fillStyle = '#ef4444aa';
    ctx.textAlign = 'left';
    ctx.fillText(`${threshold}dB`, 2, threshY - 2);
  }, [frequency, bandwidth, threshold, range, mode, width, height, color]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="De-esser frequency display"
      style={{ width, height }}
      className="rounded"
      data-testid="deesser-display"
    />
  );
}
