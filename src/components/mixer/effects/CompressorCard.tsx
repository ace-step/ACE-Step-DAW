/**
 * CompressorCard — Compressor effect card with sidechain and GR meter.
 * Extracted from EffectCards.tsx.
 */
import { useEffect, useRef, useState } from 'react';
import { Knob } from '../../ui/Knob';
import { EffectCardLayout } from '../EffectCardLayout';
import { CompressorCurve } from '../CompressorCurve';
import { AutomationControlShell } from './AutomationControlShell';
import { EFFECT_COLORS } from './effectColors';
import { useProjectStore } from '../../../store/projectStore';
import { effectsEngine } from '../../../engine/EffectsEngine';
import { normalizeEffectParamValue } from '../../../utils/effectAutomation';
import type { TrackEffect, CompressorParams } from '../../../types/project';

export function CompressorCard({ effect, trackId }: { effect: TrackEffect & { type: 'compressor' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const setSidechainSource = useProjectStore((s) => s.setSidechainSource);
  const tracks = useProjectStore((s) => s.project?.tracks ?? []);
  const p = effect.params;
  const [reduction, setReduction] = useState(0);
  const [scReduction, setScReduction] = useState(0);
  const [peakGr, setPeakGr] = useState(0);
  const animRef = useRef<number>(0);
  const displayGrRef = useRef(0);
  const displayScGrRef = useRef(0);
  const peakGrRef = useRef(0);
  const peakHoldCountRef = useRef(0);

  const hasSidechain = !!p.sidechainSourceTrackId;
  const otherTracks = tracks.filter((t) => t.id !== trackId);

  // GR meter ballistics: fast attack, slower release, peak hold
  useEffect(() => {
    const ATTACK_COEFF = 0.5;  // Fast attack (responds quickly to GR onset)
    const RELEASE_COEFF = 0.05; // Slow release (meter falls back smoothly)
    const PEAK_HOLD_FRAMES = 90; // ~1.5s at 60fps

    const tick = () => {
      const rawGr = effectsEngine.getCompressorReduction(trackId, effect.id);
      const rawScGr = effectsEngine.getSidechainReduction(trackId, effect.id);

      // Ballistic smoothing: fast attack, slow release
      const targetGr = Math.abs(rawGr);
      const prevGr = displayGrRef.current;
      const coeff = targetGr > prevGr ? ATTACK_COEFF : RELEASE_COEFF;
      displayGrRef.current = prevGr + (targetGr - prevGr) * coeff;

      // Same for sidechain
      const targetScGr = Math.abs(rawScGr);
      const prevScGr = displayScGrRef.current;
      const scCoeff = targetScGr > prevScGr ? ATTACK_COEFF : RELEASE_COEFF;
      displayScGrRef.current = prevScGr + (targetScGr - prevScGr) * scCoeff;

      // Peak hold
      if (displayGrRef.current > peakGrRef.current) {
        peakGrRef.current = displayGrRef.current;
        peakHoldCountRef.current = PEAK_HOLD_FRAMES;
      } else if (peakHoldCountRef.current > 0) {
        peakHoldCountRef.current--;
      } else {
        peakGrRef.current = Math.max(0, peakGrRef.current - 0.3);
      }

      setReduction(-displayGrRef.current);
      setScReduction(-displayScGrRef.current);
      setPeakGr(peakGrRef.current);
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [trackId, effect.id]);

  const update = (updates: Partial<CompressorParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'compressor');
  };

  const handleSidechainChange = (sourceTrackId: string) => {
    const value = sourceTrackId === '' ? undefined : sourceTrackId;
    setSidechainSource(trackId, effect.id, value);
  };

  return (
    <EffectCardLayout
      color={EFFECT_COLORS.compressor}
      visualization={
        <CompressorCurve
          threshold={p.threshold}
          ratio={p.ratio}
          kneeDb={p.knee}
          reduction={reduction}
          width={220}
          height={120}
          color={EFFECT_COLORS.compressor}
        />
      }
      footer={
        <div className="flex flex-col gap-2">
          {/* Sidechain source */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-white/40 uppercase w-8">SC</span>
            <select
              data-testid="sidechain-source-select"
              className="w-[180px] text-[10px] bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-white/70 outline-none focus:border-amber-500/50"
              value={p.sidechainSourceTrackId ?? ''}
              onChange={(e) => handleSidechainChange(e.target.value)}
            >
              <option value="">None</option>
              {otherTracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.displayName || `Track ${tracks.indexOf(t) + 1}`}
                </option>
              ))}
            </select>
          </div>
          {/* GR meter with ballistics */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-white/30 w-8">GR</span>
            <div className="w-[180px] h-2 bg-white/5 rounded-sm overflow-hidden relative">
              <div
                className="absolute right-0 top-0 bottom-0 bg-amber-500/60 rounded-sm"
                style={{ width: `${Math.min(100, Math.abs(reduction) * 100 / 30)}%` }}
              />
              {/* Peak hold indicator */}
              {peakGr > 0.1 && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-amber-300/80"
                  style={{ right: `${100 - Math.min(100, peakGr * 100 / 30)}%` }}
                />
              )}
            </div>
            <span className="text-[9px] text-white/40 font-mono w-12 text-right">{reduction.toFixed(1)} dB</span>
          </div>
          {hasSidechain && (
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-amber-400/50 w-8">SC</span>
              <div className="w-[180px] h-2 bg-white/5 rounded-sm overflow-hidden relative">
                <div
                  className="absolute right-0 top-0 bottom-0 bg-amber-400/40 rounded-sm transition-all"
                  style={{ width: `${Math.min(100, Math.abs(scReduction) * 100 / 30)}%` }}
                />
              </div>
              <span className="text-[9px] text-amber-400/40 font-mono w-12 text-right">{scReduction.toFixed(1)} dB</span>
            </div>
          )}
        </div>
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'compressor', param: 'threshold' }} normalizedValue={normalizeEffectParamValue('compressor', 'threshold', p.threshold) ?? 0.5}>
        <Knob value={p.threshold} onChange={(v) => update({ threshold: v })} min={-60} max={0} defaultValue={-24} label="Thresh" unit=" dB" size={56} step={1} color={EFFECT_COLORS.compressor} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'compressor', param: 'ratio' }} normalizedValue={normalizeEffectParamValue('compressor', 'ratio', p.ratio) ?? 0.5}>
        <Knob value={p.ratio} onChange={(v) => update({ ratio: v })} min={1} max={20} defaultValue={4} label="Ratio" size={56} step={0.5} color={EFFECT_COLORS.compressor} formatValue={(v) => `${v.toFixed(1)}:1`} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'compressor', param: 'attack' }} normalizedValue={normalizeEffectParamValue('compressor', 'attack', p.attack) ?? 0.5}>
        <Knob value={p.attack} onChange={(v) => update({ attack: v })} min={0.001} max={0.1} defaultValue={0.02} label="Attack" size={56} step={0.001} color={EFFECT_COLORS.compressor} formatValue={(v) => `${(v * 1000).toFixed(1)} ms`} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'compressor', param: 'release' }} normalizedValue={normalizeEffectParamValue('compressor', 'release', p.release) ?? 0.5}>
        <Knob value={p.release} onChange={(v) => update({ release: v })} min={0.01} max={1} defaultValue={0.2} label="Release" size={56} step={0.01} color={EFFECT_COLORS.compressor} formatValue={(v) => v >= 1 ? `${v.toFixed(1)} s` : `${(v * 1000).toFixed(0)} ms`} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'compressor', param: 'knee' }} normalizedValue={normalizeEffectParamValue('compressor', 'knee', p.knee) ?? 0.5}>
        <Knob value={p.knee} onChange={(v) => update({ knee: v })} min={0} max={40} defaultValue={6} label="Knee" unit=" dB" size={56} step={1} color={EFFECT_COLORS.compressor} />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}
