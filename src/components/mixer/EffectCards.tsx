/**
 * EffectCards.tsx — Individual effect parameter UIs (EQ3, Compressor, Reverb, Delay, Distortion, Filter)
 * Extracted from EffectChain.tsx to keep components under 600 lines.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Knob } from '../ui/Knob';
import { PrecisionInput, clampValue, roundToStep } from '../ui/PrecisionInput';
import { ContextMenuWrapper, ContextMenuItem } from '../ui/ContextMenu';
import { EffectCardLayout } from './EffectCardLayout';
import { CompressorCurve } from './CompressorCurve';
import { DistortionCurve } from './DistortionCurve';
import { ReverbDecayCurve } from './ReverbDecayCurve';
import { DelayTapTimeline } from './DelayTapTimeline';
import { FilterResponseCurve } from './FilterResponseCurve';
import { ModulationDisplay } from './ModulationDisplay';
import { useProjectStore } from '../../store/projectStore';
import { effectsEngine } from '../../engine/EffectsEngine';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import type {
  AutomationParameter,
  AutomatableEffectTarget,
  TrackEffect,
  TrackEffectType,
  EQ3Params,
  ParametricEQParams,
  ParametricEQBand,
  ParametricEQBandType,
  CompressorParams,
  ReverbParams,
  DelayParams,
  DistortionParams,
  FilterParams,
  ChorusParams,
  FlangerParams,
  PhaserParams,
  ConvolverParams,
  FactoryIRType,
  GateParams,
  DeEsserParams,
  TransientShaperParams,
  LimiterParams,
  SaturationParams,
  SaturationType,
  StereoImagerParams,
  AlgorithmicReverbParams,
  AlgorithmicReverbType,
  NoiseGateReductionParams,
} from '../../types/project';
import {
  PARAMETRIC_EQ_MAX_FREQUENCY,
  PARAMETRIC_EQ_MAX_GAIN,
  PARAMETRIC_EQ_MAX_Q,
  PARAMETRIC_EQ_MIN_FREQUENCY,
  PARAMETRIC_EQ_MIN_GAIN,
  PARAMETRIC_EQ_MIN_Q,
  clampParametricEqFrequency,
  clampParametricEqGain,
  clampParametricEqQ,
  createDefaultParametricEqBands,
  createSimpleParametricEqBands,
  frequencyToRatio,
  getBandControlLabel,
  getEqResponseAtFrequency,
  ratioToFrequency,
  spectrumBinToFrequency,
} from '../../utils/parametricEq';
import { automationParamEquals } from '../../types/project';
import { getEffectAutomationLabel, normalizeEffectParamValue } from '../../utils/effectAutomation';

interface HSliderProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  defaultValue?: number;
  label?: string;
  displayValue?: string;
  color?: string;
  width?: number;
}
export function HSlider({ value, onChange, min = 0, max = 1, defaultValue = min, label, displayValue, color = '#a855f7', width = 80 }: HSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [showPrecisionInput, setShowPrecisionInput] = useState(false);
  const clamp = useCallback((nextValue: number) => clampValue(nextValue, min, max), [min, max]);
  const step = (max - min) / 100;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const track = trackRef.current;
    if (!track) return;

    const update = (clientX: number) => {
      const rect = track.getBoundingClientRect();
      const norm = clampValue((clientX - rect.left) / rect.width, 0, 1);
      onChange(clamp(min + norm * (max - min)));
    };
    update(e.clientX);

    const onMove = (me: MouseEvent) => update(me.clientX);
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [clamp, onChange, min, max]);

  const norm = (value - min) / (max - min);

  return (
    <div className="flex flex-col gap-0.5">
      {label && (
        <div className="flex justify-between items-center">
          <span className="text-[9px] text-white/30 tracking-wide">{label}</span>
          {displayValue && <span className="text-[10px] text-white/60 font-mono font-medium">{displayValue}</span>}
        </div>
      )}
      <div
        ref={trackRef}
        className="relative cursor-pointer rounded-sm"
        style={{ width, height: 4 }}
        onMouseDown={handleMouseDown}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onChange(clamp(defaultValue));
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowPrecisionInput(true);
        }}
        aria-label={`${label ?? 'Control'} slider`}
      >
        {/* Track background */}
        <div className="absolute inset-0 rounded-sm bg-white/[0.06]" />
        {/* Filled portion — crisp right edge, no thumb */}
        <div
          className="absolute left-0 top-0 bottom-0 rounded-sm"
          style={{ width: `${norm * 100}%`, backgroundColor: color, opacity: 0.7 }}
        />
      </div>
      {showPrecisionInput && (
        <PrecisionInput
          ariaLabel={`${label ?? 'Control'} exact value`}
          initialValue={value}
          min={min}
          max={max}
          step={step}
          onSubmit={(nextValue) => {
            onChange(clamp(roundToStep(nextValue, step)));
            setShowPrecisionInput(false);
          }}
          onCancel={() => setShowPrecisionInput(false)}
          className="mt-1 w-20 rounded border border-white/20 bg-[#111426] px-1.5 py-1 text-[10px] text-white outline-none"
        />
      )}
    </div>
  );
}

interface AutomationControlShellProps {
  trackId: string;
  effect: TrackEffect;
  target: AutomatableEffectTarget;
  normalizedValue: number;
  children: ReactNode;
}

function AutomationControlShell({
  trackId,
  effect,
  target,
  normalizedValue,
  children,
}: AutomationControlShellProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const parameter = {
    type: 'effect',
    effectId: effect.id,
    effectType: target.effectType,
    param: target.param,
  } as AutomationParameter;
  const ensureAutomationLane = useProjectStore((s) => s.ensureAutomationLane);
  const clearAutomationLane = useProjectStore((s) => s.clearAutomationLane);
  const hasLane = useProjectStore((s) =>
    (s.project?.automationLanes ?? []).some(
      (lane) =>
        lane.trackId === trackId &&
        automationParamEquals(lane.parameter, parameter),
    ),
  );
  const label = getEffectAutomationLabel(target.effectType, target.param);

  return (
    <>
      <div
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        title={`${label} (right-click for automation lane)`}
      >
        {children}
      </div>
      {menu && (
        <ContextMenuWrapper x={menu.x} y={menu.y} onClose={() => setMenu(null)} minWidth={170}>
          <ContextMenuItem
            label="Show Automation Lane"
            onClick={() => {
              ensureAutomationLane(trackId, parameter, normalizedValue);
              setMenu(null);
            }}
          />
          {hasLane && (
            <ContextMenuItem
              label="Hide Automation Lane"
              onClick={() => {
                clearAutomationLane(trackId, parameter);
                setMenu(null);
              }}
              color="#a1a1aa"
            />
          )}
        </ContextMenuWrapper>
      )}
    </>
  );
}

// ─── Per-Effect Cards ────────────────────────────────────────────────────────

