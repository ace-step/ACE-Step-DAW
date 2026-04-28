/**
 * SaturationCard — Saturation effect card.
 * Extracted from EffectCards.tsx.
 */
import { Knob } from '../../ui/Knob';
import { HSlider } from '../../ui/HSlider';
import { EffectCardLayout } from '../EffectCardLayout';
import { SaturationCurve } from '../SaturationCurve';
import { AutomationControlShell } from './AutomationControlShell';
import { EFFECT_COLORS } from './effectColors';
import { useProjectStore } from '../../../store/projectStore';
import { effectsEngine } from '../../../engine/EffectsEngine';
import { normalizeEffectParamValue } from '../../../utils/effectAutomation';
import type { TrackEffect, SaturationParams, SaturationType } from '../../../types/project';

const SATURATION_TYPE_LABELS: Record<SaturationType, string> = {
  tape: 'Tape',
  tube: 'Tube',
  transistor: 'Transistor',
  soft: 'Soft',
  hard: 'Hard',
};

export function SaturationCard({ effect, trackId }: { effect: TrackEffect & { type: 'saturation' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<SaturationParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'saturation');
  };

  return (
    <EffectCardLayout
      color={EFFECT_COLORS.saturation}
      mode={
        <>
          {(Object.keys(SATURATION_TYPE_LABELS) as SaturationType[]).map((st) => (
            <button
              key={st}
              className={`px-1.5 py-0.5 text-[10px] rounded capitalize ${
                p.saturationType === st ? 'bg-white/[0.08] text-white/70 shadow-[0_0_3px_-1px_rgba(255,255,255,0.15)]' : 'text-white/30 hover:text-white/50 hover:bg-white/[0.06]'
              }`}
              onClick={() => update({ saturationType: st })}
            >
              {SATURATION_TYPE_LABELS[st]}
            </button>
          ))}
        </>
      }
      visualization={
        <SaturationCurve
          drive={p.drive}
          saturationType={p.saturationType}
          width={220}
          height={120}
          color={EFFECT_COLORS.saturation}
        />
      }
      footer={
        <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'saturation', param: 'mix' }} normalizedValue={normalizeEffectParamValue('saturation', 'mix', p.mix) ?? 0.5}>
          <HSlider value={p.mix} onChange={(v) => update({ mix: v })} label="Dry/Wet" displayValue={`${Math.round(p.mix * 100)}%`} color={EFFECT_COLORS.saturation} />
        </AutomationControlShell>
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'saturation', param: 'drive' }} normalizedValue={normalizeEffectParamValue('saturation', 'drive', p.drive) ?? 0.5}>
        <Knob value={p.drive} onChange={(v) => update({ drive: v })} min={0} max={1} defaultValue={0.3} label="Drive" size={56} step={0.01} color={EFFECT_COLORS.saturation} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'saturation', param: 'harmonicMix' }} normalizedValue={normalizeEffectParamValue('saturation', 'harmonicMix', p.harmonicMix) ?? 0.5}>
        <Knob value={p.harmonicMix} onChange={(v) => update({ harmonicMix: v })} min={-1} max={1} defaultValue={0} label="Harmonics" size={56} step={0.01} color={EFFECT_COLORS.saturation} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'saturation', param: 'inputGain' }} normalizedValue={normalizeEffectParamValue('saturation', 'inputGain', p.inputGain) ?? 0.5}>
        <Knob value={p.inputGain} onChange={(v) => update({ inputGain: v })} min={-12} max={12} defaultValue={0} label="Input" unit=" dB" size={56} step={0.5} color={EFFECT_COLORS.saturation} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'saturation', param: 'outputGain' }} normalizedValue={normalizeEffectParamValue('saturation', 'outputGain', p.outputGain) ?? 0.5}>
        <Knob value={p.outputGain} onChange={(v) => update({ outputGain: v })} min={-12} max={12} defaultValue={0} label="Output" unit=" dB" size={56} step={0.5} color={EFFECT_COLORS.saturation} />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}
