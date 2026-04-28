/**
 * StereoImagerCard — Stereo imager effect card.
 * Extracted from EffectCards.tsx.
 */
import { Knob } from '../../ui/Knob';
import { EffectCardLayout } from '../EffectCardLayout';
import { StereoFieldDisplay } from '../StereoFieldDisplay';
import { AutomationControlShell } from './AutomationControlShell';
import { EFFECT_COLORS } from './effectColors';
import { useProjectStore } from '../../../store/projectStore';
import { effectsEngine } from '../../../engine/EffectsEngine';
import { normalizeEffectParamValue } from '../../../utils/effectAutomation';
import type { TrackEffect, StereoImagerParams } from '../../../types/project';

export function StereoImagerCard({ effect, trackId }: { effect: TrackEffect & { type: 'stereoImager' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<StereoImagerParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'stereoImager');
  };

  return (
    <EffectCardLayout
      color={EFFECT_COLORS.stereoImager}
      visualization={
        <StereoFieldDisplay
          widthAmount={p.width}
          midGain={p.midGain}
          sideGain={p.sideGain}
          monoFreq={p.monoFreq}
          pan={p.pan ?? 0}
          canvasWidth={220}
          canvasHeight={120}
          color={EFFECT_COLORS.stereoImager}
        />
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'stereoImager', param: 'width' }} normalizedValue={normalizeEffectParamValue('stereoImager', 'width', p.width) ?? 0.5}>
        <Knob value={p.width} onChange={(v) => update({ width: v })} min={0} max={2} defaultValue={1} label="Width" size={56} step={0.01} color={EFFECT_COLORS.stereoImager}
          formatValue={(v) => v === 0 ? 'Mono' : v === 1 ? '100%' : `${Math.round(v * 100)}%`}
        />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'stereoImager', param: 'midGain' }} normalizedValue={normalizeEffectParamValue('stereoImager', 'midGain', p.midGain) ?? 0.5}>
        <Knob value={p.midGain} onChange={(v) => update({ midGain: v })} min={-12} max={12} defaultValue={0} label="Mid" unit=" dB" size={56} step={0.5} color={EFFECT_COLORS.stereoImager} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'stereoImager', param: 'sideGain' }} normalizedValue={normalizeEffectParamValue('stereoImager', 'sideGain', p.sideGain) ?? 0.5}>
        <Knob value={p.sideGain} onChange={(v) => update({ sideGain: v })} min={-12} max={12} defaultValue={0} label="Side" unit=" dB" size={56} step={0.5} color={EFFECT_COLORS.stereoImager} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'stereoImager', param: 'monoFreq' }} normalizedValue={normalizeEffectParamValue('stereoImager', 'monoFreq', p.monoFreq) ?? 0}>
        <Knob value={p.monoFreq} onChange={(v) => update({ monoFreq: v })} min={0} max={500} defaultValue={0} label="Mono Bass" unit=" Hz" size={56} step={5} color={EFFECT_COLORS.stereoImager}
          formatValue={(v) => v === 0 ? 'Off' : `${Math.round(v)} Hz`}
        />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}
