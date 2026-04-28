/**
 * DeEsserCard — De-esser effect card.
 * Extracted from EffectCards.tsx.
 */
import { Knob } from '../../ui/Knob';
import { EffectCardLayout } from '../EffectCardLayout';
import { DeEsserDisplay } from '../DeEsserDisplay';
import { AutomationControlShell } from './AutomationControlShell';
import { EFFECT_COLORS } from './effectColors';
import { useProjectStore } from '../../../store/projectStore';
import { effectsEngine } from '../../../engine/EffectsEngine';
import { normalizeEffectParamValue } from '../../../utils/effectAutomation';
import type { TrackEffect, DeEsserParams } from '../../../types/project';

export function DeEsserCard({ effect, trackId }: { effect: TrackEffect & { type: 'deesser' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<DeEsserParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'deesser');
  };

  return (
    <EffectCardLayout
      color={EFFECT_COLORS.deesser}
      mode={
        <>
          {(['wideband', 'split'] as DeEsserParams['mode'][]).map((m) => (
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
          <button
            className={`px-2 py-0.5 text-[8px] rounded ${
              p.listen ? 'bg-green-500/30 text-green-300' : 'text-white/30 hover:bg-white/5'
            }`}
            onClick={() => update({ listen: !p.listen })}
          >
            Listen
          </button>
        </>
      }
      visualization={
        <DeEsserDisplay
          frequency={p.frequency}
          bandwidth={p.bandwidth}
          threshold={p.threshold}
          range={p.range}
          mode={p.mode}
          width={220}
          height={100}
          color={EFFECT_COLORS.deesser}
        />
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'deesser', param: 'frequency' }} normalizedValue={normalizeEffectParamValue('deesser', 'frequency', p.frequency) ?? 0.5}>
        <Knob value={p.frequency} onChange={(v) => update({ frequency: v })} min={2000} max={16000} defaultValue={7000} label="Freq" unit=" Hz" size={56} step={100} color={EFFECT_COLORS.deesser} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'deesser', param: 'bandwidth' }} normalizedValue={normalizeEffectParamValue('deesser', 'bandwidth', p.bandwidth) ?? 0.5}>
        <Knob value={p.bandwidth} onChange={(v) => update({ bandwidth: v })} min={0.5} max={8} defaultValue={2} label="Width" size={56} step={0.1} color={EFFECT_COLORS.deesser} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'deesser', param: 'threshold' }} normalizedValue={normalizeEffectParamValue('deesser', 'threshold', p.threshold) ?? 0.5}>
        <Knob value={p.threshold} onChange={(v) => update({ threshold: v })} min={-60} max={0} defaultValue={-20} label="Thresh" unit=" dB" size={56} step={0.5} color={EFFECT_COLORS.deesser} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'deesser', param: 'range' }} normalizedValue={normalizeEffectParamValue('deesser', 'range', p.range) ?? 0.5}>
        <Knob value={p.range} onChange={(v) => update({ range: v })} min={0} max={20} defaultValue={10} label="Range" unit=" dB" size={56} step={0.5} color={EFFECT_COLORS.deesser} />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}
