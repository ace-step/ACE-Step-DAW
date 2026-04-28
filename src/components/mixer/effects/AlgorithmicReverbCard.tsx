/**
 * AlgorithmicReverbCard — Algorithmic reverb effect card.
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
import type { TrackEffect, AlgorithmicReverbParams, AlgorithmicReverbType } from '../../../types/project';

const REVERB_TYPE_LABELS: Record<AlgorithmicReverbType, string> = {
  plate: 'Plate', hall: 'Hall', room: 'Room', chamber: 'Chamber', spring: 'Spring',
};

export function AlgorithmicReverbCard({ effect, trackId }: { effect: TrackEffect & { type: 'algorithmicReverb' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;
  const update = (updates: Partial<AlgorithmicReverbParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'algorithmicReverb');
  };

  return (
    <EffectCardLayout
      color={EFFECT_COLORS.algorithmicReverb}
      visualization={
        <ReverbDecayCurve
          decay={p.decay}
          preDelay={p.preDelay / 1000}
          damping={p.damping}
          erLevel={p.erLevel}
          reverbType={p.reverbType}
          width={160}
          height={100}
          color={EFFECT_COLORS.algorithmicReverb}
        />
      }
      mode={
        <>
          {(Object.keys(REVERB_TYPE_LABELS) as AlgorithmicReverbType[]).map((rt) => (
            <button key={rt} className={`px-1.5 py-0.5 text-[10px] rounded capitalize ${p.reverbType === rt ? 'bg-white/[0.08] text-white/70 shadow-[0_0_3px_-1px_rgba(255,255,255,0.15)]' : 'text-white/30 hover:text-white/50 hover:bg-white/[0.06]'}`}
              onClick={() => update({ reverbType: rt })}>{REVERB_TYPE_LABELS[rt]}</button>
          ))}
        </>
      }
      footer={
        <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'algorithmicReverb', param: 'mix' }} normalizedValue={normalizeEffectParamValue('algorithmicReverb', 'mix', p.mix) ?? 0.25}>
          <HSlider value={p.mix} onChange={(v) => update({ mix: v })} label="Dry/Wet" displayValue={`${Math.round(p.mix * 100)}%`} color={EFFECT_COLORS.algorithmicReverb} />
        </AutomationControlShell>
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'algorithmicReverb', param: 'decay' }} normalizedValue={normalizeEffectParamValue('algorithmicReverb', 'decay', p.decay) ?? 0.5}>
        <Knob value={p.decay} onChange={(v) => update({ decay: v })} min={0.1} max={20} defaultValue={2.5} label="Decay" unit="s" size={56} step={0.1} color={EFFECT_COLORS.algorithmicReverb} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'algorithmicReverb', param: 'size' }} normalizedValue={normalizeEffectParamValue('algorithmicReverb', 'size', p.size) ?? 0.5}>
        <Knob value={p.size} onChange={(v) => update({ size: v })} min={0} max={1} defaultValue={0.6} label="Size" size={56} step={0.01} color={EFFECT_COLORS.algorithmicReverb} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'algorithmicReverb', param: 'damping' }} normalizedValue={normalizeEffectParamValue('algorithmicReverb', 'damping', p.damping) ?? 0.5}>
        <Knob value={p.damping} onChange={(v) => update({ damping: v })} min={0} max={1} defaultValue={0.4} label="Damping" size={56} step={0.01} color={EFFECT_COLORS.algorithmicReverb} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'algorithmicReverb', param: 'preDelay' }} normalizedValue={normalizeEffectParamValue('algorithmicReverb', 'preDelay', p.preDelay) ?? 0.5}>
        <Knob value={p.preDelay} onChange={(v) => update({ preDelay: v })} min={0} max={200} defaultValue={20} label="Pre-Dly" unit="ms" size={56} step={1} color={EFFECT_COLORS.algorithmicReverb} />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}
