/**
 * DelayTapTimeline — Tap echo timeline visualization for the Delay effect.
 * Shows repeating echoes as vertical bars decaying by the feedback amount.
 * Inspired by FabFilter Timeless and Soundtoys EchoBoy.
 */
import { useRef, useEffect } from 'react';
import { generateDelayTaps } from '../../utils/delayTaps';
import { fillBackground, GRID_COLOR, LABEL_AREA_BG } from '../../utils/canvasTheme';

interface DelayTapTimelineProps {
  time: number;       // Delay time in seconds
  feedback: number;   // Feedback amount 0–0.95
  width?: number;
  height?: number;
  color?: string;
}

export function DelayTapTimeline({
  time,
  feedback,
  width = 160,
  height = 100,
  color = '#38bdf8',
}: DelayTapTimelineProps) {
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
    const PAD = 4;
    const displayEnd = Math.max(time * 6, 0.5); // show at least 6 taps worth of space

    const xForT = (t: number) => PAD + (t / displayEnd) * (width - PAD * 2);
    const yForLevel = (l: number) => drawH - l * (drawH - 4) - 2;

    // ── Background ──────────────────────────────────────────────────────────
    ctx.clearRect(0, 0, width, height);
    fillBackground(ctx, width, height);

    // Label area separator
    ctx.fillStyle = LABEL_AREA_BG;
    ctx.fillRect(0, drawH, width, labelH);

    // ── Ruler: horizontal baseline ──────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(PAD, drawH - 1);
    ctx.lineTo(width - PAD, drawH - 1);
    ctx.stroke();

    // Horizontal amplitude guides (very faint)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.lineWidth = 0.5;
    for (const lvl of [0.5, 0.25]) {
      const y = yForLevel(lvl);
      ctx.beginPath();
      ctx.moveTo(PAD, y);
      ctx.lineTo(width - PAD, y);
      ctx.stroke();
    }

    // ── Dry signal marker at t=0 ─────────────────────────────────────────────
    {
      const x0 = PAD;
      const topY0 = yForLevel(1);
      ctx.strokeStyle = `${color}40`;
      ctx.lineWidth = 1;
      ctx.setLineDash([1, 2]);
      ctx.beginPath();
      ctx.moveTo(x0, drawH);
      ctx.lineTo(x0, topY0);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = `${color}50`;
      ctx.fillRect(x0 - 0.5, topY0, 1.5, 2);
    }

    // ── Decay envelope reference curve ───────────────────────────────────────
    if (feedback > 0.05) {
      ctx.beginPath();
      const steps = 80;
      for (let i = 0; i <= steps; i++) {
        const t = (displayEnd * i) / steps;
        const level = Math.pow(feedback, t / time);
        const x = xForT(t);
        const y = yForLevel(level);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `${color}28`;
      ctx.lineWidth = 0.75;
      ctx.setLineDash([2, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── Tap bars ─────────────────────────────────────────────────────────────
    const taps = generateDelayTaps(time, feedback, displayEnd);
    const isHighFeedback = feedback > 0.9;
    // Adaptive bar width: wide for few taps, narrow for many
    const barW = Math.max(4, Math.min(18, (width - PAD * 2) / Math.max(taps.length + 1, 3)));

    for (const tap of taps) {
      const x = xForT(tap.time);
      const topY = yForLevel(tap.level);
      const tapColor = isHighFeedback ? '#f97316' : color;
      const bx = x - barW / 2;

      // Outer glow (only for first 2 taps)
      if (tap.repeat < 2) {
        ctx.save();
        ctx.shadowBlur = tap.repeat === 0 ? 10 : 5;
        ctx.shadowColor = `${tapColor}80`;
        ctx.fillStyle = `${tapColor}${Math.round(tap.level * 60).toString(16).padStart(2, '0')}`;
        ctx.beginPath();
        ctx.roundRect(bx - 2, topY, barW + 4, drawH - topY, [3, 3, 0, 0]);
        ctx.fill();
        ctx.restore();
      }

      // Filled bar with vertical gradient
      const alpha = Math.round(tap.level * 255);
      const alphaHex = alpha.toString(16).padStart(2, '0');
      const midAlphaHex = Math.round(tap.level * 130).toString(16).padStart(2, '0');

      const barGrad = ctx.createLinearGradient(x, drawH, x, topY);
      barGrad.addColorStop(0, `${tapColor}00`);
      barGrad.addColorStop(0.3, `${tapColor}${midAlphaHex}`);
      barGrad.addColorStop(1, `${tapColor}${alphaHex}`);

      ctx.fillStyle = barGrad;
      ctx.beginPath();
      ctx.roundRect(bx, topY, barW, drawH - topY, [2, 2, 0, 0]);
      ctx.fill();

      // Bright top cap line
      ctx.fillStyle = `${tapColor}${alphaHex}`;
      ctx.fillRect(bx, topY, barW, 1.5);

      // Highlight stripe on first tap
      if (tap.repeat === 0) {
        ctx.save();
        ctx.shadowBlur = 8;
        ctx.shadowColor = tapColor;
        ctx.fillStyle = tapColor;
        ctx.fillRect(bx, topY, barW, 2);
        ctx.restore();
        // White specular highlight
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(bx + 1, topY + 1, Math.max(1, barW * 0.4), 1);
      }
    }

    // ── Time axis labels (first + second tap) ───────────────────────────────
    ctx.font = '7px monospace';
    const formatT = (t: number) => t >= 1 ? `${t.toFixed(2)}s` : `${Math.round(t * 1000)}ms`;

    if (taps.length > 0) {
      // First tap: colored, prominent
      const x1 = xForT(taps[0].time);
      ctx.fillStyle = `${color}dd`;
      ctx.textAlign = 'center';
      ctx.fillText(formatT(taps[0].time), Math.min(Math.max(x1, 20), width - 22), height - 2);

      // Second tap: muted
      if (taps.length > 1) {
        const x2 = xForT(taps[1].time);
        if (Math.abs(x2 - x1) > 24) { // don't overlap
          ctx.fillStyle = 'rgba(255,255,255,0.22)';
          ctx.fillText(formatT(taps[1].time), Math.min(x2, width - 20), height - 2);
        }
      }
    }

    // ── High-feedback warning ────────────────────────────────────────────────
    if (isHighFeedback) {
      ctx.font = '7px monospace';
      ctx.fillStyle = '#f97316cc';
      ctx.textAlign = 'right';
      ctx.fillText('∞ REPEAT', width - 4, 10);
      // Warning badge
      const badgeW = 52;
      ctx.fillStyle = 'rgba(249, 115, 22, 0.12)';
      ctx.beginPath();
      ctx.roundRect(width - badgeW - 2, 0, badgeW, 13, 2);
      ctx.fill();
    } else {
      // Feedback % label
      ctx.font = '7px monospace';
      ctx.fillStyle = `${color}66`;
      ctx.textAlign = 'right';
      ctx.fillText(`fb ${Math.round(feedback * 100)}%`, width - 4, 10);
    }

    // ── Tap count label ──────────────────────────────────────────────────────
    ctx.font = '7px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.textAlign = 'left';
    ctx.fillText(`${taps.length} echo${taps.length !== 1 ? 's' : ''}`, PAD + 1, 10);
  }, [time, feedback, width, height, color]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Delay tap timeline"
      style={{ width, height }}
      className="rounded"
      data-testid="delay-tap-timeline"
    />
  );
}
