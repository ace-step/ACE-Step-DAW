/**
 * ParametricEQCard — Multi-band parametric EQ with interactive canvas.
 * Extracted from EffectCards.tsx.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Knob } from '../../ui/Knob';
import { HSlider } from '../../ui/HSlider';
import { useProjectStore } from '../../../store/projectStore';
import { effectsEngine } from '../../../engine/EffectsEngine';
import { getAudioEngine } from '../../../hooks/useAudioEngine';
import type {
  TrackEffect,
  ParametricEQParams,
  ParametricEQBand,
  ParametricEQBandType,
} from '../../../types/project';
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
} from '../../../utils/parametricEq';

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
