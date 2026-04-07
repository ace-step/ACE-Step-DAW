/**
 * Spectral effect cards — Freeze, Blur, Filter, Morph.
 *
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/963
 */
import { useCallback } from 'react';
import { Knob } from '../../ui/Knob';
import { HSlider } from '../../ui/HSlider';
import { EffectCardLayout } from '../EffectCardLayout';
import { AutomationControlShell } from './AutomationControlShell';
import { EFFECT_COLORS } from './effectColors';
import { useProjectStore } from '../../../store/projectStore';
import { effectsEngine } from '../../../engine/EffectsEngine';
import { normalizeEffectParamValue } from '../../../utils/effectAutomation';
import type {
  TrackEffect,
  SpectralFreezeParams,
  SpectralBlurParams,
  SpectralFilterParams,
  SpectralMorphParams,
} from '../../../types/project';

// ─── Spectral Freeze ──────────────────────────────────────────────────────────

export function SpectralFreezeCard({
  effect,
  trackId,
}: {
  effect: TrackEffect & { type: 'spectralFreeze' };
  trackId: string;
}) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = useCallback(
    (updates: Partial<SpectralFreezeParams>) => {
      const newParams = { ...p, ...updates };
      updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
      effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'spectralFreeze');
    },
    [p, trackId, effect.id, updateTrackEffect],
  );

  return (
    <EffectCardLayout color={EFFECT_COLORS.spectralFreeze}>
      <button
        className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
          p.freeze
            ? 'bg-cyan-500/30 text-cyan-300 ring-1 ring-cyan-500/50'
            : 'bg-white/5 text-zinc-400 hover:bg-white/10'
        }`}
        onClick={() => update({ freeze: !p.freeze })}
      >
        {p.freeze ? 'Frozen' : 'Freeze'}
      </button>
      <AutomationControlShell
        trackId={trackId}
        effect={effect}
        target={{ effectType: 'spectralFreeze', param: 'wet' }}
        normalizedValue={normalizeEffectParamValue('spectralFreeze', 'wet', p.wet) ?? 1}
      >
        <Knob
          value={p.wet}
          onChange={(v) => update({ wet: v })}
          min={0}
          max={1}
          defaultValue={1}
          label="Wet"
          size={56}
          step={0.01}
          color={EFFECT_COLORS.spectralFreeze}
        />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}

// ─── Spectral Blur ────────────────────────────────────────────────────────────

export function SpectralBlurCard({
  effect,
  trackId,
}: {
  effect: TrackEffect & { type: 'spectralBlur' };
  trackId: string;
}) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = useCallback(
    (updates: Partial<SpectralBlurParams>) => {
      const newParams = { ...p, ...updates };
      updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
      effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'spectralBlur');
    },
    [p, trackId, effect.id, updateTrackEffect],
  );

  return (
    <EffectCardLayout color={EFFECT_COLORS.spectralBlur}>
      <AutomationControlShell
        trackId={trackId}
        effect={effect}
        target={{ effectType: 'spectralBlur', param: 'decay' }}
        normalizedValue={normalizeEffectParamValue('spectralBlur', 'decay', p.decay) ?? 0.85}
      >
        <Knob
          value={p.decay}
          onChange={(v) => update({ decay: v })}
          min={0}
          max={0.99}
          defaultValue={0.85}
          label="Blur"
          size={56}
          step={0.01}
          color={EFFECT_COLORS.spectralBlur}
        />
      </AutomationControlShell>
      <AutomationControlShell
        trackId={trackId}
        effect={effect}
        target={{ effectType: 'spectralBlur', param: 'wet' }}
        normalizedValue={normalizeEffectParamValue('spectralBlur', 'wet', p.wet) ?? 0.7}
      >
        <Knob
          value={p.wet}
          onChange={(v) => update({ wet: v })}
          min={0}
          max={1}
          defaultValue={0.7}
          label="Wet"
          size={56}
          step={0.01}
          color={EFFECT_COLORS.spectralBlur}
        />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}

// ─── Spectral Filter ──────────────────────────────────────────────────────────

function SpectralFilterBands({
  bands,
  onChange,
  color,
}: {
  bands: number[];
  onChange: (bands: number[]) => void;
  color: string;
}) {
  const handleBandChange = useCallback(
    (index: number, value: number) => {
      const newBands = [...bands];
      newBands[index] = Math.max(0, Math.min(1, value));
      onChange(newBands);
    },
    [bands, onChange],
  );

  return (
    <div className="flex h-16 items-end gap-px">
      {bands.map((gain, i) => (
        <div
          key={i}
          className="group relative flex-1 cursor-pointer"
          style={{ height: '100%' }}
          onPointerDown={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const y = 1 - (e.clientY - rect.top) / rect.height;
            handleBandChange(i, y);

            const move = (ev: PointerEvent) => {
              const newY = 1 - (ev.clientY - rect.top) / rect.height;
              handleBandChange(i, newY);
            };
            const up = () => {
              window.removeEventListener('pointermove', move);
              window.removeEventListener('pointerup', up);
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
          }}
        >
          <div
            className="absolute bottom-0 w-full rounded-t-sm transition-all"
            style={{
              height: `${gain * 100}%`,
              backgroundColor: color,
              opacity: 0.6,
            }}
          />
        </div>
      ))}
    </div>
  );
}

export function SpectralFilterCard({
  effect,
  trackId,
}: {
  effect: TrackEffect & { type: 'spectralFilter' };
  trackId: string;
}) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = useCallback(
    (updates: Partial<SpectralFilterParams>) => {
      const newParams = { ...p, ...updates };
      updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
      effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'spectralFilter');
    },
    [p, trackId, effect.id, updateTrackEffect],
  );

  return (
    <EffectCardLayout
      color={EFFECT_COLORS.spectralFilter}
      visualization={
        <SpectralFilterBands
          bands={p.bands}
          onChange={(bands) => update({ bands })}
          color={EFFECT_COLORS.spectralFilter}
        />
      }
      footer={
        <AutomationControlShell
          trackId={trackId}
          effect={effect}
          target={{ effectType: 'spectralFilter', param: 'wet' }}
          normalizedValue={normalizeEffectParamValue('spectralFilter', 'wet', p.wet) ?? 1}
        >
          <HSlider
            value={p.wet}
            onChange={(v) => update({ wet: v })}
            label="Dry/Wet"
            displayValue={`${Math.round(p.wet * 100)}%`}
            color={EFFECT_COLORS.spectralFilter}
          />
        </AutomationControlShell>
      }
    >
      <button
        className="rounded bg-white/5 px-2 py-1 text-[10px] text-zinc-400 hover:bg-white/10"
        onClick={() => update({ bands: Array(32).fill(1) })}
      >
        Reset
      </button>
    </EffectCardLayout>
  );
}

// ─── Spectral Morph ───────────────────────────────────────────────────────────

export function SpectralMorphCard({
  effect,
  trackId,
}: {
  effect: TrackEffect & { type: 'spectralMorph' };
  trackId: string;
}) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = useCallback(
    (updates: Partial<SpectralMorphParams>) => {
      const newParams = { ...p, ...updates };
      updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
      effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'spectralMorph');
    },
    [p, trackId, effect.id, updateTrackEffect],
  );

  const captureRef = useCallback(() => {
    const nodes = effectsEngine.getChainNodes(trackId);
    const spectralNode = nodes?.find((n) => n.id === effect.id);
    if (spectralNode) {
      const sn = (spectralNode as Record<string, unknown>)._spectralNode;
      if (sn && typeof (sn as { captureMorphReference: () => void }).captureMorphReference === 'function') {
        (sn as { captureMorphReference: () => void }).captureMorphReference();
      }
    }
  }, [trackId, effect.id]);

  return (
    <EffectCardLayout color={EFFECT_COLORS.spectralMorph}>
      <button
        className="rounded bg-amber-500/20 px-2 py-1 text-[10px] font-medium text-amber-300 hover:bg-amber-500/30"
        onClick={captureRef}
      >
        Capture Ref
      </button>
      <AutomationControlShell
        trackId={trackId}
        effect={effect}
        target={{ effectType: 'spectralMorph', param: 'amount' }}
        normalizedValue={normalizeEffectParamValue('spectralMorph', 'amount', p.amount) ?? 0.5}
      >
        <Knob
          value={p.amount}
          onChange={(v) => update({ amount: v })}
          min={0}
          max={1}
          defaultValue={0.5}
          label="Morph"
          size={56}
          step={0.01}
          color={EFFECT_COLORS.spectralMorph}
        />
      </AutomationControlShell>
      <AutomationControlShell
        trackId={trackId}
        effect={effect}
        target={{ effectType: 'spectralMorph', param: 'wet' }}
        normalizedValue={normalizeEffectParamValue('spectralMorph', 'wet', p.wet) ?? 0.7}
      >
        <Knob
          value={p.wet}
          onChange={(v) => update({ wet: v })}
          min={0}
          max={1}
          defaultValue={0.7}
          label="Wet"
          size={56}
          step={0.01}
          color={EFFECT_COLORS.spectralMorph}
        />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}
