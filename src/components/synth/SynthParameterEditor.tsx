import { useCallback, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import type { SynthEnvelope, SynthFilter, SynthLfo, FilterEnvelope, UnisonSettings, SubtractiveInstrumentSettings } from '../../types/project';
import type { SoundDesignSuggestion } from '../../services/soundDesignAssistant';
import { OscillatorSelector } from './OscillatorSelector';
import { ADSREnvelopeEditor } from './ADSREnvelopeEditor';
import { SynthFilterControls } from './SynthFilterControls';
import { FilterEnvelopeEditor, DEFAULT_FILTER_ENVELOPE } from './FilterEnvelopeEditor';
import { LFODisplay } from './LFODisplay';
import { UnisonControls } from './UnisonControls';
import { SoundDesignPanel } from './SoundDesignPanel';

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

  const [showAiPanel, setShowAiPanel] = useState(false);

  const handleAiApply = useCallback(
    (changes: SoundDesignSuggestion['changes']) => {
      if (changes.oscillator?.waveform) {
        updateSynthOscillatorType(trackId, changes.oscillator.waveform);
      }
      if (changes.ampEnvelope) {
        updateSynthEnvelope(trackId, changes.ampEnvelope);
      }
      if (changes.filter) {
        const filterUpdates: Partial<SynthFilter> = {};
        if (changes.filter.cutoffHz !== undefined) filterUpdates.frequency = changes.filter.cutoffHz;
        if (changes.filter.resonance !== undefined) filterUpdates.Q = changes.filter.resonance;
        if (changes.filter.type !== undefined) filterUpdates.type = changes.filter.type;
        updateSynthFilter(trackId, filterUpdates);
      }
      if (changes.lfo) {
        const lfoUpdates: Partial<SynthLfo> = {};
        if (changes.lfo.rateHz !== undefined) lfoUpdates.rate = changes.lfo.rateHz;
        if (changes.lfo.waveform !== undefined) lfoUpdates.shape = changes.lfo.waveform;
        if (changes.lfo.depth !== undefined) lfoUpdates.depth = changes.lfo.depth;
        updateSynthLfo(trackId, lfoUpdates);
      }
      if (changes.filterEnvelope) {
        updateFilterEnvelope(trackId, changes.filterEnvelope);
      }
      if (changes.unison) {
        const unisonUpdate: Partial<UnisonSettings> = {};
        if (changes.unison.voices !== undefined) unisonUpdate.voices = changes.unison.voices;
        if (changes.unison.detuneCents !== undefined) unisonUpdate.detune = changes.unison.detuneCents;
        if (changes.unison.stereoSpread !== undefined) unisonUpdate.spread = changes.unison.stereoSpread;
        updateUnisonSettings(trackId, unisonUpdate);
      }
    },
    [trackId, updateSynthOscillatorType, updateSynthEnvelope, updateSynthFilter, updateSynthLfo, updateFilterEnvelope, updateUnisonSettings],
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

  // Build the current SubtractiveInstrumentSettings for the AI panel
  const currentSettings: SubtractiveInstrumentSettings = track.instrument?.kind === 'subtractive'
    ? track.instrument.settings
    : {
        oscillator: { waveform: oscillatorType, octave: 0, detuneCents: 0, level: 1 },
        ampEnvelope: { attack: envelope.attack, decay: envelope.decay, sustain: envelope.sustain, release: envelope.release },
        filter: { enabled: filter.type !== undefined, type: filter.type, cutoffHz: filter.frequency, resonance: filter.Q, drive: 0, keyTracking: 0 },
        filterEnvelope: { attack: filterEnvelope.attack, decay: filterEnvelope.decay, sustain: filterEnvelope.sustain, release: filterEnvelope.release, amount: filterEnvelope.octaves ?? 0 },
        lfo: { enabled: lfo.rate > 0 && lfo.depth > 0, waveform: lfo.shape as SubtractiveInstrumentSettings['lfo']['waveform'], target: 'off', rateHz: lfo.rate, depth: lfo.depth, retrigger: false },
        unison: { voices: unison.voices, detuneCents: unison.detune, stereoSpread: unison.spread, blend: 0.5 },
        glideTime: 0,
        outputGain: 0.55,
      };

  return (
    <div data-testid="synth-parameter-editor" data-track-id={trackId}>
      <div className="flex gap-4 px-3 py-2 bg-[#1e1e22] border-b border-[#2a2a2a] overflow-x-auto">
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
        <div className="w-px bg-[#333] self-stretch shrink-0" />
        <button
          type="button"
          onClick={() => setShowAiPanel(!showAiPanel)}
          className={`text-[9px] px-2 py-1 rounded border transition-colors shrink-0 ${
            showAiPanel
              ? 'bg-teal-900/50 border-teal-700/50 text-teal-300'
              : 'border-[#333] text-zinc-500 hover:text-zinc-300 hover:border-[#444]'
          }`}
          title="AI Sound Design Assistant"
        >
          AI Design
        </button>
      </div>
      {showAiPanel && (
        <div className="px-3 py-2 bg-[#1a1a1e] border-b border-[#2a2a2a]">
          <SoundDesignPanel
            currentSettings={currentSettings}
            instrumentKind="subtractive"
            onApply={handleAiApply}
          />
        </div>
      )}
    </div>
  );
}
