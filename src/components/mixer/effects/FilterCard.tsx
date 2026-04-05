/**
 * FilterCard — Filter effect card with LFO.
 * Extracted from EffectCards.tsx.
 */
import { Knob } from '../../ui/Knob';
import { EffectCardLayout } from '../EffectCardLayout';
import { FilterResponseCurve } from '../FilterResponseCurve';
import { AutomationControlShell } from './AutomationControlShell';
import { EFFECT_COLORS } from './effectColors';
import { useProjectStore } from '../../../store/projectStore';
import { effectsEngine } from '../../../engine/EffectsEngine';
import { normalizeEffectParamValue } from '../../../utils/effectAutomation';
import type { TrackEffect, FilterParams } from '../../../types/project';
import { LfoWaveformPreview } from './LfoWaveformPreview';

export function FilterCard({ effect, trackId }: { effect: TrackEffect & { type: 'filter' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<FilterParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'filter');
  };

  return (
    <EffectCardLayout
      color={EFFECT_COLORS.filter}
      visualization={
        <FilterResponseCurve
          frequency={p.frequency}
          resonance={Math.max(0.1, p.resonance)}
          filterType={p.filterType}
          width={160}
          height={100}
          color={EFFECT_COLORS.filter}
        />
      }
      mode={
        <>
          {(['lowpass', 'highpass', 'bandpass'] as FilterParams['filterType'][]).map((ft) => (
            <button
              key={ft}
              className={`px-1.5 py-0.5 text-[8px] rounded uppercase ${
                p.filterType === ft ? 'bg-cyan-500/20 text-cyan-300 shadow-[0_0_3px_-1px_rgba(34,211,238,0.3)]' : 'text-white/30 hover:text-white/50 hover:bg-white/[0.06]'
              }`}
              onClick={() => update({ filterType: ft })}
            >
              {ft === 'lowpass' ? 'LP' : ft === 'highpass' ? 'HP' : 'BP'}
            </button>
          ))}
        </>
      }
      footer={
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <button
              className={`px-2 py-0.5 text-[8px] rounded ${
                p.lfoEnabled ? 'bg-green-500/30 text-green-300' : 'text-white/30 hover:bg-white/5'
              }`}
              onClick={() => update({ lfoEnabled: !p.lfoEnabled })}
            >
              LFO {p.lfoEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
          {p.lfoEnabled && (
            <div className="flex gap-3 justify-center items-center">
              <LfoWaveformPreview shape="sine" rate={p.lfoRate} depth={p.lfoDepth} color={EFFECT_COLORS.filter} />
              <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'filter', param: 'lfoRate' }} normalizedValue={normalizeEffectParamValue('filter', 'lfoRate', p.lfoRate) ?? 0.5}>
                <Knob value={p.lfoRate} onChange={(v) => update({ lfoRate: v })} min={0.1} max={20} defaultValue={2} label="Rate" size={56} step={0.1} color={EFFECT_COLORS.filter} />
              </AutomationControlShell>
              <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'filter', param: 'lfoDepth' }} normalizedValue={normalizeEffectParamValue('filter', 'lfoDepth', p.lfoDepth) ?? 0.5}>
                <Knob value={p.lfoDepth} onChange={(v) => update({ lfoDepth: v })} min={0} max={1} defaultValue={0.25} label="Depth" size={56} step={0.01} color={EFFECT_COLORS.filter} />
              </AutomationControlShell>
            </div>
          )}
        </div>
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'filter', param: 'frequency' }} normalizedValue={normalizeEffectParamValue('filter', 'frequency', p.frequency) ?? 0.5}>
        <Knob value={p.frequency} onChange={(v) => update({ frequency: v })} min={20} max={20000} defaultValue={1800} label="Cutoff" size={56} step={10} color={EFFECT_COLORS.filter} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'filter', param: 'resonance' }} normalizedValue={normalizeEffectParamValue('filter', 'resonance', p.resonance) ?? 0.5}>
        <Knob value={p.resonance} onChange={(v) => update({ resonance: v })} min={0} max={20} defaultValue={1} label="Reso" size={56} step={0.1} color={EFFECT_COLORS.filter} />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}
