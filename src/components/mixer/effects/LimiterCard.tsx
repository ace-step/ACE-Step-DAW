/**
 * LimiterCard — Limiter effect card.
 * Extracted from EffectCards.tsx.
 */
import { Knob } from '../../ui/Knob';
import { EffectCardLayout } from '../EffectCardLayout';
import { LimiterCurve } from '../LimiterCurve';
import { AutomationControlShell } from './AutomationControlShell';
import { EFFECT_COLORS } from './effectColors';
import { useProjectStore } from '../../../store/projectStore';
import { effectsEngine } from '../../../engine/EffectsEngine';
import { normalizeEffectParamValue } from '../../../utils/effectAutomation';
import type { TrackEffect, LimiterParams } from '../../../types/project';

export function LimiterCard({ effect, trackId }: { effect: TrackEffect & { type: 'limiter' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<LimiterParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'limiter');
  };

  return (
    <EffectCardLayout
      color={EFFECT_COLORS.limiter}
      mode={
        <>
          {(['transparent', 'aggressive', 'warm'] as LimiterParams['style'][]).map((s) => (
            <button
              key={s}
              className={`px-3 py-1 text-[9px] rounded-md capitalize transition-colors ${
                p.style === s ? 'bg-amber-500/25 text-amber-200 font-medium' : 'text-white/40 hover:text-white/60 hover:bg-white/5'
              }`}
              onClick={() => update({ style: s })}
            >
              {s}
            </button>
          ))}
        </>
      }
      visualization={
        <LimiterCurve
          ceiling={p.ceiling}
          gain={p.gain}
          style={p.style}
          width={220}
          height={120}
          color={EFFECT_COLORS.limiter}
        />
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'limiter', param: 'gain' }} normalizedValue={normalizeEffectParamValue('limiter', 'gain', p.gain) ?? 0.5}>
        <Knob value={p.gain} onChange={(v) => update({ gain: v })} min={-12} max={24} defaultValue={0} label="Gain" unit=" dB" size={56} step={0.5} color={EFFECT_COLORS.limiter} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'limiter', param: 'ceiling' }} normalizedValue={normalizeEffectParamValue('limiter', 'ceiling', p.ceiling) ?? 0.5}>
        <Knob value={p.ceiling} onChange={(v) => update({ ceiling: v })} min={-12} max={0} defaultValue={-0.3} label="Ceiling" unit=" dB" size={56} step={0.1} color={EFFECT_COLORS.limiter} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'limiter', param: 'release' }} normalizedValue={normalizeEffectParamValue('limiter', 'release', p.release) ?? 0.5}>
        <Knob value={p.release * 1000} onChange={(v) => update({ release: v / 1000 })} min={1} max={1000} defaultValue={100} label="Release" unit=" ms" size={56} step={1} color={EFFECT_COLORS.limiter} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'limiter', param: 'lookahead' }} normalizedValue={normalizeEffectParamValue('limiter', 'lookahead', p.lookahead) ?? 0.5}>
        <Knob value={p.lookahead * 1000} onChange={(v) => update({ lookahead: v / 1000 })} min={0} max={20} defaultValue={5} label="L.Ahead" unit=" ms" size={56} step={0.5} color={EFFECT_COLORS.limiter} />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}
