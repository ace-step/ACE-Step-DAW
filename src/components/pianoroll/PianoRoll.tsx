import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAudioImport } from '../../hooks/useAudioImport';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import type { PianoRollGrid, SamplerConfig } from '../../types/project';
import { QuickSamplerEditor } from './QuickSamplerEditor';
import { GeneratePatternDialog } from './GeneratePatternDialog';
import { PianoRollCanvas } from './PianoRollCanvas';
import { PianoRollEmptyState } from './PianoRollEmptyState';
import { QuantizeDialog } from './QuantizeDialog';
import { TransformMenu } from './TransformMenu';
import { getPianoRollToolShortcut, type PianoRollTool } from './PianoRollConstants';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const PIANO_ROLL_TOOL_BUTTONS = [
  { tool: 'select', label: 'Select', icon: '↖' },
  { tool: 'pencil', label: 'Pencil', icon: '✏' },
  { tool: 'paint', label: 'Paint', icon: '▦' },
  { tool: 'erase', label: 'Erase', icon: '⌫' },
  { tool: 'slide', label: 'Slide', icon: '⇢' },
] as const satisfies ReadonlyArray<{ tool: PianoRollTool; label: string; icon: string }>;

export function PianoRoll() {
  const [activeTool, setActiveTool] = useState<PianoRollTool>('select');
  const [showGhostNotes, setShowGhostNotes] = useState(false);
  const [gridSize, setGridSize] = useState<PianoRollGrid>('1/16');
  const [prZoomX, setPrZoomX] = useState(1);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [samplerDropActive, setSamplerDropActive] = useState(false);

  const project = useProjectStore((s) => s.project);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const setTrackSampler = useProjectStore((s) => s.setTrackSampler);
  const clearTrackSampler = useProjectStore((s) => s.clearTrackSampler);
  const updateSamplerConfig = useProjectStore((s) => s.updateSamplerConfig);
  const {
    importAudioFileAsSampler,
    importAssetAsQuickSampler,
    openSamplerFilePicker,
  } = useAudioImport();

  const openTrackId = useUIStore((s) => s.openPianoRollTrackId);
  const openClipId = useUIStore((s) => s.openPianoRollClipId);
  const pianoRollHeight = useUIStore((s) => s.pianoRollHeight);
  const setPianoRollHeight = useUIStore((s) => s.setPianoRollHeight);
  const setOpenPianoRoll = useUIStore((s) => s.setOpenPianoRoll);
  const openGeneratePatternDialog = useUIStore((s) => s.openGeneratePatternDialog);
  const setHistoryFocusScope = useUIStore((s) => s.setHistoryFocusScope);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return;

      if (event.key === 'b' || event.key === 'B') {
        event.preventDefault();
        setActiveTool((tool) => (tool === 'pencil' ? 'select' : 'pencil'));
        return;
      }

      if (event.key === '1') setActiveTool('select');
      if (event.key === '2') setActiveTool('pencil');
      if (event.key === '3') setActiveTool('paint');
      if (event.key === '4') setActiveTool('erase');
      if (event.key === '5') setActiveTool('slide');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const track = useMemo(
    () => project?.tracks.find((candidate) => candidate.id === openTrackId) ?? null,
    [openTrackId, project],
  );

  const clip = useMemo(() => {
    if (!track) return null;
    if (openClipId) {
      const selectedClip = track.clips.find((candidate) => candidate.id === openClipId);
      if (selectedClip?.midiData) return selectedClip;
    }
    return track.clips.find((candidate) => candidate.midiData) ?? null;
  }, [openClipId, track]);

  const ghostNotes = useMemo(() => {
    if (!showGhostNotes || !project || !track) return [];
    const notes: Array<{ pitch: number; startBeat: number; durationBeats: number; color: string }> = [];
    for (const otherTrack of project.tracks) {
      if (otherTrack.id === track.id) continue;
      for (const otherClip of otherTrack.clips) {
        if (otherClip.midiData) {
          for (const note of otherClip.midiData.notes) {
            notes.push({ pitch: note.pitch, startBeat: note.startBeat, durationBeats: note.durationBeats, color: otherTrack.color });
          }
        }
      }
    }
    return notes;
  }, [showGhostNotes, project, track]);

  const samplerConfig = track?.samplerConfig ?? null;
  const sampleDuration = Math.max(0.01, track?.sampler?.sampleDuration ?? samplerConfig?.trimEnd ?? 1);

  const applySamplerConfig = useCallback((updates: Partial<SamplerConfig>) => {
    if (!track?.sampler?.audioKey || !samplerConfig) return;

    const trimStart = clamp(updates.trimStart ?? samplerConfig.trimStart, 0, sampleDuration - 0.01);
    const trimEnd = clamp(updates.trimEnd ?? samplerConfig.trimEnd, trimStart + 0.01, sampleDuration);
    const loopStart = clamp(updates.loopStart ?? samplerConfig.loopStart, trimStart, trimEnd - 0.01);
    const loopEnd = clamp(updates.loopEnd ?? samplerConfig.loopEnd, loopStart + 0.01, trimEnd);

    updateSamplerConfig(track.id, {
      ...samplerConfig,
      ...updates,
      rootNote: updates.rootNote ?? samplerConfig.rootNote,
      trimStart,
      trimEnd,
      loopStart,
      loopEnd,
    });
  }, [sampleDuration, samplerConfig, track, updateSamplerConfig]);

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = pianoRollHeight;

      const onMouseMove = (event: MouseEvent) => {
        setPianoRollHeight(startHeight + (startY - event.clientY));
      };

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [pianoRollHeight, setPianoRollHeight],
  );

  const handleSamplerDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const types = e.dataTransfer.types;
    if (types.includes('Files') || types.includes('application/x-asset-id')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setSamplerDropActive(true);
    }
  }, []);

  const handleSamplerDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setSamplerDropActive(false);
    if (!track) return;

    const assetId = e.dataTransfer.getData('application/x-asset-id');
    if (assetId) {
      await importAssetAsQuickSampler(assetId, track.id);
      return;
    }

    const file = e.dataTransfer.files?.[0];
    if (file && (file.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|aac|m4a|webm)$/i.test(file.name))) {
      await importAudioFileAsSampler(file, track.id);
    }
  }, [importAssetAsQuickSampler, importAudioFileAsSampler, track]);

  if (!track) return null;

  return (
    <div
      className="border-t border-[#1a1a1a] bg-[#0a0a1e] flex flex-col select-none shrink-0"
      style={{ height: pianoRollHeight }}
      onMouseDownCapture={() => setHistoryFocusScope('pianoRoll')}
      onFocusCapture={() => setHistoryFocusScope('pianoRoll')}
    >
      <div
        aria-label="Resize piano roll"
        className="h-1.5 w-full cursor-ns-resize bg-[#444] hover:bg-violet-500 transition-colors flex-shrink-0"
        onMouseDown={handleResizeMouseDown}
      />

      <div className="px-3 py-2 border-b border-[#2a2a2a] bg-[#0e0e24] flex items-center gap-2 shrink-0 flex-wrap">
        <div className="text-xs font-medium text-zinc-200">{track.displayName}</div>

        {PIANO_ROLL_TOOL_BUTTONS.map(({ tool, label, icon }) => {
          const active = activeTool === tool;
          return (
            <button
              type="button"
              key={tool}
              aria-label={`Activate ${label.toLowerCase()} tool`}
              aria-keyshortcuts={getPianoRollToolShortcut(tool)}
              aria-pressed={active ? 'true' : 'false'}
              className={`px-2 py-1 rounded text-[10px] transition-colors ${
                active ? 'bg-violet-600/50 text-violet-200' : 'bg-white/5 text-zinc-400 hover:bg-white/10'
              }`}
              onClick={() => setActiveTool(tool)}
              title={`${label} tool (${getPianoRollToolShortcut(tool)})`}
            >
              {icon} {label}
            </button>
          );
        })}

        <div
          role="status"
          aria-live="polite"
          data-active-tool={activeTool}
          className="px-2 py-1 rounded bg-black/20 border border-white/5 text-[10px] text-zinc-300"
        >
          Tool: <span className="text-zinc-100">{PIANO_ROLL_TOOL_BUTTONS.find(({ tool }) => tool === activeTool)?.label ?? 'Select'}</span>
        </div>

        <button
          className={`px-2 py-1 rounded text-[10px] transition-colors ${
            showGhostNotes ? 'bg-cyan-600/50 text-cyan-200' : 'bg-white/5 text-zinc-400 hover:bg-white/10'
          }`}
          onClick={() => setShowGhostNotes((v) => !v)}
          title="Show notes from other tracks"
        >
          Ghost
        </button>

        <select
          aria-label="Piano roll grid size"
          value={gridSize}
          onChange={(e) => setGridSize(e.target.value as PianoRollGrid)}
          className="bg-[#111] border border-[#333] rounded px-2 py-1 text-[11px] text-zinc-300"
        >
          <option value="1/4">1/4</option>
          <option value="1/8">1/8</option>
          <option value="1/16">1/16</option>
          <option value="1/32">1/32</option>
        </select>

        <select
          aria-label="Track synth preset"
          value={track.synthPreset ?? 'piano'}
          onChange={(e) => updateTrack(track.id, { synthPreset: e.target.value as typeof track.synthPreset })}
          className="bg-[#111] border border-[#333] rounded px-2 py-1 text-[11px] text-zinc-300"
        >
          <option value="piano">Piano</option>
          <option value="strings">Strings</option>
          <option value="pad">Pad</option>
          <option value="lead">Lead</option>
          <option value="bass">Bass</option>
          <option value="organ">Organ</option>
          <option value="sampler">Quick Sampler</option>
        </select>

        {clip && <TransformMenu clipId={clip.id} selectedNoteIds={selectedNoteIds} />}

        {clip && (
          <button
            className="px-2 py-1 rounded text-[10px] bg-violet-600/30 text-violet-200 hover:bg-violet-600/50 transition-colors"
            onClick={() => openGeneratePatternDialog(clip.id)}
            title="Generate MIDI pattern from genre/scale constraints"
          >
            Generate Pattern
          </button>
        )}

        {clip && <span className="text-[10px] text-zinc-500 ml-1 truncate max-w-[200px]">{clip.prompt}</span>}

        <div className="ml-auto flex items-center gap-2">
          <button
            aria-label="Zoom out piano roll horizontally"
            className="text-[9px] text-zinc-400 hover:text-zinc-200 px-1"
            onClick={() => setPrZoomX((zoom) => Math.max(0.25, zoom - 0.25))}
          >
            -H
          </button>
          <button
            aria-label="Zoom in piano roll horizontally"
            className="text-[9px] text-zinc-400 hover:text-zinc-200 px-1"
            onClick={() => setPrZoomX((zoom) => Math.min(8, zoom + 0.25))}
          >
            +H
          </button>
          <button
            aria-label="Close piano roll"
            className="text-xs text-zinc-400 hover:text-zinc-200"
            onClick={() => setOpenPianoRoll(null)}
          >
            Close
          </button>
        </div>
      </div>

      {track.synthPreset === 'sampler' && (
        <div
          aria-label="Quick Sampler target"
          className={samplerDropActive ? 'ring-1 ring-cyan-400/70 shrink-0' : 'shrink-0'}
          onDragOver={handleSamplerDragOver}
          onDragLeave={() => setSamplerDropActive(false)}
          onDrop={handleSamplerDrop}
        >
          <QuickSamplerEditor
            track={track}
            onSamplerConfigChange={applySamplerConfig}
            onSamplerSettingsChange={(updates) => setTrackSampler(track.id, updates)}
            onClear={() => clearTrackSampler(track.id)}
            onLoadSample={() => openSamplerFilePicker(track.id)}
          />
        </div>
      )}

      {clip ? (
        <PianoRollCanvas
          clip={clip}
          track={track}
          activeTool={activeTool}
          gridSize={gridSize}
          prZoomX={prZoomX}
          onZoomXChange={setPrZoomX}
          ghostNotes={ghostNotes}
          selectedNoteIds={selectedNoteIds}
          onSelectedNoteIdsChange={setSelectedNoteIds}
        />
      ) : (
        <PianoRollEmptyState />
      )}
      <QuantizeDialog />
      <GeneratePatternDialog />
    </div>
  );
}
