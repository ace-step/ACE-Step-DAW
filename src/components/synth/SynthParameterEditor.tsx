import { useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import type { SynthEnvelope, SynthFilter, SynthLfo, FilterEnvelope } from '../../types/project';
import { ADSREnvelopeEditor } from './ADSREnvelopeEditor';
import { SynthFilterControls } from './SynthFilterControls';
import { FilterEnvelopeEditor, DEFAULT_FILTER_ENVELOPE } from './FilterEnvelopeEditor';
import { LFODisplay } from './LFODisplay';

const DEFAULT_ENVELOPE: SynthEnvelope = { attack: 0.005, decay: 0.1, sustain: 0.7, release: 0.3 };
const DEFAULT_FILTER: SynthFilter = { type: 'lowpass', frequency: 1000, Q: 1 };
const DEFAULT_LFO: SynthLfo = { rate: 1, depth: 0.5, shape: 'sine' };

interface SynthParameterEditorProps {
  trackId: string;
}

export function SynthParameterEditor({ trackId }: SynthParameterEditorProps) {
  const track = useProjectStore((s) => s.project?.tracks.find((t) => t.id === trackId));
  const updateSynthEnvelope = useProjectStore((s) => s.updateSynthEnvelope);
  const updateSynthFilter = useProjectStore((s) => s.updateSynthFilter);
  const updateSynthLfo = useProjectStore((s) => s.updateSynthLfo);
  const updateFilterEnvelope = useProjectStore((s) => s.updateFilterEnvelope);

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

  if (!track) return null;

  const envelope = track.synthEnvelope ?? DEFAULT_ENVELOPE;
  const filter = track.synthFilter ?? DEFAULT_FILTER;
  const lfo = track.synthLfo ?? DEFAULT_LFO;
  const filterEnvelope = track.filterEnvelope ?? DEFAULT_FILTER_ENVELOPE;

  return (
    <div className="flex flex-col gap-4 p-3 bg-[#222] rounded-lg border border-[#333]" data-track-id={trackId}>
      <div className="text-xs text-zinc-300 font-medium uppercase tracking-wider">
        Synth Parameters
      </div>
      <ADSREnvelopeEditor envelope={envelope} onChange={onEnvelopeChange} />
      <div className="h-px bg-[#333]" />
      <SynthFilterControls filter={filter} onChange={onFilterChange} />
      <div className="h-px bg-[#333]" />
      <FilterEnvelopeEditor envelope={filterEnvelope} onChange={onFilterEnvelopeChange} />
      <div className="h-px bg-[#333]" />
      <LFODisplay lfo={lfo} onChange={onLfoChange} />
    </div>
  );
}
