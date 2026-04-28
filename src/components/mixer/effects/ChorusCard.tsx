/**
 * ChorusCard — Chorus effect card.
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
import type { TrackEffect, ChorusParams } from '../../../types/project';

export function ChorusCard({ effect, trackId }: { effect: TrackEffect & { type: 'chorus' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<ChorusParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'chorus');
  };

  return (
    <EffectCardLayout
      color={EFFECT_COLORS.chorus}
      visualization={
        <ModulationDisplay type="chorus" rate={p.frequency} depth={p.depth} color={EFFECT_COLORS.chorus} />
      }
      footer={
        <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'chorus', param: 'wet' }} normalizedValue={normalizeEffectParamValue('chorus', 'wet', p.wet) ?? 0.5}>
          <HSlider value={p.wet} onChange={(v) => update({ wet: v })} label="Dry/Wet" displayValue={`${Math.round(p.wet * 100)}%`} color={EFFECT_COLORS.chorus} />
        </AutomationControlShell>
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'chorus', param: 'frequency' }} normalizedValue={normalizeEffectParamValue('chorus', 'frequency', p.frequency) ?? 0.5}>
        <Knob value={p.frequency} onChange={(v) => update({ frequency: v })} min={0.1} max={10} defaultValue={1.5} label="Rate" unit="Hz" size={56} step={0.1} color={EFFECT_COLORS.chorus} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'chorus', param: 'depth' }} normalizedValue={normalizeEffectParamValue('chorus', 'depth', p.depth) ?? 0.5}>
        <Knob value={p.depth} onChange={(v) => update({ depth: v })} min={0} max={1} defaultValue={0.7} label="Depth" size={56} step={0.01} color={EFFECT_COLORS.chorus} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'chorus', param: 'delayTime' }} normalizedValue={normalizeEffectParamValue('chorus', 'delayTime', p.delayTime) ?? 0.5}>
        <Knob value={p.delayTime} onChange={(v) => update({ delayTime: v })} min={0.5} max={20} defaultValue={3.5} label="Delay" unit="ms" size={56} step={0.1} color={EFFECT_COLORS.chorus} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'chorus', param: 'feedback' }} normalizedValue={normalizeEffectParamValue('chorus', 'feedback', p.feedback) ?? 0.5}>
        <Knob value={p.feedback} onChange={(v) => update({ feedback: v })} min={0} max={0.95} defaultValue={0} label="Feedback" size={56} step={0.01} color={EFFECT_COLORS.chorus} />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}
