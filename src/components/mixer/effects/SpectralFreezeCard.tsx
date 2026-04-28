/**
 * SpectralFreezeCard — Spectral freeze effect card.
 * Captures and holds a spectral snapshot of the input audio.
 */
import { Knob } from '../../ui/Knob';
import { HSlider } from '../../ui/HSlider';
import { EffectCardLayout } from '../EffectCardLayout';
import { AutomationControlShell } from './AutomationControlShell';
import { EFFECT_COLORS } from './effectColors';
import { SpectralDisplay } from '../SpectralDisplay';
import { useProjectStore } from '../../../store/projectStore';
import { effectsEngine } from '../../../engine/EffectsEngine';
import { normalizeEffectParamValue } from '../../../utils/effectAutomation';
import type { TrackEffect, SpectralFreezeParams } from '../../../types/project';

const COLOR = EFFECT_COLORS.spectralFreeze;

export function SpectralFreezeCard({ effect, trackId }: { effect: TrackEffect & { type: 'spectralFreeze' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<SpectralFreezeParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'spectralFreeze');
  };

  return (
    <EffectCardLayout
      color={COLOR}
      mode={
        <button
          className={`px-2.5 py-1 text-[10px] rounded font-medium transition-all ${
            p.frozen
              ? 'bg-[#7c5cbf]/30 text-[#c4a8ff] shadow-[0_0_8px_-2px_rgba(124,92,191,0.4)] ring-1 ring-[#7c5cbf]/40'
              : 'text-white/30 hover:text-white/50 hover:bg-white/[0.06]'
          }`}
          onClick={() => update({ frozen: !p.frozen })}
        >
          {p.frozen ? 'FROZEN' : 'FREEZE'}
        </button>
      }
      visualization={
        <SpectralDisplay
          trackId={trackId}
          effectId={effect.id}
          width={220}
          height={80}
          color={COLOR}
          frozen={p.frozen}
        />
      }
      footer={
        <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'spectralFreeze', param: 'mix' }} normalizedValue={normalizeEffectParamValue('spectralFreeze', 'mix', p.mix) ?? 1}>
          <HSlider value={p.mix} onChange={(v) => update({ mix: v })} label="Dry/Wet" displayValue={`${Math.round(p.mix * 100)}%`} color={COLOR} />
        </AutomationControlShell>
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'spectralFreeze', param: 'decay' }} normalizedValue={normalizeEffectParamValue('spectralFreeze', 'decay', p.decay) ?? 1}>
        <Knob value={p.decay} onChange={(v) => update({ decay: v })} min={0} max={1} defaultValue={1} label="Decay" size={56} step={0.01} color={COLOR} formatValue={(v) => v >= 0.99 ? '∞' : `${Math.round(v * 100)}%`} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'spectralFreeze', param: 'brightness' }} normalizedValue={normalizeEffectParamValue('spectralFreeze', 'brightness', p.brightness) ?? 0.5}>
        <Knob value={p.brightness} onChange={(v) => update({ brightness: v })} min={-1} max={1} defaultValue={0} label="Bright" size={56} step={0.01} color={COLOR} formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`} />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}
