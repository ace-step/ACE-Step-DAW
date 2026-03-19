import { useEffect, useRef, useCallback } from 'react';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import {
  computeMomentaryLoudness,
  freqToX,
  dbToY,
} from '../../utils/loudnessMetering';

const MIN_FREQ = 20;
const MAX_FREQ = 20000;
const MIN_DB = -90;
const MAX_DB = 0;

// Frequency labels for grid
const FREQ_LABELS = [30, 60, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
// dB labels for grid
const DB_LABELS = [-80, -60, -40, -20, 0];

const LUFS_SMOOTHING = 0.85;

function formatFreq(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
}

function formatLufs(lufs: number): string {
  if (!Number.isFinite(lufs)) return '-inf';
  return lufs.toFixed(1);
}

function getLufsColor(lufs: number): string {
  if (!Number.isFinite(lufs)) return '#6b7280'; // gray
  if (lufs > -3) return '#ef4444'; // red — clipping
  if (lufs > -8) return '#f59e0b'; // amber — loud
  if (lufs > -14) return '#22c55e'; // green — nominal
  return '#3b82f6'; // blue — quiet
}

interface SpectrumAnalyzerProps {
  width?: number;
  height?: number;
}

export function SpectrumAnalyzer({
  width = 320,
  height = 160,
}: SpectrumAnalyzerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const smoothedLufsRef = useRef<number>(-Infinity);
  const lufsDisplayRef = useRef<HTMLSpanElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const engine = getAudioEngine();
    const dpr = window.devicePixelRatio || 1;

    // Set canvas resolution for high DPI
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    }

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = 'rgba(8, 12, 24, 0.95)';
    ctx.fillRect(0, 0, width, height);

    // Grid lines — frequency (vertical)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 0.5;
    ctx.font = '9px monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.textAlign = 'center';

    for (const freq of FREQ_LABELS) {
      const x = freqToX(freq, width, MIN_FREQ, MAX_FREQ);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.fillText(formatFreq(freq), x, height - 2);
    }

    // Grid lines — dB (horizontal)
    ctx.textAlign = 'left';
    for (const db of DB_LABELS) {
      const y = dbToY(db, height, MIN_DB, MAX_DB);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.fillText(`${db}`, 2, y - 2);
    }

    // Get spectrum data
    const spectrum = engine.getMasterSpectrum();
    const sampleRate = engine.sampleRate;
    const binCount = engine.spectrumBinCount;
    const binWidth = sampleRate / (binCount * 2);

    // Draw spectrum bars as filled area
    ctx.beginPath();
    ctx.moveTo(0, height);

    let prevX = 0;
    for (let i = 1; i < binCount; i++) {
      const freq = i * binWidth;
      if (freq < MIN_FREQ || freq > MAX_FREQ) continue;

      const x = freqToX(freq, width, MIN_FREQ, MAX_FREQ);
      const db = Math.max(MIN_DB, Math.min(MAX_DB, spectrum[i]));
      const y = dbToY(db, height, MIN_DB, MAX_DB);

      if (prevX === 0) {
        ctx.moveTo(x, height);
      }
      ctx.lineTo(x, y);
      prevX = x;
    }

    // Close the path to fill
    ctx.lineTo(prevX, height);
    ctx.closePath();

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.6)'); // blue top
    gradient.addColorStop(0.5, 'rgba(34, 197, 94, 0.3)'); // green middle
    gradient.addColorStop(1, 'rgba(34, 197, 94, 0.05)'); // transparent bottom
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw spectrum line on top
    ctx.beginPath();
    let started = false;
    for (let i = 1; i < binCount; i++) {
      const freq = i * binWidth;
      if (freq < MIN_FREQ || freq > MAX_FREQ) continue;

      const x = freqToX(freq, width, MIN_FREQ, MAX_FREQ);
      const db = Math.max(MIN_DB, Math.min(MAX_DB, spectrum[i]));
      const y = dbToY(db, height, MIN_DB, MAX_DB);

      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // LUFS calculation from time-domain data
    const timeDomainData = engine.getMasterTimeDomainData();
    const momentaryLufs = computeMomentaryLoudness(timeDomainData, sampleRate);

    // Smooth LUFS display
    const prev = smoothedLufsRef.current;
    if (!Number.isFinite(prev)) {
      smoothedLufsRef.current = momentaryLufs;
    } else if (!Number.isFinite(momentaryLufs)) {
      smoothedLufsRef.current = prev * LUFS_SMOOTHING;
      if (prev < MIN_DB) smoothedLufsRef.current = -Infinity;
    } else {
      smoothedLufsRef.current = prev * LUFS_SMOOTHING + momentaryLufs * (1 - LUFS_SMOOTHING);
    }

    // Update LUFS display via ref (avoid React re-renders)
    const lufsEl = lufsDisplayRef.current;
    if (lufsEl) {
      const lufsVal = smoothedLufsRef.current;
      lufsEl.textContent = `${formatLufs(lufsVal)} LUFS`;
      lufsEl.style.color = getLufsColor(lufsVal);
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [width, height]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return (
    <div className="flex flex-col items-center gap-1" data-testid="spectrum-analyzer">
      <div className="flex items-center justify-between w-full px-0.5">
        <span className="text-[9px] text-zinc-500 uppercase tracking-widest">Spectrum</span>
        <span
          ref={lufsDisplayRef}
          className="text-[11px] font-mono font-bold tabular-nums"
          style={{ color: '#6b7280' }}
          data-testid="lufs-display"
        >
          -inf LUFS
        </span>
      </div>
      <canvas
        ref={canvasRef}
        style={{ width, height }}
        className="rounded border border-white/5"
        data-testid="spectrum-canvas"
      />
    </div>
  );
}