export function EQ3Card({ effect, trackId }: { effect: TrackEffect & { type: 'eq3' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<EQ3Params>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'eq3');
  };

  return (
    <EffectCardLayout
      color={EFFECT_COLORS.eq3}
      visualization={<EQCurve low={p.low} mid={p.mid} high={p.high} />}
      footer={
        <div className="flex gap-2">
          <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'eq3', param: 'lowFrequency' }} normalizedValue={normalizeEffectParamValue('eq3', 'lowFrequency', p.lowFrequency) ?? 0.5}>
            <HSlider value={p.lowFrequency} onChange={(v) => update({ lowFrequency: v })} min={100} max={1000} label="Low Freq" displayValue={`${Math.round(p.lowFrequency)} Hz`} color={EFFECT_COLORS.eq3} width={70} />
          </AutomationControlShell>
          <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'eq3', param: 'highFrequency' }} normalizedValue={normalizeEffectParamValue('eq3', 'highFrequency', p.highFrequency) ?? 0.5}>
            <HSlider value={p.highFrequency} onChange={(v) => update({ highFrequency: v })} min={1000} max={8000} label="High Freq" displayValue={`${Math.round(p.highFrequency)} Hz`} color={EFFECT_COLORS.eq3} width={70} />
          </AutomationControlShell>
        </div>
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'eq3', param: 'low' }} normalizedValue={normalizeEffectParamValue('eq3', 'low', p.low) ?? 0.5}>
        <Knob value={p.low} onChange={(v) => update({ low: v })} min={-12} max={12} defaultValue={0} label="Low" unit="dB" size={56} step={0.5} color={EFFECT_COLORS.eq3} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'eq3', param: 'mid' }} normalizedValue={normalizeEffectParamValue('eq3', 'mid', p.mid) ?? 0.5}>
        <Knob value={p.mid} onChange={(v) => update({ mid: v })} min={-12} max={12} defaultValue={0} label="Mid" unit="dB" size={56} step={0.5} color={EFFECT_COLORS.eq3} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'eq3', param: 'high' }} normalizedValue={normalizeEffectParamValue('eq3', 'high', p.high) ?? 0.5}>
        <Knob value={p.high} onChange={(v) => update({ high: v })} min={-12} max={12} defaultValue={0} label="High" unit="dB" size={56} step={0.5} color={EFFECT_COLORS.eq3} />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}

export function EQCurve({ low, mid, high }: { low: number; mid: number; high: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = 150; const h = 40;
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.8)';
    ctx.lineWidth = 2;
    const centerY = h / 2;
    const scale = h / 30;

    for (let x = 0; x <= w; x++) {
      const t = x / w;
      let gain = 0;
      if (t < 0.33) { gain = low * (1 - t * 3) + mid * (t * 3); }
      else if (t < 0.66) { gain = mid; }
      else { const lt = (t - 0.66) / 0.34; gain = mid * (1 - lt) + high * lt; }
      const y = centerY - gain * scale;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.lineTo(w, centerY); ctx.lineTo(0, centerY); ctx.closePath();
    ctx.fillStyle = 'rgba(168, 85, 247, 0.1)'; ctx.fill();
  }, [low, mid, high]);

  return <canvas ref={canvasRef} className="rounded" style={{ width: 150, height: 40 }} />;
}

const PARAMETRIC_EQ_CANVAS_WIDTH = 220;
const PARAMETRIC_EQ_CANVAS_HEIGHT = 108;
const PARAMETRIC_EQ_BAND_TYPES: ParametricEQBandType[] = [
  'peaking',
  'lowshelf',
  'highshelf',
  'notch',
  'highpass',
  'lowpass',
];

function gainToCanvasY(gain: number, height: number): number {
  const norm = (clampParametricEqGain(gain) - PARAMETRIC_EQ_MIN_GAIN) / (PARAMETRIC_EQ_MAX_GAIN - PARAMETRIC_EQ_MIN_GAIN);
  return height - norm * height;
}

function canvasYToGain(y: number, height: number): number {
  const norm = 1 - Math.max(0, Math.min(1, y / height));
  return clampParametricEqGain(PARAMETRIC_EQ_MIN_GAIN + norm * (PARAMETRIC_EQ_MAX_GAIN - PARAMETRIC_EQ_MIN_GAIN));
}

function getSimpleBandsFromParametricBands(bands: ParametricEQBand[]) {
  return {
    low: bands[0]?.gain ?? 0,
    mid: bands[1]?.gain ?? 0,
    high: bands[2]?.gain ?? 0,
    lowFrequency: bands[0]?.frequency ?? 250,
    highFrequency: bands[2]?.frequency ?? 4000,
  };
}

