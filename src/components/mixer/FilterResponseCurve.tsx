/**
 * FilterResponseCurve — Bode plot (magnitude response) for LP/HP/BP filters.
 * Shows frequency response on a log scale with resonance peak and cutoff marker.
 * Inspired by FabFilter Volcano and Ableton Auto Filter.
 */
import { useRef, useEffect } from 'react';
import { generateFilterResponse, type FilterType } from '../../utils/filterResponse';
import { fillBackground, GRID_COLOR, GRID_COLOR_STRONG, LABEL_COLOR, LABEL_AREA_BG } from '../../utils/canvasTheme';

interface FilterResponseCurveProps {
  frequency: number;   // Cutoff frequency in Hz
  resonance: number;   // Q factor
  filterType: FilterType;
  width?: number;
  height?: number;
  color?: string;
}

const FREQ_LABELS = [
  { freq: 100, label: '100' },
  { freq: 1000, label: '1k' },
  { freq: 10000, label: '10k' },
];

const LOG_MIN = Math.log10(20);
const LOG_MAX = Math.log10(20000);

export function FilterResponseCurve({
  frequency,
  resonance,
  filterType,
  width = 160,
  height = 100,
  color = '#10b981',
}: FilterResponseCurveProps) {
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
    // dB range: -48 to +18
    const DB_MIN = -48;
    const DB_MAX = 18;
    const DB_RANGE = DB_MAX - DB_MIN;

    const xForFreq = (f: number) => {
      const logF = Math.log10(f);
      return ((logF - LOG_MIN) / (LOG_MAX - LOG_MIN)) * width;
    };
    const yForDb = (db: number) => {
      const clamped = Math.max(DB_MIN, Math.min(DB_MAX, db));
      return drawH - ((clamped - DB_MIN) / DB_RANGE) * (drawH - 4);
    };

    // ── Background ──────────────────────────────────────────────────────────
    ctx.clearRect(0, 0, width, height);
    fillBackground(ctx, width, height);

    // Label area
    ctx.fillStyle = LABEL_AREA_BG;
    ctx.fillRect(0, drawH, width, labelH);

    // ── dB grid ─────────────────────────────────────────────────────────────
    ctx.font = '7px monospace';
    for (const db of [0, -12, -24, -36]) {
      const y = yForDb(db);
      ctx.strokeStyle = db === 0 ? GRID_COLOR_STRONG : GRID_COLOR;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      if (db <= 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.textAlign = 'left';
        ctx.fillText(`${db}`, 2, y - 1);
      }
    }

    // ── Frequency grid + labels ──────────────────────────────────────────────
    for (const { freq, label } of FREQ_LABELS) {
      const x = xForFreq(freq);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, drawH);
      ctx.stroke();
      // Tick
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, drawH);
      ctx.lineTo(x, drawH + 3);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, height - 2);
    }

    // ── Generate and draw response curve ────────────────────────────────────
    const pts = generateFilterResponse(frequency, resonance, filterType, 200);

    // Fill area under the curve (toward 0dB line for visual clarity)
    const zeroY = yForDb(0);
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const x = xForFreq(pts[i].freq);
      const y = yForDb(pts[i].db);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    // Close toward 0dB line
    ctx.lineTo(xForFreq(pts[pts.length - 1].freq), zeroY);
    ctx.lineTo(xForFreq(pts[0].freq), zeroY);
    ctx.closePath();

    const fillGrad = ctx.createLinearGradient(0, 0, 0, drawH);
    fillGrad.addColorStop(0, `${color}40`);
    fillGrad.addColorStop(0.5, `${color}20`);
    fillGrad.addColorStop(1, `${color}05`);
    ctx.fillStyle = fillGrad;
    ctx.fill();

    // Curve stroke with glow
    ctx.save();
    ctx.shadowBlur = 5;
    ctx.shadowColor = `${color}70`;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const x = xForFreq(pts[i].freq);
      const y = yForDb(pts[i].db);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // ── Cutoff frequency marker ──────────────────────────────────────────────
    const fcX = xForFreq(Math.max(20, Math.min(20000, frequency)));

    // Dashed vertical line
    ctx.strokeStyle = `${color}55`;
    ctx.lineWidth = 0.75;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(fcX, 4);
    ctx.lineTo(fcX, drawH - 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Cutoff frequency label
    const freqLabel = frequency >= 1000
      ? `${(frequency / 1000).toFixed(frequency >= 10000 ? 0 : 1)}k`
      : `${Math.round(frequency)}`;
    ctx.font = '7px monospace';
    ctx.fillStyle = `${color}cc`;
    // Avoid edges
    const labelX = Math.max(10, Math.min(fcX, width - 18));
    ctx.textAlign = fcX > width * 0.7 ? 'right' : 'center';
    ctx.fillText(freqLabel, labelX, 10);

    // Dot at the curve's cutoff point
    const fcDb = pts.reduce((closest, p) => {
      return Math.abs(p.freq - frequency) < Math.abs(closest.freq - frequency) ? p : closest;
    }, pts[0]);
    const dotY = yForDb(fcDb.db);
    ctx.save();
    ctx.shadowBlur = 6;
    ctx.shadowColor = color;
    ctx.beginPath();
    ctx.arc(fcX, dotY, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
    // White highlight on dot
    ctx.beginPath();
    ctx.arc(fcX - 0.5, dotY - 0.5, 0.8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fill();

    // ── Filter type badge ────────────────────────────────────────────────────
    const typeLabels: Record<FilterType, string> = { lowpass: 'LP', highpass: 'HP', bandpass: 'BP' };
    const badge = typeLabels[filterType];
    ctx.font = '7px monospace';
    const bw = ctx.measureText(badge).width + 6;
    ctx.fillStyle = `${color}20`;
    ctx.beginPath();
    ctx.roundRect(width - bw - 2, height - 12, bw, 10, 2);
    ctx.fill();
    ctx.fillStyle = `${color}cc`;
    ctx.textAlign = 'center';
    ctx.fillText(badge, width - bw / 2 - 2, height - 4);
  }, [frequency, resonance, filterType, width, height, color]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Filter frequency response curve"
      style={{ width, height }}
      className="rounded"
      data-testid="filter-response-curve"
    />
  );
}
