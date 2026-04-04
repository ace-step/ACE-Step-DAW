/**
 * EQ3Card — Three-band EQ effect card.
 * Extracted from EffectCards.tsx.
 */
import { useEffect, useRef } from 'react';
import { Knob } from '../../ui/Knob';
import { HSlider } from '../../ui/HSlider';
import { EffectCardLayout } from '../EffectCardLayout';
import { AutomationControlShell } from './AutomationControlShell';
import { EFFECT_COLORS } from './effectColors';
import { useProjectStore } from '../../../store/projectStore';
import { effectsEngine } from '../../../engine/EffectsEngine';
import { normalizeEffectParamValue } from '../../../utils/effectAutomation';
import { fillBackground, GRID_COLOR, LABEL_COLOR } from '../../../utils/canvasTheme';
import type { TrackEffect, EQ3Params } from '../../../types/project';

export function EQ3Card({ effect, trackId }: { effect: TrackEffect & { type: 'eq3' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<EQ3Params>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'eq3');
  };

  return (
    <EffectCardLayout
      color={EFFECT_COLORS.eq3}
      visualization={<EQCurve low={p.low} mid={p.mid} high={p.high} />}
      footer={
        <div className="flex gap-2">
          <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'eq3', param: 'lowFrequency' }} normalizedValue={normalizeEffectParamValue('eq3', 'lowFrequency', p.lowFrequency) ?? 0.5}>
            <HSlider value={p.lowFrequency} onChange={(v) => update({ lowFrequency: v })} min={100} max={1000} label="Low Freq" displayValue={`${Math.round(p.lowFrequency)} Hz`} color={EFFECT_COLORS.eq3} width={70} />
          </AutomationControlShell>
          <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'eq3', param: 'highFrequency' }} normalizedValue={normalizeEffectParamValue('eq3', 'highFrequency', p.highFrequency) ?? 0.5}>
            <HSlider value={p.highFrequency} onChange={(v) => update({ highFrequency: v })} min={1000} max={8000} label="High Freq" displayValue={`${Math.round(p.highFrequency)} Hz`} color={EFFECT_COLORS.eq3} width={70} />
          </AutomationControlShell>
        </div>
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'eq3', param: 'low' }} normalizedValue={normalizeEffectParamValue('eq3', 'low', p.low) ?? 0.5}>
        <Knob value={p.low} onChange={(v) => update({ low: v })} min={-12} max={12} defaultValue={0} label="Low" unit="dB" size={56} step={0.5} color={EFFECT_COLORS.eq3} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'eq3', param: 'mid' }} normalizedValue={normalizeEffectParamValue('eq3', 'mid', p.mid) ?? 0.5}>
        <Knob value={p.mid} onChange={(v) => update({ mid: v })} min={-12} max={12} defaultValue={0} label="Mid" unit="dB" size={56} step={0.5} color={EFFECT_COLORS.eq3} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'eq3', param: 'high' }} normalizedValue={normalizeEffectParamValue('eq3', 'high', p.high) ?? 0.5}>
        <Knob value={p.high} onChange={(v) => update({ high: v })} min={-12} max={12} defaultValue={0} label="High" unit="dB" size={56} step={0.5} color={EFFECT_COLORS.eq3} />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}

export function EQCurve({ low, mid, high, color = EFFECT_COLORS.eq3 }: { low: number; mid: number; high: number; color?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = 200; const h = 80;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    }
    fillBackground(ctx, w, h);

    const centerY = h / 2;

    // ±6dB grid lines
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    const dbScale = h / 30; // ±15dB range
    for (const db of [-6, 0, 6]) {
      const y = centerY - db * dbScale;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Frequency grid: 100Hz, 1kHz, 10kHz (log scale mapped to linear x)
    const freqToX = (freq: number) => {
      const logMin = Math.log10(20);
      const logMax = Math.log10(20000);
      return ((Math.log10(freq) - logMin) / (logMax - logMin)) * w;
    };
    ctx.fillStyle = LABEL_COLOR;
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'center';
    for (const [freq, label] of [[100, '100'], [1000, '1k'], [10000, '10k']] as const) {
      const x = freqToX(freq);
      ctx.beginPath();
      ctx.strokeStyle = GRID_COLOR;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h - 10);
      ctx.stroke();
      ctx.fillText(label, x, h - 2);
    }

    // EQ response curve
    ctx.beginPath();
    ctx.strokeStyle = color + 'cc';
    ctx.lineWidth = 2;

    for (let x = 0; x <= w; x++) {
      const t = x / w;
      let gain = 0;
      if (t < 0.33) { gain = low * (1 - t * 3) + mid * (t * 3); }
      else if (t < 0.66) { gain = mid; }
      else { const lt = (t - 0.66) / 0.34; gain = mid * (1 - lt) + high * lt; }
      const y = centerY - gain * dbScale;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Gradient fill under curve
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, color + '30');
    grad.addColorStop(1, color + '05');
    ctx.lineTo(w, centerY);
    ctx.lineTo(0, centerY);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  }, [low, mid, high, color]);

  return <canvas ref={canvasRef} className="rounded" style={{ width: 200, height: 80 }} />;
}