export function ParametricEQCard({
  effect,
  trackId,
}: {
  effect: TrackEffect & { type: 'parametricEq' };
  trackId: string;
}) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bands = effect.params.bands;
  const [selectedBandId, setSelectedBandId] = useState<string>(bands[0]?.id ?? '');
  const [spectrum, setSpectrum] = useState<Float32Array<ArrayBuffer> | null>(null);

  useEffect(() => {
    if (!bands.some((band) => band.id === selectedBandId)) {
      setSelectedBandId(bands[0]?.id ?? '');
    }
  }, [bands, selectedBandId]);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const nextSpectrum = getAudioEngine().getTrackSpectrum(trackId);
      setSpectrum(nextSpectrum);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [trackId]);

  const commitParams = useCallback((nextParams: ParametricEQParams) => {
    updateTrackEffect(trackId, effect.id, { params: nextParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, nextParams, 'parametricEq');
  }, [effect.id, trackId, updateTrackEffect]);

  const updateBand = useCallback((bandId: string, updates: Partial<ParametricEQBand>) => {
    const nextParams: ParametricEQParams = {
      ...effect.params,
      bands: effect.params.bands.map((band) => (
        band.id === bandId
          ? {
              ...band,
              ...updates,
              frequency: clampParametricEqFrequency(updates.frequency ?? band.frequency),
              gain: clampParametricEqGain(updates.gain ?? band.gain),
              q: clampParametricEqQ(updates.q ?? band.q),
            }
          : band
      )),
    };
    commitParams(nextParams);
  }, [commitParams, effect.params]);

  const switchMode = useCallback((mode: ParametricEQParams['mode']) => {
    commitParams({
      mode,
      bands: mode === 'simple'
        ? createSimpleParametricEqBands()
        : createDefaultParametricEqBands(),
    });
  }, [commitParams]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = PARAMETRIC_EQ_CANVAS_WIDTH;
    const height = PARAMETRIC_EQ_CANVAS_HEIGHT;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(8, 12, 24, 0.95)';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    const gridFrequencies = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    for (const frequency of gridFrequencies) {
      const x = frequencyToRatio(frequency) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (const gain of [-18, -9, 0, 9, 18]) {
      const y = gainToCanvasY(gain, height);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.strokeStyle = gain === 0 ? 'rgba(120, 180, 255, 0.24)' : 'rgba(255,255,255,0.08)';
      ctx.stroke();
    }

    if (spectrum && spectrum.length > 0) {
      const binCount = spectrum.length;

      // Filled spectrum area with gradient
      ctx.beginPath();
      let started = false;
      let firstX = 0;
      for (let i = 1; i < binCount; i++) {
        const freq = spectrumBinToFrequency(i, binCount);
        if (freq < PARAMETRIC_EQ_MIN_FREQUENCY || freq > PARAMETRIC_EQ_MAX_FREQUENCY) continue;
        const x = frequencyToRatio(freq) * width;
        const normalized = Math.max(0, Math.min(1, (spectrum[i] + 120) / 90));
        const y = height - normalized * height;
        if (!started) { ctx.moveTo(x, height); ctx.lineTo(x, y); firstX = x; started = true; }
        else ctx.lineTo(x, y);
      }
      if (started) {
        ctx.lineTo(width, height);
        ctx.lineTo(firstX, height);
        ctx.closePath();
        ctx.fillStyle = 'rgba(34,197,94,0.08)';
        ctx.fill();
      }

      // Spectrum line overlay (logarithmic frequency mapping)
      ctx.beginPath();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(34,197,94,0.35)';
      started = false;
      for (let i = 1; i < binCount; i++) {
        const freq = spectrumBinToFrequency(i, binCount);
        if (freq < PARAMETRIC_EQ_MIN_FREQUENCY || freq > PARAMETRIC_EQ_MAX_FREQUENCY) continue;
        const x = frequencyToRatio(freq) * width;
        const normalized = Math.max(0, Math.min(1, (spectrum[i] + 120) / 90));
        const y = height - normalized * height;
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(96,165,250,0.95)';
    for (let x = 0; x <= width; x++) {
      const frequency = ratioToFrequency(x / width);
      const response = getEqResponseAtFrequency(bands, frequency);
      const y = gainToCanvasY(response, height);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    bands.forEach((band, index) => {
      const x = frequencyToRatio(band.frequency) * width;
      const y = gainToCanvasY(band.gain, height);
      ctx.beginPath();
      ctx.arc(x, y, selectedBandId === band.id ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = band.enabled ? '#f8fafc' : 'rgba(248,250,252,0.25)';
      ctx.fill();
      ctx.lineWidth = selectedBandId === band.id ? 2.5 : 1.5;
      ctx.strokeStyle = band.enabled ? '#60a5fa' : 'rgba(96,165,250,0.35)';
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '9px monospace';
      ctx.fillText(String(index + 1), x - 3, y - 10);
    });
  }, [bands, selectedBandId, spectrum]);

  const handleCanvasMouseDown = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const width = rect.width;
    const height = rect.height;

    let activeBand = effect.params.bands.reduce<ParametricEQBand | null>((closest, band) => {
      const x = frequencyToRatio(band.frequency) * width;
      const y = gainToCanvasY(band.gain, height);
      const distance = Math.hypot(pointerX - x, pointerY - y);
      if (!closest) return distance <= 18 ? band : null;
      const closestDistance = Math.hypot(
        pointerX - frequencyToRatio(closest.frequency) * width,
        pointerY - gainToCanvasY(closest.gain, height),
      );
      return distance < closestDistance ? band : closest;
    }, null);

    if (!activeBand) {
      activeBand = effect.params.bands[0] ?? null;
    }
    if (!activeBand) return;
    setSelectedBandId(activeBand.id);

    const updateFromPointer = (clientX: number, clientY: number) => {
      const nextX = clientX - rect.left;
      const nextY = clientY - rect.top;
      updateBand(activeBand.id, {
        enabled: true,
        frequency: ratioToFrequency(nextX / width),
        gain: canvasYToGain(nextY, height),
      });
    };

    updateFromPointer(event.clientX, event.clientY);
    const onMove = (moveEvent: MouseEvent) => updateFromPointer(moveEvent.clientX, moveEvent.clientY);
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [effect.params.bands, updateBand]);

  const selectedBand = bands.find((band) => band.id === selectedBandId) ?? bands[0];
  const simpleBands = getSimpleBandsFromParametricBands(bands);

  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          <button
            className={`px-2 py-0.5 rounded text-[8px] uppercase ${effect.params.mode === 'simple' ? 'bg-blue-500/30 text-blue-200' : 'text-white/40 hover:bg-white/5'}`}
            onClick={() => switchMode('simple')}
            aria-label="Parametric EQ simple mode"
          >
            Simple
          </button>
          <button
            className={`px-2 py-0.5 rounded text-[8px] uppercase ${effect.params.mode === 'parametric' ? 'bg-blue-500/30 text-blue-200' : 'text-white/40 hover:bg-white/5'}`}
            onClick={() => switchMode('parametric')}
            aria-label="Parametric EQ parametric mode"
          >
            Parametric
          </button>
        </div>
        <span className="text-[8px] text-white/35">Spectrum + response</span>
      </div>

      <canvas
        ref={canvasRef}
        className="rounded-md border border-white/10 cursor-crosshair"
        onMouseDown={handleCanvasMouseDown}
        aria-label="Parametric EQ frequency display"
      />

      {effect.params.mode === 'simple' ? (
        <>
          <div className="flex gap-3 justify-center">
            <Knob value={simpleBands.low} onChange={(v) => commitParams({ mode: 'simple', bands: createSimpleParametricEqBands(v, simpleBands.mid, simpleBands.high, simpleBands.lowFrequency, simpleBands.highFrequency) })} min={-12} max={12} defaultValue={0} label="Low" unit="dB" size={56} step={0.5} />
            <Knob value={simpleBands.mid} onChange={(v) => commitParams({ mode: 'simple', bands: createSimpleParametricEqBands(simpleBands.low, v, simpleBands.high, simpleBands.lowFrequency, simpleBands.highFrequency) })} min={-12} max={12} defaultValue={0} label="Mid" unit="dB" size={56} step={0.5} />
            <Knob value={simpleBands.high} onChange={(v) => commitParams({ mode: 'simple', bands: createSimpleParametricEqBands(simpleBands.low, simpleBands.mid, v, simpleBands.lowFrequency, simpleBands.highFrequency) })} min={-12} max={12} defaultValue={0} label="High" unit="dB" size={56} step={0.5} />
          </div>
          <div className="flex gap-2">
            <HSlider value={simpleBands.lowFrequency} onChange={(v) => commitParams({ mode: 'simple', bands: createSimpleParametricEqBands(simpleBands.low, simpleBands.mid, simpleBands.high, v, simpleBands.highFrequency) })} min={100} max={1000} label="Low Freq" displayValue={`${Math.round(simpleBands.lowFrequency)} Hz`} color="#22c55e" width={100} />
            <HSlider value={simpleBands.highFrequency} onChange={(v) => commitParams({ mode: 'simple', bands: createSimpleParametricEqBands(simpleBands.low, simpleBands.mid, simpleBands.high, simpleBands.lowFrequency, v) })} min={1000} max={8000} label="High Freq" displayValue={`${Math.round(simpleBands.highFrequency)} Hz`} color="#ef4444" width={100} />
          </div>
        </>
      ) : selectedBand ? (
        <>
          <div className="grid grid-cols-4 gap-1">
            {bands.map((band, index) => (
              <button
                key={band.id}
                className={`px-1.5 py-1 rounded text-[8px] ${selectedBand.id === band.id ? 'bg-blue-500/25 text-blue-100 border border-blue-400/30' : 'bg-white/5 text-white/50 border border-transparent hover:bg-white/8'}`}
                onClick={() => setSelectedBandId(band.id)}
                aria-label={`Select EQ band ${index + 1}`}
              >
                B{index + 1} {band.enabled ? '' : 'Off'}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              className={`px-2 py-0.5 rounded text-[8px] ${selectedBand.enabled ? 'bg-green-500/25 text-green-200' : 'text-white/40 hover:bg-white/5'}`}
              onClick={() => updateBand(selectedBand.id, { enabled: !selectedBand.enabled })}
              aria-label="Toggle selected EQ band"
            >
              {selectedBand.enabled ? 'Band On' : 'Band Off'}
            </button>
            <select
              className="bg-white/5 border border-white/10 rounded px-1.5 py-1 text-[10px] text-white/70"
              value={selectedBand.type}
              onChange={(e) => updateBand(selectedBand.id, { type: e.target.value as ParametricEQBandType })}
              aria-label="Selected EQ band type"
            >
              {PARAMETRIC_EQ_BAND_TYPES.map((type) => (
                <option key={type} value={type} className="bg-[#0e0e24]">
                  {getBandControlLabel(type)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 justify-center">
            <Knob value={selectedBand.frequency} onChange={(v) => updateBand(selectedBand.id, { frequency: v })} min={20} max={20000} defaultValue={1000} label="Freq" unit="Hz" size={56} step={10} />
            <Knob value={selectedBand.gain} onChange={(v) => updateBand(selectedBand.id, { gain: v })} min={-18} max={18} defaultValue={0} label="Gain" unit="dB" size={56} step={0.5} />
            <Knob value={selectedBand.q} onChange={(v) => updateBand(selectedBand.id, { q: v })} min={PARAMETRIC_EQ_MIN_Q} max={PARAMETRIC_EQ_MAX_Q} defaultValue={1} label="Q" size={56} step={0.1} />
          </div>
        </>
      ) : null}
    </div>
  );
}

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

export function ReverbCard({ effect, trackId }: { effect: TrackEffect & { type: 'reverb' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<ReverbParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'reverb');
  };

  return (
    <EffectCardLayout
      color={EFFECT_COLORS.reverb}
      footer={
        <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'reverb', param: 'wet' }} normalizedValue={normalizeEffectParamValue('reverb', 'wet', p.wet) ?? 0.5}>
          <HSlider value={p.wet} onChange={(v) => update({ wet: v })} label="Dry/Wet" displayValue={`${Math.round(p.wet * 100)}%`} color={EFFECT_COLORS.reverb} />
        </AutomationControlShell>
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'reverb', param: 'decay' }} normalizedValue={normalizeEffectParamValue('reverb', 'decay', p.decay) ?? 0.5}>
        <Knob value={p.decay} onChange={(v) => update({ decay: v })} min={0.1} max={10} defaultValue={2.4} label="Decay" size={56} step={0.1} color={EFFECT_COLORS.reverb} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'reverb', param: 'preDelay' }} normalizedValue={normalizeEffectParamValue('reverb', 'preDelay', p.preDelay) ?? 0.5}>
        <Knob value={p.preDelay} onChange={(v) => update({ preDelay: v })} min={0} max={0.1} defaultValue={0.02} label="Pre-Dly" size={56} step={0.001} color={EFFECT_COLORS.reverb} />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}

export function DelayCard({ effect, trackId }: { effect: TrackEffect & { type: 'delay' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<DelayParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'delay');
  };

  return (
    <EffectCardLayout
      color={EFFECT_COLORS.delay}
      visualization={
        <DelayTapTimeline
          time={p.time}
          feedback={p.feedback}
          width={160}
          height={100}
          color={EFFECT_COLORS.delay}
        />
      }
      footer={
        <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'delay', param: 'wet' }} normalizedValue={normalizeEffectParamValue('delay', 'wet', p.wet) ?? 0.5}>
          <HSlider value={p.wet} onChange={(v) => update({ wet: v })} label="Dry/Wet" displayValue={`${Math.round(p.wet * 100)}%`} color={EFFECT_COLORS.delay} />
        </AutomationControlShell>
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'delay', param: 'time' }} normalizedValue={normalizeEffectParamValue('delay', 'time', p.time) ?? 0.5}>
        <Knob value={p.time} onChange={(v) => update({ time: v })} min={0.01} max={1} defaultValue={0.25} label="Time" unit="s" size={56} step={0.01} color={EFFECT_COLORS.delay} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'delay', param: 'feedback' }} normalizedValue={normalizeEffectParamValue('delay', 'feedback', p.feedback) ?? 0.5}>
        <Knob value={p.feedback} onChange={(v) => update({ feedback: v })} min={0} max={0.95} defaultValue={0.3} label="Feedback" size={56} step={0.01} color={EFFECT_COLORS.delay} />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}

