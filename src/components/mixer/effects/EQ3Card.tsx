import { useEffect, useRef } from 'react';
import { Knob } from '../../ui/Knob';
import { HSlider } from '../../ui/HSlider';
import { EffectCardLayout } from '../EffectCardLayout';
import { AutomationControlShell } from './AutomationControlShell';
import { EFFECT_COLORS } from './effectColors';
import { fillBackground, GRID_COLOR, LABEL_COLOR } from '../../../utils/canvasTheme';
import { useProjectStore } from '../../../store/projectStore';
import { effectsEngine } from '../../../engine/EffectsEngine';
import { normalizeEffectParamValue } from '../../../utils/effectAutomation';
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

const EQ3_WIDTH = 220;
const EQ3_HEIGHT = 80;
const FREQ_LABELS = [100, 300, 1000, 3000, 10000];
const DB_LABELS = [-12, -6, 0, 6, 12];

function freqToX(freq: number): number {
  const minLog = Math.log10(20);
  const maxLog = Math.log10(20000);
  return ((Math.log10(freq) - minLog) / (maxLog - minLog)) * EQ3_WIDTH;
}

export function EQCurve({ low, mid, high }: { low: number; mid: number; high: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const color = EFFECT_COLORS.eq3;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = EQ3_WIDTH;
    const h = EQ3_HEIGHT;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    fillBackground(ctx, w, h);

    // Frequency grid (vertical, log scale)
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 0.5;
    ctx.font = '7px monospace';
    ctx.fillStyle = LABEL_COLOR;

    for (const freq of FREQ_LABELS) {
      const x = freqToX(freq);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillText(freq >= 1000 ? `${freq / 1000}k` : `${freq}`, x, h - 2);
    }

    // dB grid (horizontal)
    const centerY = h / 2;
    const dbRange = 24; // ±12 dB
    const dbToY = (db: number) => centerY - (db / dbRange) * h;

    for (const db of DB_LABELS) {
      const y = dbToY(db);
      ctx.strokeStyle = db === 0 ? 'rgba(255, 255, 255, 0.12)' : GRID_COLOR;
      ctx.lineWidth = db === 0 ? 0.75 : 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      if (db !== 0) {
        ctx.fillStyle = LABEL_COLOR;
        ctx.textAlign = 'left';
        ctx.fillText(`${db > 0 ? '+' : ''}${db}`, 2, y - 2);
      }
    }

    // EQ response curve
    ctx.beginPath();
    for (let x = 0; x <= w; x++) {
      const t = x / w;
      let gain = 0;
      // Smooth band transitions using cosine interpolation
      if (t < 0.33) {
        const blend = (1 - Math.cos(t * 3 * Math.PI)) / 2;
        gain = low * (1 - blend) + mid * blend;
      } else if (t < 0.66) {
        gain = mid;
      } else {
        const blend = (1 - Math.cos((t - 0.66) / 0.34 * Math.PI)) / 2;
        gain = mid * (1 - blend) + high * blend;
      }
      const y = dbToY(gain);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Fill area between curve and 0dB line
    ctx.lineTo(w, centerY);
    ctx.lineTo(0, centerY);
    ctx.closePath();
    ctx.fillStyle = `${color}15`;
    ctx.fill();
  }, [low, mid, high, color]);

  return (
    <canvas
      ref={canvasRef}
      className="rounded"
      style={{ width: EQ3_WIDTH, height: EQ3_HEIGHT }}
      data-testid="eq3-curve"
    />
  );
}
