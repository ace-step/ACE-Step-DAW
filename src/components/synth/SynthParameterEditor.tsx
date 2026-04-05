import { useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import type { SynthEnvelope, SynthFilter, SynthLfo, FilterEnvelope, UnisonSettings } from '../../types/project';
import { OscillatorSelector } from './OscillatorSelector';
import { ADSREnvelopeEditor } from './ADSREnvelopeEditor';
import { SynthFilterControls } from './SynthFilterControls';
import { FilterEnvelopeEditor, DEFAULT_FILTER_ENVELOPE } from './FilterEnvelopeEditor';
import { LFODisplay } from './LFODisplay';
import { UnisonControls } from './UnisonControls';

const DEFAULT_ENVELOPE: SynthEnvelope = { attack: 0.005, decay: 0.1, sustain: 0.7, release: 0.3 };
const DEFAULT_FILTER: SynthFilter = { type: 'lowpass', frequency: 1000, Q: 1 };
const DEFAULT_LFO: SynthLfo = { rate: 1, depth: 0.5, shape: 'sine' };
const DEFAULT_UNISON: UnisonSettings = { voices: 1, detune: 0, spread: 0 };

/** Map legacy synthPreset names to their default oscillator waveforms. */
export const PRESET_DEFAULT_OSCILLATOR: Record<string, 'sine' | 'triangle' | 'sawtooth' | 'square'> = {
  piano: 'triangle',
  strings: 'sawtooth',
  pad: 'sine',
  lead: 'square',
  bass: 'sawtooth',
  organ: 'sine',
};

interface SynthParameterEditorProps {
  trackId: string;
}

export function SynthParameterEditor({ trackId }: SynthParameterEditorProps) {
  const track = useProjectStore((s) => s.project?.tracks.find((t) => t.id === trackId));
  const updateSynthOscillatorType = useProjectStore((s) => s.updateSynthOscillatorType);
  const updateSynthEnvelope = useProjectStore((s) => s.updateSynthEnvelope);
  const updateSynthFilter = useProjectStore((s) => s.updateSynthFilter);
  const updateSynthLfo = useProjectStore((s) => s.updateSynthLfo);
  const updateFilterEnvelope = useProjectStore((s) => s.updateFilterEnvelope);
  const updateUnisonSettings = useProjectStore((s) => s.updateUnisonSettings);

  // Parameter changes are persisted to the store and synced to the modern
  // instrument model (track.instrument.settings). The active playback engine
  // (subtractiveEngine) reads from the instrument model when ensuring synths,
  // so changes take effect on the next note trigger or playback start.

  const onOscillatorChange = useCallback(
    (waveform: 'sine' | 'triangle' | 'sawtooth' | 'square') => updateSynthOscillatorType(trackId, waveform),
    [trackId, updateSynthOscillatorType],
  );
  const onEnvelopeChange = useCallback(
    (updates: Partial<SynthEnvelope>) => updateSynthEnvelope(trackId, updates),
    [trackId, updateSynthEnvelope],
  );
  const onFilterChange = useCallback(
    (updates: Partial<SynthFilter>) => updateSynthFilter(trackId, updates),
    [trackId, updateSynthFilter],
  );
  const onLfoChange = useCallback(
    (updates: Partial<SynthLfo>) => updateSynthLfo(trackId, updates),
    [trackId, updateSynthLfo],
  );
  const onFilterEnvelopeChange = useCallback(
    (updates: Partial<FilterEnvelope>) => updateFilterEnvelope(trackId, updates),
    [trackId, updateFilterEnvelope],
  );
  const onUnisonChange = useCallback(
    (updates: Partial<UnisonSettings>) => updateUnisonSettings(trackId, updates),
    [trackId, updateUnisonSettings],
  );

  if (!track) return null;

  const oscillatorType = track.synthOscillatorType
    ?? PRESET_DEFAULT_OSCILLATOR[track.synthPreset ?? 'piano']
    ?? 'triangle';
  const envelope = track.synthEnvelope ?? DEFAULT_ENVELOPE;
  const filter = track.synthFilter ?? DEFAULT_FILTER;
  const lfo = track.synthLfo ?? DEFAULT_LFO;
  const filterEnvelope = track.filterEnvelope ?? DEFAULT_FILTER_ENVELOPE;
  const unison = track.unisonSettings ?? DEFAULT_UNISON;

  return (
    <div
      className="flex gap-4 px-3 py-2 bg-[#1e1e22] border-b border-[#2a2a2a] overflow-x-auto"
      data-testid="synth-parameter-editor"
      data-track-id={trackId}
    >
      <OscillatorSelector waveform={oscillatorType} onChange={onOscillatorChange} />
      <div className="w-px bg-[#333] self-stretch shrink-0" />
      <ADSREnvelopeEditor envelope={envelope} onChange={onEnvelopeChange} />
      <div className="w-px bg-[#333] self-stretch shrink-0" />
      <SynthFilterControls filter={filter} onChange={onFilterChange} />
      <div className="w-px bg-[#333] self-stretch shrink-0" />
      <FilterEnvelopeEditor envelope={filterEnvelope} onChange={onFilterEnvelopeChange} />
      <div className="w-px bg-[#333] self-stretch shrink-0" />
      <LFODisplay lfo={lfo} onChange={onLfoChange} />
      <div className="w-px bg-[#333] self-stretch shrink-0" />
      <UnisonControls settings={unison} onChange={onUnisonChange} />
    </div>
  );
}