export function DistortionCard({ effect, trackId }: { effect: TrackEffect & { type: 'distortion' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<DistortionParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'distortion');
  };

  return (
    <EffectCardLayout
      color={EFFECT_COLORS.distortion}
      visualization={
        <DistortionCurve
          drive={p.amount}
          distortionType={p.distortionType}
          width={160}
          height={100}
          color={EFFECT_COLORS.distortion}
        />
      }
      mode={
        <>
          {(['soft', 'overdrive', 'fuzz'] as DistortionParams['distortionType'][]).map((dt) => (
            <button
              key={dt}
              className={`px-2 py-0.5 text-[10px] rounded capitalize ${
                p.distortionType === dt ? 'bg-white/[0.08] text-white/70' : 'text-white/30 hover:text-white/50 hover:bg-white/5'
              }`}
              onClick={() => update({ distortionType: dt })}
            >
              {dt}
            </button>
          ))}
        </>
      }
      footer={
        <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'distortion', param: 'wet' }} normalizedValue={normalizeEffectParamValue('distortion', 'wet', p.wet) ?? 0.5}>
          <HSlider value={p.wet} onChange={(v) => update({ wet: v })} label="Dry/Wet" displayValue={`${Math.round(p.wet * 100)}%`} color={EFFECT_COLORS.distortion} />
        </AutomationControlShell>
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'distortion', param: 'amount' }} normalizedValue={normalizeEffectParamValue('distortion', 'amount', p.amount) ?? 0.5}>
        <Knob value={p.amount} onChange={(v) => update({ amount: v })} min={0} max={1} defaultValue={0.2} label="Amount" size={56} step={0.01} color={EFFECT_COLORS.distortion} />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}

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
                p.filterType === ft ? 'bg-cyan-500/30 text-cyan-300' : 'text-white/30 hover:text-white/50 hover:bg-white/5'
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
            <div className="flex gap-3 justify-center">
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

