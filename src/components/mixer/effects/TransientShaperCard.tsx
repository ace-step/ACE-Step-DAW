/**
 * TransientShaperCard — Transient shaper effect card.
 * Extracted from EffectCards.tsx.
 */
import { Knob } from '../../ui/Knob';
import { HSlider } from '../../ui/HSlider';
import { EffectCardLayout } from '../EffectCardLayout';
import { TransientShaperDisplay } from '../TransientShaperDisplay';
import { AutomationControlShell } from './AutomationControlShell';
import { EFFECT_COLORS } from './effectColors';
import { useProjectStore } from '../../../store/projectStore';
import { effectsEngine } from '../../../engine/EffectsEngine';
import { normalizeEffectParamValue } from '../../../utils/effectAutomation';
import type { TrackEffect, TransientShaperParams } from '../../../types/project';

export function TransientShaperCard({ effect, trackId }: { effect: TrackEffect & { type: 'transientShaper' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<TransientShaperParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'transientShaper');
  };

  return (
    <EffectCardLayout
      color={EFFECT_COLORS.transientShaper}
      visualization={
        <TransientShaperDisplay
          attack={p.attack}
          sustain={p.sustain}
          width={220}
          height={100}
          color={EFFECT_COLORS.transientShaper}
        />
      }
      footer={
        <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'transientShaper', param: 'mix' }} normalizedValue={normalizeEffectParamValue('transientShaper', 'mix', p.mix) ?? 1}>
          <HSlider value={p.mix} onChange={(v) => update({ mix: v })} label="Dry/Wet" displayValue={`${Math.round(p.mix * 100)}%`} color={EFFECT_COLORS.transientShaper} />
        </AutomationControlShell>
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'transientShaper', param: 'attack' }} normalizedValue={normalizeEffectParamValue('transientShaper', 'attack', p.attack) ?? 0.5}>
        <Knob value={p.attack} onChange={(v) => update({ attack: v })} min={-100} max={100} defaultValue={0} label="Attack" unit="%" size={56} step={1} color={EFFECT_COLORS.transientShaper} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'transientShaper', param: 'sustain' }} normalizedValue={normalizeEffectParamValue('transientShaper', 'sustain', p.sustain) ?? 0.5}>
        <Knob value={p.sustain} onChange={(v) => update({ sustain: v })} min={-100} max={100} defaultValue={0} label="Sustain" unit="%" size={56} step={1} color={EFFECT_COLORS.transientShaper} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'transientShaper', param: 'output' }} normalizedValue={normalizeEffectParamValue('transientShaper', 'output', p.output) ?? 0.5}>
        <Knob value={p.output} onChange={(v) => update({ output: v })} min={-12} max={12} defaultValue={0} label="Output" unit=" dB" size={56} step={0.5} color={EFFECT_COLORS.transientShaper} />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}
