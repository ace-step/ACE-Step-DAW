/**
 * PhaserCard — Phaser effect card.
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
import type { TrackEffect, PhaserParams } from '../../../types/project';

export function PhaserCard({ effect, trackId }: { effect: TrackEffect & { type: 'phaser' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<PhaserParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'phaser');
  };

  return (
    <EffectCardLayout
      color={EFFECT_COLORS.phaser}
      visualization={
        <ModulationDisplay type="phaser" rate={p.frequency} depth={p.octaves / 6} baseFreq={p.baseFrequency} stages={p.stages ?? 4} color={EFFECT_COLORS.phaser} />
      }
      footer={
        <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'phaser', param: 'wet' }} normalizedValue={normalizeEffectParamValue('phaser', 'wet', p.wet) ?? 0.5}>
          <HSlider value={p.wet} onChange={(v) => update({ wet: v })} label="Dry/Wet" displayValue={`${Math.round(p.wet * 100)}%`} color={EFFECT_COLORS.phaser} />
        </AutomationControlShell>
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'phaser', param: 'frequency' }} normalizedValue={normalizeEffectParamValue('phaser', 'frequency', p.frequency) ?? 0.5}>
        <Knob value={p.frequency} onChange={(v) => update({ frequency: v })} min={0.1} max={8} defaultValue={0.5} label="Rate" unit="Hz" size={56} step={0.1} color={EFFECT_COLORS.phaser} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'phaser', param: 'octaves' }} normalizedValue={normalizeEffectParamValue('phaser', 'octaves', p.octaves) ?? 0.5}>
        <Knob value={p.octaves} onChange={(v) => update({ octaves: v })} min={1} max={6} defaultValue={3} label="Octaves" size={56} step={0.5} color={EFFECT_COLORS.phaser} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'phaser', param: 'Q' }} normalizedValue={normalizeEffectParamValue('phaser', 'Q', p.Q) ?? 0.5}>
        <Knob value={p.Q} onChange={(v) => update({ Q: v })} min={0.1} max={20} defaultValue={10} label="Q" size={56} step={0.1} color={EFFECT_COLORS.phaser} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'phaser', param: 'baseFrequency' }} normalizedValue={normalizeEffectParamValue('phaser', 'baseFrequency', p.baseFrequency) ?? 0.5}>
        <Knob value={p.baseFrequency} onChange={(v) => update({ baseFrequency: v })} min={100} max={4000} defaultValue={350} label="Base" unit="Hz" size={56} step={10} color={EFFECT_COLORS.phaser} />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}