export function ChorusCard({ effect, trackId }: { effect: TrackEffect & { type: 'chorus' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<ChorusParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'chorus');
  };

  return (
    <EffectCardLayout
      color={EFFECT_COLORS.chorus}
      visualization={
        <ModulationDisplay type="chorus" rate={p.frequency} depth={p.depth} color={EFFECT_COLORS.chorus} />
      }
      footer={
        <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'chorus', param: 'wet' }} normalizedValue={normalizeEffectParamValue('chorus', 'wet', p.wet) ?? 0.5}>
          <HSlider value={p.wet} onChange={(v) => update({ wet: v })} label="Dry/Wet" displayValue={`${Math.round(p.wet * 100)}%`} color={EFFECT_COLORS.chorus} />
        </AutomationControlShell>
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'chorus', param: 'frequency' }} normalizedValue={normalizeEffectParamValue('chorus', 'frequency', p.frequency) ?? 0.5}>
        <Knob value={p.frequency} onChange={(v) => update({ frequency: v })} min={0.1} max={10} defaultValue={1.5} label="Rate" unit="Hz" size={56} step={0.1} color={EFFECT_COLORS.chorus} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'chorus', param: 'depth' }} normalizedValue={normalizeEffectParamValue('chorus', 'depth', p.depth) ?? 0.5}>
        <Knob value={p.depth} onChange={(v) => update({ depth: v })} min={0} max={1} defaultValue={0.7} label="Depth" size={56} step={0.01} color={EFFECT_COLORS.chorus} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'chorus', param: 'delayTime' }} normalizedValue={normalizeEffectParamValue('chorus', 'delayTime', p.delayTime) ?? 0.5}>
        <Knob value={p.delayTime} onChange={(v) => update({ delayTime: v })} min={0.5} max={20} defaultValue={3.5} label="Delay" unit="ms" size={56} step={0.1} color={EFFECT_COLORS.chorus} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'chorus', param: 'feedback' }} normalizedValue={normalizeEffectParamValue('chorus', 'feedback', p.feedback) ?? 0.5}>
        <Knob value={p.feedback} onChange={(v) => update({ feedback: v })} min={0} max={0.95} defaultValue={0} label="Feedback" size={56} step={0.01} color={EFFECT_COLORS.chorus} />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}

export function FlangerCard({ effect, trackId }: { effect: TrackEffect & { type: 'flanger' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<FlangerParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'flanger');
  };

  return (
    <EffectCardLayout
      color={EFFECT_COLORS.flanger}
      visualization={
        <ModulationDisplay type="flanger" rate={p.frequency} depth={p.depth} centerDelay={p.delayTime} feedback={p.feedback} color={EFFECT_COLORS.flanger} />
      }
      footer={
        <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'flanger', param: 'wet' }} normalizedValue={normalizeEffectParamValue('flanger', 'wet', p.wet) ?? 0.5}>
          <HSlider value={p.wet} onChange={(v) => update({ wet: v })} label="Dry/Wet" displayValue={`${Math.round(p.wet * 100)}%`} color={EFFECT_COLORS.flanger} />
        </AutomationControlShell>
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'flanger', param: 'frequency' }} normalizedValue={normalizeEffectParamValue('flanger', 'frequency', p.frequency) ?? 0.5}>
        <Knob value={p.frequency} onChange={(v) => update({ frequency: v })} min={0.05} max={5} defaultValue={0.5} label="Rate" unit="Hz" size={56} step={0.01} color={EFFECT_COLORS.flanger} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'flanger', param: 'depth' }} normalizedValue={normalizeEffectParamValue('flanger', 'depth', p.depth) ?? 0.5}>
        <Knob value={p.depth} onChange={(v) => update({ depth: v })} min={0} max={1} defaultValue={0.7} label="Depth" size={56} step={0.01} color={EFFECT_COLORS.flanger} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'flanger', param: 'delayTime' }} normalizedValue={normalizeEffectParamValue('flanger', 'delayTime', p.delayTime) ?? 0.5}>
        <Knob value={p.delayTime} onChange={(v) => update({ delayTime: v })} min={0.5} max={10} defaultValue={3} label="Delay" unit="ms" size={56} step={0.1} color={EFFECT_COLORS.flanger} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'flanger', param: 'feedback' }} normalizedValue={normalizeEffectParamValue('flanger', 'feedback', p.feedback) ?? 0.5}>
        <Knob value={p.feedback} onChange={(v) => update({ feedback: v })} min={-0.95} max={0.95} defaultValue={0.5} label="Feedback" size={56} step={0.01} color={EFFECT_COLORS.flanger} />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}

export function PhaserCard({ effect, trackId }: { effect: TrackEffect & { type: 'phaser' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<PhaserParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'phaser');
  };

  return (
    <EffectCardLayout
      color={EFFECT_COLORS.phaser}
      visualization={
        <ModulationDisplay type="phaser" rate={p.frequency} depth={p.octaves / 6} baseFreq={p.baseFrequency} stages={p.stages ?? 4} color={EFFECT_COLORS.phaser} />
      }
      footer={
        <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'phaser', param: 'wet' }} normalizedValue={normalizeEffectParamValue('phaser', 'wet', p.wet) ?? 0.5}>
          <HSlider value={p.wet} onChange={(v) => update({ wet: v })} label="Dry/Wet" displayValue={`${Math.round(p.wet * 100)}%`} color={EFFECT_COLORS.phaser} />
        </AutomationControlShell>
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'phaser', param: 'frequency' }} normalizedValue={normalizeEffectParamValue('phaser', 'frequency', p.frequency) ?? 0.5}>
        <Knob value={p.frequency} onChange={(v) => update({ frequency: v })} min={0.1} max={8} defaultValue={0.5} label="Rate" unit="Hz" size={56} step={0.1} color={EFFECT_COLORS.phaser} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'phaser', param: 'octaves' }} normalizedValue={normalizeEffectParamValue('phaser', 'octaves', p.octaves) ?? 0.5}>
        <Knob value={p.octaves} onChange={(v) => update({ octaves: v })} min={1} max={6} defaultValue={3} label="Octaves" size={56} step={0.5} color={EFFECT_COLORS.phaser} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'phaser', param: 'Q' }} normalizedValue={normalizeEffectParamValue('phaser', 'Q', p.Q) ?? 0.5}>
        <Knob value={p.Q} onChange={(v) => update({ Q: v })} min={0.1} max={20} defaultValue={10} label="Q" size={56} step={0.1} color={EFFECT_COLORS.phaser} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'phaser', param: 'baseFrequency' }} normalizedValue={normalizeEffectParamValue('phaser', 'baseFrequency', p.baseFrequency) ?? 0.5}>
        <Knob value={p.baseFrequency} onChange={(v) => update({ baseFrequency: v })} min={100} max={4000} defaultValue={350} label="Base" unit="Hz" size={56} step={10} color={EFFECT_COLORS.phaser} />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}

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

// ─── Effect Device Card ──────────────────────────────────────────────────────

