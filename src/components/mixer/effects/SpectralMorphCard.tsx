/**
 * SpectralMorphCard — Spectral morphing between two audio sources.
 * Crossfades between the spectral content of the current track
 * and a selected morph target track.
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
import type { TrackEffect, SpectralMorphParams } from '../../../types/project';

const COLOR = EFFECT_COLORS.spectralMorph;

export function SpectralMorphCard({ effect, trackId }: { effect: TrackEffect & { type: 'spectralMorph' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const tracks = useProjectStore((s) => s.project?.tracks ?? []);
  const p = effect.params;

  const update = (updates: Partial<SpectralMorphParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'spectralMorph');
  };

  // Available target tracks (exclude self)
  const targetTracks = tracks.filter((t) => t.id !== trackId);

  return (
    <EffectCardLayout
      color={COLOR}
      mode={
        <div className="flex gap-1 items-center">
          <button
            className={`px-2 py-0.5 text-[10px] rounded ${
              p.frozen
                ? 'bg-[#a88de0]/30 text-[#d4b8ff] ring-1 ring-[#a88de0]/40'
                : 'text-white/30 hover:text-white/50 hover:bg-white/[0.06]'
            }`}
            onClick={() => update({ frozen: !p.frozen })}
          >
            {p.frozen ? 'LOCKED' : 'LOCK B'}
          </button>
        </div>
      }
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
        <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'spectralMorph', param: 'mix' }} normalizedValue={normalizeEffectParamValue('spectralMorph', 'mix', p.mix) ?? 0.5}>
          <HSlider value={p.mix} onChange={(v) => update({ mix: v })} label="Dry/Wet" displayValue={`${Math.round(p.mix * 100)}%`} color={COLOR} />
        </AutomationControlShell>
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'spectralMorph', param: 'morphAmount' }} normalizedValue={normalizeEffectParamValue('spectralMorph', 'morphAmount', p.morphAmount) ?? 0.5}>
        <Knob value={p.morphAmount} onChange={(v) => update({ morphAmount: v })} min={0} max={1} defaultValue={0.5} label="Morph" size={56} step={0.01} color={COLOR} formatValue={(v) => `A${Math.round((1 - v) * 100)}:B${Math.round(v * 100)}`} />
      </AutomationControlShell>
      <div className="flex flex-col items-center gap-1 min-w-[64px]">
        <span className="text-[9px] text-white/30">Source B</span>
        <select
          className="bg-white/[0.06] text-[10px] text-white/60 rounded px-1.5 py-0.5 w-full border border-white/[0.08] outline-none"
          value={p.sourceTrackId ?? ''}
          onChange={(e) => update({ sourceTrackId: e.target.value || undefined })}
        >
          <option value="">Self (Snapshot)</option>
          {targetTracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.displayName}
            </option>
          ))}
        </select>
      </div>
    </EffectCardLayout>
  );
}
