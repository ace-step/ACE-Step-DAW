/**
 * DistortionCard — Distortion effect card.
 * Extracted from EffectCards.tsx.
 */
import { Knob } from '../../ui/Knob';
import { HSlider } from '../../ui/HSlider';
import { EffectCardLayout } from '../EffectCardLayout';
import { DistortionCurve } from '../DistortionCurve';
import { AutomationControlShell } from './AutomationControlShell';
import { EFFECT_COLORS } from './effectColors';
import { useProjectStore } from '../../../store/projectStore';
import { effectsEngine } from '../../../engine/EffectsEngine';
import { normalizeEffectParamValue } from '../../../utils/effectAutomation';
import type { TrackEffect, DistortionParams } from '../../../types/project';

export function DistortionCard({ effect, trackId }: { effect: TrackEffect & { type: 'distortion' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<DistortionParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'distortion');
  };

  return (
    <EffectCardLayout
      color={EFFECT_COLORS.distortion}
      visualization={
        <DistortionCurve
          drive={p.amount}
          distortionType={p.distortionType}
          width={160}
          height={100}
          color={EFFECT_COLORS.distortion}
        />
      }
      mode={
        <>
          {(['soft', 'overdrive', 'fuzz'] as DistortionParams['distortionType'][]).map((dt) => (
            <button
              key={dt}
              className={`px-2 py-0.5 text-[10px] rounded capitalize ${
                p.distortionType === dt ? 'bg-white/[0.08] text-white/70 shadow-[0_0_3px_-1px_rgba(255,255,255,0.15)]' : 'text-white/30 hover:text-white/50 hover:bg-white/[0.06]'
              }`}
              onClick={() => update({ distortionType: dt })}
            >
              {dt}
            </button>
          ))}
        </>
      }
      footer={
        <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'distortion', param: 'wet' }} normalizedValue={normalizeEffectParamValue('distortion', 'wet', p.wet) ?? 0.5}>
          <HSlider value={p.wet} onChange={(v) => update({ wet: v })} label="Dry/Wet" displayValue={`${Math.round(p.wet * 100)}%`} color={EFFECT_COLORS.distortion} />
        </AutomationControlShell>
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'distortion', param: 'amount' }} normalizedValue={normalizeEffectParamValue('distortion', 'amount', p.amount) ?? 0.5}>
        <Knob value={p.amount} onChange={(v) => update({ amount: v })} min={0} max={1} defaultValue={0.2} label="Amount" size={56} step={0.01} color={EFFECT_COLORS.distortion} />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}
