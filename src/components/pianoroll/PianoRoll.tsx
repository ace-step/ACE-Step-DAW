import { useCallback, useEffect, useMemo, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import type { PianoRollGrid } from '../../types/project';
import { PianoRollCanvas } from './PianoRollCanvas';
import { PianoRollEmptyState } from './PianoRollEmptyState';
import { QuantizeDialog } from './QuantizeDialog';
import { GeneratePatternDialog } from './GeneratePatternDialog';
import { TransformMenu } from './TransformMenu';
import { getPianoRollToolShortcut, midiNoteToName, type PianoRollTool } from './PianoRollConstants';
import { useAudioImport } from '../../hooks/useAudioImport';

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

  const project = useProjectStore((s) => s.project);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const setTrackSampler = useProjectStore((s) => s.setTrackSampler);
  const clearTrackSampler = useProjectStore((s) => s.clearTrackSampler);
  const { openSamplerFilePicker } = useAudioImport();

  const openTrackId = useUIStore((s) => s.openPianoRollTrackId);
  const openClipId = useUIStore((s) => s.openPianoRollClipId);
  const pianoRollHeight = useUIStore((s) => s.pianoRollHeight);
  const setPianoRollHeight = useUIStore((s) => s.setPianoRollHeight);
  const setOpenPianoRoll = useUIStore((s) => s.setOpenPianoRoll);
  const openGeneratePatternDialog = useUIStore((s) => s.openGeneratePatternDialog);

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

  // Ghost notes from other tracks' MIDI clips
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

  if (!track) return null;

  return (
    <div
      className="border-t border-[#1a1a1a] bg-[#0a0a1e] flex flex-col select-none shrink-0"
      style={{ height: pianoRollHeight }}
    >
      <div
        aria-label="Resize piano roll"
        className="h-1.5 w-full cursor-ns-resize bg-[#444] hover:bg-violet-500 transition-colors flex-shrink-0"
        onMouseDown={handleResizeMouseDown}
      />

      <div className="h-9 px-3 border-b border-[#2a2a2a] bg-[#0e0e24] flex items-center gap-2 shrink-0">
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
          👻 Ghost
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
          <option value="sampler">Sampler</option>
        </select>

        {track.synthPreset === 'sampler' && (
          <>
            <button
              aria-label={`Load sampler source for ${track.displayName}`}
              className="px-2 py-1 rounded text-[10px] bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 transition-colors"
              onClick={() => openSamplerFilePicker(track.id)}
            >
              {track.sampler?.audioKey ? 'Swap Sample' : 'Load Sample'}
            </button>
            <label className="text-[10px] text-zinc-400 flex items-center gap-1">
              Root
              <input
                aria-label="Sampler root note"
                type="number"
                min="0"
                max="127"
                value={track.sampler?.rootNote ?? 60}
                onChange={(e) => setTrackSampler(track.id, { rootNote: Number(e.target.value) })}
                className="w-14 bg-[#111] border border-[#333] rounded px-1.5 py-1 text-[11px] text-zinc-200"
              />
              <span className="text-zinc-500">{midiNoteToName(track.sampler?.rootNote ?? 60)}</span>
            </label>
            {track.sampler?.audioKey && (
              <button
                aria-label={`Clear sampler source for ${track.displayName}`}
                className="px-2 py-1 rounded text-[10px] bg-white/5 text-zinc-400 hover:bg-white/10"
                onClick={() => clearTrackSampler(track.id)}
              >
                Clear
              </button>
            )}
          </>
        )}

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
        {track.synthPreset === 'sampler' && (
          <span className={`text-[10px] truncate max-w-[200px] ${track.sampler?.audioKey ? 'text-amber-200/80' : 'text-rose-300/80'}`}>
            {track.sampler?.sampleName ? `Sample: ${track.sampler.sampleName}` : 'Load an audio sample to play this track'}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            aria-label="Zoom out piano roll horizontally"
            className="text-[9px] text-zinc-400 hover:text-zinc-200 px-1"
            onClick={() => setPrZoomX((zoom) => Math.max(0.25, zoom - 0.25))}
          >
            −H
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
