/**
 * GainReductionMeter — Animated bar meter with VU-style ballistics.
 *
 * Shows compressor/limiter gain reduction with:
 * - Fast attack (instant response to peaks)
 * - Slow exponential release (smooth decay)
 * - Peak hold indicator (holds maximum GR for ~1.5s)
 * - Color gradient: green → yellow → red by GR amount
 */
import { useRef, useEffect, useCallback } from 'react';

interface GainReductionMeterProps {
  /** Current gain reduction in dB (positive number, e.g. 6 = 6dB reduction) */
  reductionDb: number;
  /** Max display range in dB (default: 24) */
  maxDb?: number;
  /** Width of the meter bar */
  width?: number;
  /** Height of the meter bar */
  height?: number;
  /** Accent color for the meter fill */
  color?: string;
  /** Orientation */
  direction?: 'horizontal' | 'vertical';
}

// Ballistic constants
const ATTACK_COEFF = 0.05;    // Fast attack (~1 frame to respond)
const RELEASE_COEFF = 0.985;  // Slow release (~500ms to half-decay)
const PEAK_HOLD_FRAMES = 90;  // ~1.5 seconds at 60fps

export function GainReductionMeter({
  reductionDb,
  maxDb = 24,
  width = 120,
  height = 8,
  color = '#f59e0b',
  direction = 'horizontal',
}: GainReductionMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const displayRef = useRef(0);       // Smoothed display value
  const peakRef = useRef(0);          // Peak hold value
  const peakHoldRef = useRef(0);      // Frames remaining in peak hold

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const target = Math.min(reductionDb, maxDb);

    // Ballistics: fast attack, slow release
    if (target > displayRef.current) {
      // Attack: fast tracking
      displayRef.current += (target - displayRef.current) * (1 - ATTACK_COEFF);
    } else {
      // Release: exponential decay
      displayRef.current *= RELEASE_COEFF;
      if (displayRef.current < 0.01) displayRef.current = 0;
    }

    // Peak hold
    if (target > peakRef.current) {
      peakRef.current = target;
      peakHoldRef.current = PEAK_HOLD_FRAMES;
    } else if (peakHoldRef.current > 0) {
      peakHoldRef.current--;
    } else {
      // Decay peak
      peakRef.current *= 0.99;
      if (peakRef.current < 0.01) peakRef.current = 0;
    }

    const dpr = window.devicePixelRatio || 1;
    const cw = direction === 'horizontal' ? width : height;
    const ch = direction === 'horizontal' ? height : width;

    if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      ctx.scale(dpr, dpr);
    }

    ctx.clearRect(0, 0, cw, ch);

    // Background track
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.beginPath();
    ctx.roundRect(0, 0, cw, ch, 2);
    ctx.fill();

    // Fill bar
    const fillRatio = Math.min(displayRef.current / maxDb, 1);
    if (fillRatio > 0.001) {
      const fillLen = fillRatio * (direction === 'horizontal' ? cw : ch);

      // Color gradient based on amount: green → yellow → red
      const grad = direction === 'horizontal'
        ? ctx.createLinearGradient(0, 0, cw, 0)
        : ctx.createLinearGradient(0, ch, 0, 0);
      grad.addColorStop(0, color);
      grad.addColorStop(0.5, '#eab308');   // yellow
      grad.addColorStop(1, '#ef4444');     // red

      ctx.fillStyle = grad;
      ctx.beginPath();
      if (direction === 'horizontal') {
        ctx.roundRect(0, 0, fillLen, ch, 2);
      } else {
        ctx.roundRect(0, ch - fillLen, cw, fillLen, 2);
      }
      ctx.fill();
    }

    // Peak hold indicator
    const peakRatio = Math.min(peakRef.current / maxDb, 1);
    if (peakRatio > 0.005) {
      const peakPos = peakRatio * (direction === 'horizontal' ? cw : ch);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      if (direction === 'horizontal') {
        ctx.fillRect(peakPos - 1, 0, 2, ch);
      } else {
        ctx.fillRect(0, ch - peakPos - 1, cw, 2);
      }
    }

    animRef.current = requestAnimationFrame(draw);
  }, [reductionDb, maxDb, width, height, color, direction]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [draw]);

  const cw = direction === 'horizontal' ? width : height;
  const ch = direction === 'horizontal' ? height : width;

  return (
    <div className="flex flex-col items-center gap-0.5">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Gain reduction meter"
        style={{ width: cw, height: ch }}
        data-testid="gr-meter"
      />
      <span className="text-[8px] text-white/30 font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
        GR {displayRef.current > 0.1 ? `-${reductionDb.toFixed(1)}dB` : '0.0dB'}
      </span>
    </div>
  );
}