// ─── Gate Card ──────────────────────────────────────────────────────────────

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
      color="#b8903a"
      mode={
        <>
          {(['gate', 'expander'] as GateParams['mode'][]).map((m) => (
            <button
              key={m}
              className={`px-2 py-0.5 text-[10px] rounded capitalize ${
                p.mode === m ? 'bg-white/[0.08] text-white/70' : 'text-white/30 hover:text-white/50 hover:bg-white/5'
              }`}
              onClick={() => update({ mode: m })}
            >
              {m}
            </button>
          ))}
        </>
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'gate', param: 'threshold' }} normalizedValue={normalizeEffectParamValue('gate', 'threshold', p.threshold) ?? 0.5}>
        <Knob value={p.threshold} onChange={(v) => update({ threshold: v })} min={-80} max={0} defaultValue={-40} label="Thresh" unit=" dB" size={56} step={0.5} color="#b8903a" />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'gate', param: 'range' }} normalizedValue={normalizeEffectParamValue('gate', 'range', p.range) ?? 0.5}>
        <Knob value={p.range} onChange={(v) => update({ range: v })} min={-80} max={0} defaultValue={-80} label="Range" unit=" dB" size={56} step={1} color="#b8903a" />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'gate', param: 'attack' }} normalizedValue={normalizeEffectParamValue('gate', 'attack', p.attack) ?? 0.5}>
        <Knob value={p.attack * 1000} onChange={(v) => update({ attack: v / 1000 })} min={0.1} max={50} defaultValue={1} label="Attack" unit=" ms" size={56} step={0.1} color="#b8903a" />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'gate', param: 'hold' }} normalizedValue={normalizeEffectParamValue('gate', 'hold', p.hold) ?? 0.5}>
        <Knob value={p.hold * 1000} onChange={(v) => update({ hold: v / 1000 })} min={0} max={500} defaultValue={10} label="Hold" unit=" ms" size={56} step={1} color="#b8903a" />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'gate', param: 'release' }} normalizedValue={normalizeEffectParamValue('gate', 'release', p.release) ?? 0.5}>
        <Knob value={p.release * 1000} onChange={(v) => update({ release: v / 1000 })} min={5} max={4000} defaultValue={50} label="Release" unit=" ms" size={56} step={1} color="#b8903a" />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'gate', param: 'hysteresis' }} normalizedValue={normalizeEffectParamValue('gate', 'hysteresis', p.hysteresis) ?? 0.5}>
        <Knob value={p.hysteresis} onChange={(v) => update({ hysteresis: v })} min={0} max={12} defaultValue={4} label="Hyst" unit=" dB" size={56} step={0.5} color="#b8903a" />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}

