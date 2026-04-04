/**
 * DelayCard — Delay effect card.
 * Extracted from EffectCards.tsx.
 */
import { Knob } from '../../ui/Knob';
import { HSlider } from '../../ui/HSlider';
import { EffectCardLayout } from '../EffectCardLayout';
import { DelayTapTimeline } from '../DelayTapTimeline';
import { AutomationControlShell } from './AutomationControlShell';
import { EFFECT_COLORS } from './effectColors';
import { useProjectStore } from '../../../store/projectStore';
import { effectsEngine } from '../../../engine/EffectsEngine';
import { normalizeEffectParamValue } from '../../../utils/effectAutomation';
import type { TrackEffect, DelayParams } from '../../../types/project';

export function DelayCard({ effect, trackId }: { effect: TrackEffect & { type: 'delay' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<DelayParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'delay');
  };

  return (
    <EffectCardLayout
      color={EFFECT_COLORS.delay}
      visualization={
        <DelayTapTimeline
          time={p.time}
          feedback={p.feedback}
          width={160}
          height={100}
          color={EFFECT_COLORS.delay}
        />
      }
      footer={
        <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'delay', param: 'wet' }} normalizedValue={normalizeEffectParamValue('delay', 'wet', p.wet) ?? 0.5}>
          <HSlider value={p.wet} onChange={(v) => update({ wet: v })} label="Dry/Wet" displayValue={`${Math.round(p.wet * 100)}%`} color={EFFECT_COLORS.delay} />
        </AutomationControlShell>
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'delay', param: 'time' }} normalizedValue={normalizeEffectParamValue('delay', 'time', p.time) ?? 0.5}>
        <Knob value={p.time} onChange={(v) => update({ time: v })} min={0.01} max={1} defaultValue={0.25} label="Time" unit="s" size={56} step={0.01} color={EFFECT_COLORS.delay} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'delay', param: 'feedback' }} normalizedValue={normalizeEffectParamValue('delay', 'feedback', p.feedback) ?? 0.5}>
        <Knob value={p.feedback} onChange={(v) => update({ feedback: v })} min={0} max={0.95} defaultValue={0.3} label="Feedback" size={56} step={0.01} color={EFFECT_COLORS.delay} />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}
