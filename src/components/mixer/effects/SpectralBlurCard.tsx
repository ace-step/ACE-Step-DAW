/**
 * SpectralBlurCard — Spectral blur/smear effect card.
 * Smooths the spectrum over time and across frequency bins.
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
import type { TrackEffect, SpectralBlurParams } from '../../../types/project';

const COLOR = EFFECT_COLORS.spectralBlur;

export function SpectralBlurCard({ effect, trackId }: { effect: TrackEffect & { type: 'spectralBlur' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<SpectralBlurParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'spectralBlur');
  };

  return (
    <EffectCardLayout
      color={COLOR}
      visualization={
        <SpectralDisplay
          trackId={trackId}
          effectId={effect.id}
          width={220}
          height={80}
          color={COLOR}
        />
      }
      footer={
        <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'spectralBlur', param: 'mix' }} normalizedValue={normalizeEffectParamValue('spectralBlur', 'mix', p.mix) ?? 0.5}>
          <HSlider value={p.mix} onChange={(v) => update({ mix: v })} label="Dry/Wet" displayValue={`${Math.round(p.mix * 100)}%`} color={COLOR} />
        </AutomationControlShell>
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'spectralBlur', param: 'blurAmount' }} normalizedValue={normalizeEffectParamValue('spectralBlur', 'blurAmount', p.blurAmount) ?? 0.5}>
        <Knob value={p.blurAmount} onChange={(v) => update({ blurAmount: v })} min={0} max={1} defaultValue={0.5} label="Blur" size={56} step={0.01} color={COLOR} formatValue={(v) => `${Math.round(v * 100)}%`} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'spectralBlur', param: 'frequencySpread' }} normalizedValue={normalizeEffectParamValue('spectralBlur', 'frequencySpread', p.frequencySpread) ?? 0}>
        <Knob value={p.frequencySpread} onChange={(v) => update({ frequencySpread: v })} min={0} max={1} defaultValue={0} label="Spread" size={56} step={0.01} color={COLOR} formatValue={(v) => `${Math.round(v * 100)}%`} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'spectralBlur', param: 'brightness' }} normalizedValue={normalizeEffectParamValue('spectralBlur', 'brightness', p.brightness) ?? 0.5}>
        <Knob value={p.brightness} onChange={(v) => update({ brightness: v })} min={-1} max={1} defaultValue={0} label="Bright" size={56} step={0.01} color={COLOR} formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`} />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}