// ─── De-esser Card ──────────────────────────────────────────────────────────

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
      color="#c4a654"
      mode={
        <>
          {(['wideband', 'split'] as DeEsserParams['mode'][]).map((m) => (
            <button
              key={m}
              className={`px-2 py-0.5 text-[10px] rounded capitalize ${
                p.mode === m ? 'bg-white/[0.08] text-white/70' : 'text-white/30 hover:text-white/50 hover:bg-white/5'
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
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'deesser', param: 'frequency' }} normalizedValue={normalizeEffectParamValue('deesser', 'frequency', p.frequency) ?? 0.5}>
        <Knob value={p.frequency} onChange={(v) => update({ frequency: v })} min={2000} max={16000} defaultValue={7000} label="Freq" unit=" Hz" size={56} step={100} color="#c4a654" />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'deesser', param: 'bandwidth' }} normalizedValue={normalizeEffectParamValue('deesser', 'bandwidth', p.bandwidth) ?? 0.5}>
        <Knob value={p.bandwidth} onChange={(v) => update({ bandwidth: v })} min={0.5} max={8} defaultValue={2} label="Width" size={56} step={0.1} color="#c4a654" />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'deesser', param: 'threshold' }} normalizedValue={normalizeEffectParamValue('deesser', 'threshold', p.threshold) ?? 0.5}>
        <Knob value={p.threshold} onChange={(v) => update({ threshold: v })} min={-60} max={0} defaultValue={-20} label="Thresh" unit=" dB" size={56} step={0.5} color="#c4a654" />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'deesser', param: 'range' }} normalizedValue={normalizeEffectParamValue('deesser', 'range', p.range) ?? 0.5}>
        <Knob value={p.range} onChange={(v) => update({ range: v })} min={0} max={20} defaultValue={10} label="Range" unit=" dB" size={56} step={0.5} color="#c4a654" />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}

// ─── Transient Shaper Card ──────────────────────────────────────────────────

export function TransientShaperCard({ effect, trackId }: { effect: TrackEffect & { type: 'transientShaper' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<TransientShaperParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'transientShaper');
  };

  return (
    <EffectCardLayout
      color="#b89340"
      footer={
        <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'transientShaper', param: 'mix' }} normalizedValue={normalizeEffectParamValue('transientShaper', 'mix', p.mix) ?? 1}>
          <HSlider value={p.mix} onChange={(v) => update({ mix: v })} label="Dry/Wet" displayValue={`${Math.round(p.mix * 100)}%`} color="#b89340" />
        </AutomationControlShell>
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'transientShaper', param: 'attack' }} normalizedValue={normalizeEffectParamValue('transientShaper', 'attack', p.attack) ?? 0.5}>
        <Knob value={p.attack} onChange={(v) => update({ attack: v })} min={-100} max={100} defaultValue={0} label="Attack" unit="%" size={56} step={1} color="#b89340" />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'transientShaper', param: 'sustain' }} normalizedValue={normalizeEffectParamValue('transientShaper', 'sustain', p.sustain) ?? 0.5}>
        <Knob value={p.sustain} onChange={(v) => update({ sustain: v })} min={-100} max={100} defaultValue={0} label="Sustain" unit="%" size={56} step={1} color="#b89340" />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'transientShaper', param: 'output' }} normalizedValue={normalizeEffectParamValue('transientShaper', 'output', p.output) ?? 0.5}>
        <Knob value={p.output} onChange={(v) => update({ output: v })} min={-12} max={12} defaultValue={0} label="Output" unit=" dB" size={56} step={0.5} color="#b89340" />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}

// ─── Limiter Card ───────────────────────────────────────────────────────────

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
      color="#d4a040"
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
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'limiter', param: 'gain' }} normalizedValue={normalizeEffectParamValue('limiter', 'gain', p.gain) ?? 0.5}>
        <Knob value={p.gain} onChange={(v) => update({ gain: v })} min={-12} max={24} defaultValue={0} label="Gain" unit=" dB" size={56} step={0.5} color="#d4a040" />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'limiter', param: 'ceiling' }} normalizedValue={normalizeEffectParamValue('limiter', 'ceiling', p.ceiling) ?? 0.5}>
        <Knob value={p.ceiling} onChange={(v) => update({ ceiling: v })} min={-12} max={0} defaultValue={-0.3} label="Ceiling" unit=" dB" size={56} step={0.1} color="#d4a040" />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'limiter', param: 'release' }} normalizedValue={normalizeEffectParamValue('limiter', 'release', p.release) ?? 0.5}>
        <Knob value={p.release * 1000} onChange={(v) => update({ release: v / 1000 })} min={1} max={1000} defaultValue={100} label="Release" unit=" ms" size={56} step={1} color="#d4a040" />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'limiter', param: 'lookahead' }} normalizedValue={normalizeEffectParamValue('limiter', 'lookahead', p.lookahead) ?? 0.5}>
        <Knob value={p.lookahead * 1000} onChange={(v) => update({ lookahead: v / 1000 })} min={0} max={20} defaultValue={5} label="L.Ahead" unit=" ms" size={56} step={0.5} color="#d4a040" />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}

// ─── Saturation Card ────────────────────────────────────────────────────────

const SATURATION_TYPE_LABELS: Record<SaturationType, string> = {
  tape: 'Tape',
  tube: 'Tube',
  transistor: 'Transistor',
  soft: 'Soft',
  hard: 'Hard',
};

export function SaturationCard({ effect, trackId }: { effect: TrackEffect & { type: 'saturation' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<SaturationParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'saturation');
  };

  return (
    <EffectCardLayout
      color="#c46454"
      mode={
        <>
          {(Object.keys(SATURATION_TYPE_LABELS) as SaturationType[]).map((st) => (
            <button
              key={st}
              className={`px-1.5 py-0.5 text-[10px] rounded capitalize ${
                p.saturationType === st ? 'bg-white/[0.08] text-white/70' : 'text-white/30 hover:text-white/50 hover:bg-white/5'
              }`}
              onClick={() => update({ saturationType: st })}
            >
              {SATURATION_TYPE_LABELS[st]}
            </button>
          ))}
        </>
      }
      footer={
        <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'saturation', param: 'mix' }} normalizedValue={normalizeEffectParamValue('saturation', 'mix', p.mix) ?? 0.5}>
          <HSlider value={p.mix} onChange={(v) => update({ mix: v })} label="Dry/Wet" displayValue={`${Math.round(p.mix * 100)}%`} color="#c46454" />
        </AutomationControlShell>
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'saturation', param: 'drive' }} normalizedValue={normalizeEffectParamValue('saturation', 'drive', p.drive) ?? 0.5}>
        <Knob value={p.drive} onChange={(v) => update({ drive: v })} min={0} max={1} defaultValue={0.3} label="Drive" size={56} step={0.01} color="#c46454" />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'saturation', param: 'harmonicMix' }} normalizedValue={normalizeEffectParamValue('saturation', 'harmonicMix', p.harmonicMix) ?? 0.5}>
        <Knob value={p.harmonicMix} onChange={(v) => update({ harmonicMix: v })} min={-1} max={1} defaultValue={0} label="Harmonics" size={56} step={0.01} color="#c46454" />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'saturation', param: 'inputGain' }} normalizedValue={normalizeEffectParamValue('saturation', 'inputGain', p.inputGain) ?? 0.5}>
        <Knob value={p.inputGain} onChange={(v) => update({ inputGain: v })} min={-12} max={12} defaultValue={0} label="Input" unit=" dB" size={56} step={0.5} color="#c46454" />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'saturation', param: 'outputGain' }} normalizedValue={normalizeEffectParamValue('saturation', 'outputGain', p.outputGain) ?? 0.5}>
        <Knob value={p.outputGain} onChange={(v) => update({ outputGain: v })} min={-12} max={12} defaultValue={0} label="Output" unit=" dB" size={56} step={0.5} color="#c46454" />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}

// ─── Stereo Imager Card ─────────────────────────────────────────────────────

export function StereoImagerCard({ effect, trackId }: { effect: TrackEffect & { type: 'stereoImager' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;

  const update = (updates: Partial<StereoImagerParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'stereoImager');
  };

  return (
    <EffectCardLayout color="#7a8ab4">
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'stereoImager', param: 'width' }} normalizedValue={normalizeEffectParamValue('stereoImager', 'width', p.width) ?? 0.5}>
        <Knob value={p.width} onChange={(v) => update({ width: v })} min={0} max={2} defaultValue={1} label="Width" size={56} step={0.01} color="#7a8ab4"
          formatValue={(v) => v === 0 ? 'Mono' : v === 1 ? '100%' : `${Math.round(v * 100)}%`}
        />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'stereoImager', param: 'midGain' }} normalizedValue={normalizeEffectParamValue('stereoImager', 'midGain', p.midGain) ?? 0.5}>
        <Knob value={p.midGain} onChange={(v) => update({ midGain: v })} min={-12} max={12} defaultValue={0} label="Mid" unit=" dB" size={56} step={0.5} color="#7a8ab4" />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'stereoImager', param: 'sideGain' }} normalizedValue={normalizeEffectParamValue('stereoImager', 'sideGain', p.sideGain) ?? 0.5}>
        <Knob value={p.sideGain} onChange={(v) => update({ sideGain: v })} min={-12} max={12} defaultValue={0} label="Side" unit=" dB" size={56} step={0.5} color="#7a8ab4" />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'stereoImager', param: 'monoFreq' }} normalizedValue={normalizeEffectParamValue('stereoImager', 'monoFreq', p.monoFreq) ?? 0}>
        <Knob value={p.monoFreq} onChange={(v) => update({ monoFreq: v })} min={0} max={500} defaultValue={0} label="Mono Bass" unit=" Hz" size={56} step={5} color="#7a8ab4"
          formatValue={(v) => v === 0 ? 'Off' : `${Math.round(v)} Hz`}
        />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}

// ─── Algorithmic Reverb Card ────────────────────────────────────────────────

const REVERB_TYPE_LABELS: Record<AlgorithmicReverbType, string> = {
  plate: 'Plate', hall: 'Hall', room: 'Room', chamber: 'Chamber', spring: 'Spring',
};

export function AlgorithmicReverbCard({ effect, trackId }: { effect: TrackEffect & { type: 'algorithmicReverb' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;
  const update = (updates: Partial<AlgorithmicReverbParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'algorithmicReverb');
  };

  return (
    <EffectCardLayout
      color="#7a6fb8"
      visualization={
        <ReverbDecayCurve
          decay={p.decay}
          preDelay={p.preDelay / 1000}
          damping={p.damping}
          erLevel={p.erLevel}
          reverbType={p.reverbType}
          width={160}
          height={100}
          color="#7a6fb8"
        />
      }
      mode={
        <>
          {(Object.keys(REVERB_TYPE_LABELS) as AlgorithmicReverbType[]).map((rt) => (
            <button key={rt} className={`px-1.5 py-0.5 text-[10px] rounded capitalize ${p.reverbType === rt ? 'bg-white/[0.08] text-white/70' : 'text-white/30 hover:text-white/50 hover:bg-white/5'}`}
              onClick={() => update({ reverbType: rt })}>{REVERB_TYPE_LABELS[rt]}</button>
          ))}
        </>
      }
      footer={
        <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'algorithmicReverb', param: 'mix' }} normalizedValue={normalizeEffectParamValue('algorithmicReverb', 'mix', p.mix) ?? 0.25}>
          <HSlider value={p.mix} onChange={(v) => update({ mix: v })} label="Dry/Wet" displayValue={`${Math.round(p.mix * 100)}%`} color="#7a6fb8" />
        </AutomationControlShell>
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'algorithmicReverb', param: 'decay' }} normalizedValue={normalizeEffectParamValue('algorithmicReverb', 'decay', p.decay) ?? 0.5}>
        <Knob value={p.decay} onChange={(v) => update({ decay: v })} min={0.1} max={20} defaultValue={2.5} label="Decay" unit="s" size={56} step={0.1} color="#7a6fb8" />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'algorithmicReverb', param: 'size' }} normalizedValue={normalizeEffectParamValue('algorithmicReverb', 'size', p.size) ?? 0.5}>
        <Knob value={p.size} onChange={(v) => update({ size: v })} min={0} max={1} defaultValue={0.6} label="Size" size={56} step={0.01} color="#7a6fb8" />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'algorithmicReverb', param: 'damping' }} normalizedValue={normalizeEffectParamValue('algorithmicReverb', 'damping', p.damping) ?? 0.5}>
        <Knob value={p.damping} onChange={(v) => update({ damping: v })} min={0} max={1} defaultValue={0.4} label="Damping" size={56} step={0.01} color="#7a6fb8" />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'algorithmicReverb', param: 'preDelay' }} normalizedValue={normalizeEffectParamValue('algorithmicReverb', 'preDelay', p.preDelay) ?? 0.5}>
        <Knob value={p.preDelay} onChange={(v) => update({ preDelay: v })} min={0} max={200} defaultValue={20} label="Pre-Dly" unit="ms" size={56} step={1} color="#7a6fb8" />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}

// ─── Noise Reduction Card ───────────────────────────────────────────────────

export function NoiseReductionCard({ effect, trackId }: { effect: TrackEffect & { type: 'noiseReduction' }; trackId: string }) {
  const updateTrackEffect = useProjectStore((s) => s.updateTrackEffect);
  const p = effect.params;
  const update = (updates: Partial<NoiseGateReductionParams>) => {
    const newParams = { ...p, ...updates };
    updateTrackEffect(trackId, effect.id, { params: newParams } as Partial<TrackEffect>);
    effectsEngine.updateEffectParams(trackId, effect.id, newParams, 'noiseReduction');
  };

  return (
    <EffectCardLayout
      color="#8a8a8a"
      mode={
        <>
          {(['fast', 'smooth'] as NoiseGateReductionParams['mode'][]).map((m) => (
            <button key={m} className={`px-2 py-0.5 text-[10px] rounded capitalize ${p.mode === m ? 'bg-white/[0.08] text-white/70' : 'text-white/30 hover:text-white/50 hover:bg-white/5'}`}
              onClick={() => update({ mode: m })}>{m}</button>
          ))}
        </>
      }
      footer={
        <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'noiseReduction', param: 'mix' }} normalizedValue={normalizeEffectParamValue('noiseReduction', 'mix', p.mix) ?? 1}>
          <HSlider value={p.mix} onChange={(v) => update({ mix: v })} label="Dry/Wet" displayValue={`${Math.round(p.mix * 100)}%`} color="#8a8a8a" />
        </AutomationControlShell>
      }
    >
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'noiseReduction', param: 'amount' }} normalizedValue={normalizeEffectParamValue('noiseReduction', 'amount', p.amount) ?? 0.5}>
        <Knob value={p.amount} onChange={(v) => update({ amount: v })} min={0} max={1} defaultValue={0.5} label="Amount" size={56} step={0.01} color="#8a8a8a" formatValue={(v) => `${Math.round(v * 100)}%`} />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'noiseReduction', param: 'threshold' }} normalizedValue={normalizeEffectParamValue('noiseReduction', 'threshold', p.threshold) ?? 0.5}>
        <Knob value={p.threshold} onChange={(v) => update({ threshold: v })} min={-80} max={-20} defaultValue={-50} label="Threshold" unit=" dB" size={56} step={1} color="#8a8a8a" />
      </AutomationControlShell>
      <AutomationControlShell trackId={trackId} effect={effect} target={{ effectType: 'noiseReduction', param: 'hfEmphasis' }} normalizedValue={normalizeEffectParamValue('noiseReduction', 'hfEmphasis', p.hfEmphasis) ?? 0.5}>
        <Knob value={p.hfEmphasis} onChange={(v) => update({ hfEmphasis: v })} min={0} max={1} defaultValue={0.5} label="HF Focus" size={56} step={0.01} color="#8a8a8a" />
      </AutomationControlShell>
    </EffectCardLayout>
  );
}

/**
 * Effect colors — desaturated, category-grouped.
 * CSS custom properties are defined in src/styles/effect-colors.css.
 * These fallback hex values match the CSS vars for use in non-CSS contexts (canvas, SVG).
 */
export const EFFECT_COLORS: Record<TrackEffectType, string> = {
  eq3: '#5b8ac4',
  parametricEq: '#6b9fd4',
  compressor: '#c4993b',
  reverb: '#8b6fc0',
  delay: '#9478c4',
  distortion: '#c46454',
  filter: '#4a9da8',
  chorus: '#5aa8b4',
  flanger: '#4dab94',
  phaser: '#c48a54',
  convolver: '#a07cc8',
  gate: '#b8903a',
  deesser: '#c4a654',
  transientShaper: '#b89340',
  limiter: '#d4a040',
  saturation: '#c46454',
  stereoImager: '#7a8ab4',
  algorithmicReverb: '#7a6fb8',
  noiseReduction: '#8a8a8a',
};

/** Resolve a CSS custom property to its computed hex value (for canvas drawing contexts). */
export function resolveEffectColor(effectType: TrackEffectType): string {
  if (typeof document === 'undefined') return EFFECT_COLORS[effectType];
  const cssVarMap: Record<TrackEffectType, string> = {
    eq3: '--fx-eq3',
    parametricEq: '--fx-parametric-eq',
    compressor: '--fx-compressor',
    reverb: '--fx-reverb',
    delay: '--fx-delay',
    distortion: '--fx-distortion',
    filter: '--fx-filter',
    chorus: '--fx-chorus',
    flanger: '--fx-flanger',
    phaser: '--fx-phaser',
    convolver: '--fx-convolver',
    gate: '--fx-gate',
    deesser: '--fx-deesser',
    transientShaper: '--fx-transient-shaper',
    limiter: '--fx-limiter',
    saturation: '--fx-distortion',
    stereoImager: '--fx-filter',
    algorithmicReverb: '--fx-reverb',
    noiseReduction: '--fx-filter',
  };
  const resolved = getComputedStyle(document.documentElement).getPropertyValue(cssVarMap[effectType]).trim();
  return resolved || EFFECT_COLORS[effectType];
}
