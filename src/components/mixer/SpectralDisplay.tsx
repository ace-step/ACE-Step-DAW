/**
 * SpectralDisplay — Real-time FFT visualization for spectral effects.
 * Shows the current magnitude spectrum with logarithmic frequency scale.
 */
import { useRef, useEffect, useCallback } from 'react';
import { effectsEngine } from '../../engine/EffectsEngine';
import { getAudioEngine } from '../../hooks/useAudioEngine';

interface SpectralDisplayProps {
  trackId: string;
  effectId: string;
  width: number;
  height: number;
  color: string;
  frozen?: boolean;
}

export function SpectralDisplay({ trackId, effectId, width, height, color, frozen }: SpectralDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (const freq of [100, 1000, 10000]) {
      const x = (Math.log(freq / 20) / Math.log(20000 / 20)) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Get spectrum data from the spectral processor
    const processor = effectsEngine.getSpectralProcessor(trackId, effectId);
    if (!processor) {
      // Show placeholder text
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('No spectral data', width / 2, height / 2);
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    const mag = processor.getMagnitude();
    const halfN = mag.length;

    if (halfN === 0) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    // Use actual audio context sample rate for correct frequency mapping
    let sampleRate = 44100;
    try { sampleRate = getAudioEngine().ctx.sampleRate; } catch { /* fallback */ }
    const nyquist = sampleRate / 2;

    // Draw spectrum as filled area
    ctx.beginPath();
    ctx.moveTo(0, height);

    for (let px = 0; px < width; px++) {
      // Map pixel to frequency (logarithmic)
      const freq = 20 * Math.pow(20000 / 20, px / width);
      // Map frequency to bin
      const bin = Math.round((freq / nyquist) * halfN);
      const clampedBin = Math.max(0, Math.min(halfN - 1, bin));
      const magnitude = mag[clampedBin];

      // Convert to dB and normalize to height
      const db = magnitude > 0 ? 20 * Math.log10(magnitude) : -120;
      const normalized = Math.max(0, Math.min(1, (db + 80) / 80));
      const y = height - normalized * height;

      ctx.lineTo(px, y);
    }

    ctx.lineTo(width, height);
    ctx.closePath();

    // Fill gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, `${color}40`);
    gradient.addColorStop(1, `${color}08`);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Stroke line
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let px = 0; px < width; px++) {
      const freq = 20 * Math.pow(20000 / 20, px / width);
      const bin = Math.round((freq / nyquist) * halfN);
      const clampedBin = Math.max(0, Math.min(halfN - 1, bin));
      const magnitude = mag[clampedBin];
      const db = magnitude > 0 ? 20 * Math.log10(magnitude) : -120;
      const normalized = Math.max(0, Math.min(1, (db + 80) / 80));
      const y = height - normalized * height;
      ctx.lineTo(px, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Frozen indicator
    if (frozen) {
      ctx.fillStyle = `${color}30`;
      ctx.fillRect(0, 0, width, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '8px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('FROZEN', width - 4, 10);
    }

    // Frequency labels
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '7px monospace';
    ctx.textAlign = 'center';
    for (const [freq, label] of [[100, '100'], [1000, '1k'], [10000, '10k']] as const) {
      const x = (Math.log(freq / 20) / Math.log(20000 / 20)) * width;
      ctx.fillText(label, x, height - 2);
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [trackId, effectId, width, height, color, frozen]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="rounded"
      style={{ width, height }}
    />
  );
}
