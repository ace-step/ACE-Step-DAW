import { useCallback, useMemo, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import type { PianoRollGrid } from '../../types/project';
import { PianoRollCanvas } from './PianoRollCanvas';
import { PianoRollEmptyState } from './PianoRollEmptyState';
import { QuantizeDialog } from './QuantizeDialog';
import { TransformMenu } from './TransformMenu';

export function PianoRoll() {
  const [drawMode, setDrawMode] = useState(false);
  const [showGhostNotes, setShowGhostNotes] = useState(false);
  const [gridSize, setGridSize] = useState<PianoRollGrid>('1/16');
  const [prZoomX, setPrZoomX] = useState(1);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());

  const project = useProjectStore((s) => s.project);
  const updateTrack = useProjectStore((s) => s.updateTrack);

  const openTrackId = useUIStore((s) => s.openPianoRollTrackId);
  const openClipId = useUIStore((s) => s.openPianoRollClipId);
  const pianoRollHeight = useUIStore((s) => s.pianoRollHeight);
  const setPianoRollHeight = useUIStore((s) => s.setPianoRollHeight);
  const setOpenPianoRoll = useUIStore((s) => s.setOpenPianoRoll);

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

        <button
          aria-label="Toggle piano roll draw mode"
          className={`px-2 py-1 rounded text-[10px] transition-colors ${
            drawMode ? 'bg-violet-600/50 text-violet-200' : 'bg-white/5 text-zinc-400 hover:bg-white/10'
          }`}
          onClick={() => setDrawMode((mode) => !mode)}
          title="Toggle draw mode (B)"
        >
          ✏ Draw
        </button>

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
        </select>

        {clip && <TransformMenu clipId={clip.id} selectedNoteIds={selectedNoteIds} />}

        {clip && <span className="text-[10px] text-zinc-500 ml-1 truncate max-w-[200px]">{clip.prompt}</span>}

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
          drawMode={drawMode}
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
    </div>
  );
}
