/**
 * GateCard — Gate/Expander effect card.
 * Extracted from EffectCards.tsx.
 */
import { Knob } from '../../ui/Knob';
import { EffectCardLayout } from '../EffectCardLayout';
import { GateCurve } from '../GateCurve';
import { AutomationControlShell } from './AutomationControlShell';
import { EFFECT_COLORS } from './effectColors';
import { useProjectStore } from '../../../store/projectStore';
import { effectsEngine } from '../../../engine/EffectsEngine';
import { normalizeEffectParamValue } from '../../../utils/effectAutomation';
import type { TrackEffect, GateParams } from '../../../types/project';

export function GateCard({ effect, trackId }: { effect: TrackEffect & { type: 'gate' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<GateParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'gate');
  };

  return (
    <EffectCardLayout
      color={EFFECT_COLORS.gate}
      mode={
        <>
          {(['gate', 'expander'] as GateParams['mode'][]).map((m) => (
            <button
              key={m}
              className={`px-2 py-0.5 text-[10px] rounded capitalize ${
                p.mode === m ? 'bg-white/[0.08] text-white/70 shadow-[0_0_3px_-1px_rgba(255,255,255,0.15)]' : 'text-white/30 hover:text-white/50 hover:bg-white/[0.06]'
              }`}
              onClick={() => update({ mode: m })}
            >
              {m}
            </button>
          ))}
        </>
      }
      visualization={
        <GateCurve
          threshold={p.threshold}
          range={p.range}
          hysteresis={p.hysteresis}
          mode={p.mode}
          width={220}
          height={120}
          color={EFFECT_COLORS.gate}
        />
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'gate', param: 'threshold' }} normalizedValue={normalizeEffectParamValue('gate', 'threshold', p.threshold) ?? 0.5}>
        <Knob value={p.threshold} onChange={(v) => update({ threshold: v })} min={-80} max={0} defaultValue={-40} label="Thresh" unit=" dB" size={56} step={0.5} color={EFFECT_COLORS.gate} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'gate', param: 'range' }} normalizedValue={normalizeEffectParamValue('gate', 'range', p.range) ?? 0.5}>
        <Knob value={p.range} onChange={(v) => update({ range: v })} min={-80} max={0} defaultValue={-80} label="Range" unit=" dB" size={56} step={1} color={EFFECT_COLORS.gate} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'gate', param: 'attack' }} normalizedValue={normalizeEffectParamValue('gate', 'attack', p.attack) ?? 0.5}>
        <Knob value={p.attack * 1000} onChange={(v) => update({ attack: v / 1000 })} min={0.1} max={50} defaultValue={1} label="Attack" unit=" ms" size={56} step={0.1} color={EFFECT_COLORS.gate} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'gate', param: 'hold' }} normalizedValue={normalizeEffectParamValue('gate', 'hold', p.hold) ?? 0.5}>
        <Knob value={p.hold * 1000} onChange={(v) => update({ hold: v / 1000 })} min={0} max={500} defaultValue={10} label="Hold" unit=" ms" size={56} step={1} color={EFFECT_COLORS.gate} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'gate', param: 'release' }} normalizedValue={normalizeEffectParamValue('gate', 'release', p.release) ?? 0.5}>
        <Knob value={p.release * 1000} onChange={(v) => update({ release: v / 1000 })} min={5} max={4000} defaultValue={50} label="Release" unit=" ms" size={56} step={1} color={EFFECT_COLORS.gate} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'gate', param: 'hysteresis' }} normalizedValue={normalizeEffectParamValue('gate', 'hysteresis', p.hysteresis) ?? 0.5}>
        <Knob value={p.hysteresis} onChange={(v) => update({ hysteresis: v })} min={0} max={12} defaultValue={4} label="Hyst" unit=" dB" size={56} step={0.5} color={EFFECT_COLORS.gate} />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}
