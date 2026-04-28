/**
 * NoiseReductionCard — Noise reduction effect card.
 * Extracted from EffectCards.tsx.
 */
import { Knob } from '../../ui/Knob';
import { HSlider } from '../../ui/HSlider';
import { EffectCardLayout } from '../EffectCardLayout';
import { NoiseReductionDisplay } from '../NoiseReductionDisplay';
import { AutomationControlShell } from './AutomationControlShell';
import { EFFECT_COLORS } from './effectColors';
import { useProjectStore } from '../../../store/projectStore';
import { effectsEngine } from '../../../engine/EffectsEngine';
import { normalizeEffectParamValue } from '../../../utils/effectAutomation';
import type { TrackEffect, NoiseGateReductionParams } from '../../../types/project';

export function NoiseReductionCard({ effect, trackId }: { effect: TrackEffect & { type: 'noiseReduction' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;
  const update = (updates: Partial<NoiseGateReductionParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'noiseReduction');
  };

  return (
    <EffectCardLayout
      color={EFFECT_COLORS.noiseReduction}
      mode={
        <>
          {(['fast', 'smooth'] as NoiseGateReductionParams['mode'][]).map((m) => (
            <button key={m} className={`px-2 py-0.5 text-[10px] rounded capitalize ${p.mode === m ? 'bg-white/[0.08] text-white/70 shadow-[0_0_3px_-1px_rgba(255,255,255,0.15)]' : 'text-white/30 hover:text-white/50 hover:bg-white/[0.06]'}`}
              onClick={() => update({ mode: m })}>{m}</button>
          ))}
        </>
      }
      visualization={
        <NoiseReductionDisplay
          threshold={p.threshold}
          amount={p.amount}
          mode={p.mode === 'fast' ? 'aggressive' : p.mode === 'smooth' ? 'gentle' : 'standard'}
          hfEmphasis={p.hfEmphasis}
          width={220}
          height={100}
          color={EFFECT_COLORS.noiseReduction}
        />
      }
      footer={
        <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'noiseReduction', param: 'mix' }} normalizedValue={normalizeEffectParamValue('noiseReduction', 'mix', p.mix) ?? 1}>
          <HSlider value={p.mix} onChange={(v) => update({ mix: v })} label="Dry/Wet" displayValue={`${Math.round(p.mix * 100)}%`} color={EFFECT_COLORS.noiseReduction} />
        </AutomationControlShell>
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'noiseReduction', param: 'amount' }} normalizedValue={normalizeEffectParamValue('noiseReduction', 'amount', p.amount) ?? 0.5}>
        <Knob value={p.amount} onChange={(v) => update({ amount: v })} min={0} max={1} defaultValue={0.5} label="Amount" size={56} step={0.01} color={EFFECT_COLORS.noiseReduction} formatValue={(v) => `${Math.round(v * 100)}%`} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'noiseReduction', param: 'threshold' }} normalizedValue={normalizeEffectParamValue('noiseReduction', 'threshold', p.threshold) ?? 0.5}>
        <Knob value={p.threshold} onChange={(v) => update({ threshold: v })} min={-80} max={-20} defaultValue={-50} label="Threshold" unit=" dB" size={56} step={1} color={EFFECT_COLORS.noiseReduction} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'noiseReduction', param: 'hfEmphasis' }} normalizedValue={normalizeEffectParamValue('noiseReduction', 'hfEmphasis', p.hfEmphasis) ?? 0.5}>
        <Knob value={p.hfEmphasis} onChange={(v) => update({ hfEmphasis: v })} min={0} max={1} defaultValue={0.5} label="HF Focus" size={56} step={0.01} color={EFFECT_COLORS.noiseReduction} />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}
