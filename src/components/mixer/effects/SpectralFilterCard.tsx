/**
 * SpectralFilterCard — Spectral filter with drawable frequency response curve.
 * Users can draw a filter curve by adding/moving control points on a frequency display.
 */
import { useRef, useCallback, useState, useEffect } from 'react';
import { HSlider } from '../../ui/HSlider';
import { Knob } from '../../ui/Knob';
import { EffectCardLayout } from '../EffectCardLayout';
import { AutomationControlShell } from './AutomationControlShell';
import { EFFECT_COLORS } from './effectColors';
import { useProjectStore } from '../../../store/projectStore';
import { effectsEngine } from '../../../engine/EffectsEngine';
import { normalizeEffectParamValue } from '../../../utils/effectAutomation';
import type { TrackEffect, SpectralFilterParams, SpectralFilterPoint } from '../../../types/project';

const COLOR = EFFECT_COLORS.spectralFilter;
const CANVAS_W = 220;
const CANVAS_H = 100;
const MIN_FREQ = 20;
const MAX_FREQ = 20000;
const MIN_GAIN = -48;
const MAX_GAIN = 12;

function freqToX(freq: number): number {
  return (Math.log(freq / MIN_FREQ) / Math.log(MAX_FREQ / MIN_FREQ)) * CANVAS_W;
}

function xToFreq(x: number): number {
  return MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, x / CANVAS_W);
}

function gainToY(gain: number): number {
  return ((MAX_GAIN - gain) / (MAX_GAIN - MIN_GAIN)) * CANVAS_H;
}

function yToGain(y: number): number {
  return MAX_GAIN - (y / CANVAS_H) * (MAX_GAIN - MIN_GAIN);
}

export function SpectralFilterCard({ effect, trackId }: { effect: TrackEffect & { type: 'spectralFilter' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  const update = useCallback((updates: Partial<SpectralFilterParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'spectralFilter');
  }, [p, trackId, effect.id, updateTrackEffect]);

  // Draw the filter curve
  const drawCurve = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Background grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    // Frequency grid lines
    for (const freq of [100, 1000, 10000]) {
      const x = freqToX(freq);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_H);
      ctx.stroke();
    }
    // Gain grid lines
    for (const gain of [-36, -24, -12, 0]) {
      const y = gainToY(gain);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_W, y);
      ctx.stroke();
    }
    // 0dB line highlighted
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    const zeroY = gainToY(0);
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    ctx.lineTo(CANVAS_W, zeroY);
    ctx.stroke();

    // Draw filled curve
    const sorted = [...p.points].sort((a, b) => a.frequency - b.frequency);
    if (sorted.length > 0) {
      ctx.beginPath();
      ctx.moveTo(0, gainToY(sorted[0].gain));
      for (const pt of sorted) {
        ctx.lineTo(freqToX(pt.frequency), gainToY(pt.gain));
      }
      ctx.lineTo(CANVAS_W, gainToY(sorted[sorted.length - 1].gain));
      ctx.lineTo(CANVAS_W, CANVAS_H);
      ctx.lineTo(0, CANVAS_H);
      ctx.closePath();
      ctx.fillStyle = `${COLOR}18`;
      ctx.fill();

      // Stroke line
      ctx.beginPath();
      ctx.moveTo(0, gainToY(sorted[0].gain));
      for (const pt of sorted) {
        ctx.lineTo(freqToX(pt.frequency), gainToY(pt.gain));
      }
      ctx.lineTo(CANVAS_W, gainToY(sorted[sorted.length - 1].gain));
      ctx.strokeStyle = COLOR;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Draw control points
    for (let i = 0; i < p.points.length; i++) {
      const pt = p.points[i];
      const x = freqToX(pt.frequency);
      const y = gainToY(pt.gain);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = i === draggingIdx ? '#fff' : COLOR;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }, [p.points, draggingIdx]);

  // Redraw when points or drag state change
  useEffect(() => {
    const id = requestAnimationFrame(drawCurve);
    return () => cancelAnimationFrame(id);
  }, [drawCurve]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Check if clicking on existing point
    for (let i = 0; i < p.points.length; i++) {
      const pt = p.points[i];
      const px = freqToX(pt.frequency);
      const py = gainToY(pt.gain);
      if (Math.abs(mx - px) < 8 && Math.abs(my - py) < 8) {
        setDraggingIdx(i);
        return;
      }
    }

    // Add new point
    const freq = Math.max(MIN_FREQ, Math.min(MAX_FREQ, xToFreq(mx)));
    const gain = Math.max(MIN_GAIN, Math.min(MAX_GAIN, yToGain(my)));
    const newPoints = [...p.points, { frequency: Math.round(freq), gain: Math.round(gain * 10) / 10 }];
    update({ points: newPoints });
    setDraggingIdx(newPoints.length - 1);
  }, [p.points, update]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggingIdx === null) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const freq = Math.max(MIN_FREQ, Math.min(MAX_FREQ, xToFreq(mx)));
    const gain = Math.max(MIN_GAIN, Math.min(MAX_GAIN, yToGain(my)));
    const newPoints = [...p.points];
    newPoints[draggingIdx] = { frequency: Math.round(freq), gain: Math.round(gain * 10) / 10 };
    update({ points: newPoints });
  }, [draggingIdx, p.points, update]);

  const handleMouseUp = useCallback(() => {
    setDraggingIdx(null);
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Remove point on double-click (keep at least 2 points)
    if (p.points.length <= 2) return;
    for (let i = 0; i < p.points.length; i++) {
      const pt = p.points[i];
      const px = freqToX(pt.frequency);
      const py = gainToY(pt.gain);
      if (Math.abs(mx - px) < 8 && Math.abs(my - py) < 8) {
        const newPoints = p.points.filter((_, idx) => idx !== i);
        update({ points: newPoints });
        return;
      }
    }
  }, [p.points, update]);

  return (
    <EffectCardLayout
      color={COLOR}
      visualization={
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className="cursor-crosshair rounded"
            style={{ background: 'rgba(0,0,0,0.2)' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDoubleClick={handleDoubleClick}
          />
          <div className="absolute bottom-0.5 right-1 text-[8px] text-white/20">
            Click to add · Drag to move · Dbl-click to remove
          </div>
        </div>
      }
      footer={
        <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'spectralFilter', param: 'mix' }} normalizedValue={normalizeEffectParamValue('spectralFilter', 'mix', p.mix) ?? 1}>
          <HSlider value={p.mix} onChange={(v) => update({ mix: v })} label="Dry/Wet" displayValue={`${Math.round(p.mix * 100)}%`} color={COLOR} />
        </AutomationControlShell>
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'spectralFilter', param: 'resolution' }} normalizedValue={normalizeEffectParamValue('spectralFilter', 'resolution', p.resolution) ?? 0.5}>
        <Knob value={p.resolution} onChange={(v) => update({ resolution: v })} min={0} max={1} defaultValue={0.5} label="Smooth" size={56} step={0.01} color={COLOR} formatValue={(v) => `${Math.round(v * 100)}%`} />
      </AutomationControlShell>
      <div className="flex flex-col items-center gap-1">
        <span className="text-[9px] text-white/30">{p.points.length} pts</span>
        <button
          className="px-2 py-0.5 text-[9px] text-white/30 hover:text-white/50 hover:bg-white/[0.06] rounded"
          onClick={() => update({ points: [{ frequency: 20, gain: 0 }, { frequency: 20000, gain: 0 }] })}
        >
          Reset
        </button>
      </div>
    </EffectCardLayout>
  );
}
