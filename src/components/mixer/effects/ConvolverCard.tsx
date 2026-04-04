/**
 * ConvolverCard — Convolution reverb effect card.
 * Extracted from EffectCards.tsx.
 */
import { Knob } from '../../ui/Knob';
import { HSlider } from '../../ui/HSlider';
import { EffectCardLayout } from '../EffectCardLayout';
import { ConvolverDisplay } from '../ConvolverDisplay';
import { AutomationControlShell } from './AutomationControlShell';
import { EFFECT_COLORS } from './effectColors';
import { useProjectStore } from '../../../store/projectStore';
import { effectsEngine } from '../../../engine/EffectsEngine';
import { normalizeEffectParamValue } from '../../../utils/effectAutomation';
import type { TrackEffect, ConvolverParams, FactoryIRType } from '../../../types/project';

const IR_TYPE_LABELS: Record<FactoryIRType | 'custom', string> = {
  smallRoom: 'Small Room',
  largeHall: 'Large Hall',
  plate: 'Plate',
  spring: 'Spring',
  custom: 'Custom URL',
};

export function ConvolverCard({ effect, trackId }: { effect: TrackEffect & { type: 'convolver' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<ConvolverParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'convolver');
  };

  return (
    <EffectCardLayout
      color={EFFECT_COLORS.convolver}
      mode={
        <div className="flex items-center gap-2 w-full">
          <span className="text-[10px] text-white/50 w-6">IR</span>
          <select
            className="flex-1 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white/80"
            value={p.irType}
            onChange={(e) => update({ irType: e.target.value as ConvolverParams['irType'] })}
          >
            {(Object.keys(IR_TYPE_LABELS) as Array<FactoryIRType | 'custom'>).map((key) => (
              <option key={key} value={key}>{IR_TYPE_LABELS[key]}</option>
            ))}
          </select>
        </div>
      }
      visualization={
        <ConvolverDisplay
          irType={p.irType}
          wet={p.wet}
          preDelay={p.preDelay / 1000}
          width={220}
          height={80}
          color={EFFECT_COLORS.convolver}
        />
      }
      footer={
        <div className="flex flex-col gap-1.5">
          {p.irType === 'custom' && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/50 w-6">URL</span>
              <input
                className="flex-1 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white/80"
                type="text"
                value={p.irUrl ?? ''}
                placeholder="https://example.com/ir.wav"
                onChange={(e) => update({ irUrl: e.target.value })}
              />
            </div>
          )}
          <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'convolver', param: 'wet' }} normalizedValue={normalizeEffectParamValue('convolver', 'wet', p.wet) ?? 0.5}>
            <HSlider value={p.wet} onChange={(v) => update({ wet: v })} label="Dry/Wet" displayValue={`${Math.round(p.wet * 100)}%`} color={EFFECT_COLORS.convolver} />
          </AutomationControlShell>
        </div>
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'convolver', param: 'preDelay' }} normalizedValue={normalizeEffectParamValue('convolver', 'preDelay', p.preDelay) ?? 0}>
        <Knob value={p.preDelay} onChange={(v) => update({ preDelay: v })} min={0} max={100} defaultValue={0} label="Pre-Dly" unit="ms" size={56} step={1} color={EFFECT_COLORS.convolver} />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}
