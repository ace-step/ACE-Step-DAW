/**
 * FlangerCard — Flanger effect card.
 * Extracted from EffectCards.tsx.
 */
import { Knob } from '../../ui/Knob';
import { HSlider } from '../../ui/HSlider';
import { EffectCardLayout } from '../EffectCardLayout';
import { ModulationDisplay } from '../ModulationDisplay';
import { AutomationControlShell } from './AutomationControlShell';
import { EFFECT_COLORS } from './effectColors';
import { useProjectStore } from '../../../store/projectStore';
import { effectsEngine } from '../../../engine/EffectsEngine';
import { normalizeEffectParamValue } from '../../../utils/effectAutomation';
import type { TrackEffect, FlangerParams } from '../../../types/project';

export function FlangerCard({ effect, trackId }: { effect: TrackEffect & { type: 'flanger' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<FlangerParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'flanger');
  };

  return (
    <EffectCardLayout
      color={EFFECT_COLORS.flanger}
      visualization={
        <ModulationDisplay type="flanger" rate={p.frequency} depth={p.depth} centerDelay={p.delayTime} feedback={p.feedback} color={EFFECT_COLORS.flanger} />
      }
      footer={
        <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'flanger', param: 'wet' }} normalizedValue={normalizeEffectParamValue('flanger', 'wet', p.wet) ?? 0.5}>
          <HSlider value={p.wet} onChange={(v) => update({ wet: v })} label="Dry/Wet" displayValue={`${Math.round(p.wet * 100)}%`} color={EFFECT_COLORS.flanger} />
        </AutomationControlShell>
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'flanger', param: 'frequency' }} normalizedValue={normalizeEffectParamValue('flanger', 'frequency', p.frequency) ?? 0.5}>
        <Knob value={p.frequency} onChange={(v) => update({ frequency: v })} min={0.05} max={5} defaultValue={0.5} label="Rate" unit="Hz" size={56} step={0.01} color={EFFECT_COLORS.flanger} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'flanger', param: 'depth' }} normalizedValue={normalizeEffectParamValue('flanger', 'depth', p.depth) ?? 0.5}>
        <Knob value={p.depth} onChange={(v) => update({ depth: v })} min={0} max={1} defaultValue={0.7} label="Depth" size={56} step={0.01} color={EFFECT_COLORS.flanger} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'flanger', param: 'delayTime' }} normalizedValue={normalizeEffectParamValue('flanger', 'delayTime', p.delayTime) ?? 0.5}>
        <Knob value={p.delayTime} onChange={(v) => update({ delayTime: v })} min={0.5} max={10} defaultValue={3} label="Delay" unit="ms" size={56} step={0.1} color={EFFECT_COLORS.flanger} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'flanger', param: 'feedback' }} normalizedValue={normalizeEffectParamValue('flanger', 'feedback', p.feedback) ?? 0.5}>
        <Knob value={p.feedback} onChange={(v) => update({ feedback: v })} min={-0.95} max={0.95} defaultValue={0.5} label="Feedback" size={56} step={0.01} color={EFFECT_COLORS.flanger} />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}
