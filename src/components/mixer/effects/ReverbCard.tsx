/**
 * ReverbCard — Simple reverb effect card.
 * Extracted from EffectCards.tsx.
 */
import { Knob } from '../../ui/Knob';
import { HSlider } from '../../ui/HSlider';
import { EffectCardLayout } from '../EffectCardLayout';
import { ReverbDecayCurve } from '../ReverbDecayCurve';
import { AutomationControlShell } from './AutomationControlShell';
import { EFFECT_COLORS } from './effectColors';
import { useProjectStore } from '../../../store/projectStore';
import { effectsEngine } from '../../../engine/EffectsEngine';
import { normalizeEffectParamValue } from '../../../utils/effectAutomation';
import type { TrackEffect, ReverbParams } from '../../../types/project';

export function ReverbCard({ effect, trackId }: { effect: TrackEffect & { type: 'reverb' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<ReverbParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'reverb');
  };

  return (
    <EffectCardLayout
      color={EFFECT_COLORS.reverb}
      visualization={
        <ReverbDecayCurve
          decay={p.decay}
          preDelay={p.preDelay}
          damping={0.4}
          erLevel={0.5}
          width={160}
          height={100}
          color={EFFECT_COLORS.reverb}
        />
      }
      footer={
        <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'reverb', param: 'wet' }} normalizedValue={normalizeEffectParamValue('reverb', 'wet', p.wet) ?? 0.5}>
          <HSlider value={p.wet} onChange={(v) => update({ wet: v })} label="Dry/Wet" displayValue={`${Math.round(p.wet * 100)}%`} color={EFFECT_COLORS.reverb} />
        </AutomationControlShell>
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'reverb', param: 'decay' }} normalizedValue={normalizeEffectParamValue('reverb', 'decay', p.decay) ?? 0.5}>
        <Knob value={p.decay} onChange={(v) => update({ decay: v })} min={0.1} max={10} defaultValue={2.4} label="Decay" size={56} step={0.1} color={EFFECT_COLORS.reverb} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'reverb', param: 'preDelay' }} normalizedValue={normalizeEffectParamValue('reverb', 'preDelay', p.preDelay) ?? 0.5}>
        <Knob value={p.preDelay} onChange={(v) => update({ preDelay: v })} min={0} max={0.1} defaultValue={0.02} label="Pre-Dly" size={56} step={0.001} color={EFFECT_COLORS.reverb} />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}
