import { useState, useEffect, useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';
import { useUIStore } from '../../store/uiStore';
import { generateBatch, type BatchTrackEntry } from '../../services/generationPipeline';

const VOCAL_TRACKS = new Set(['vocals', 'backing_vocals']);

interface TrackRow {
  trackId: string;
  trackName: string;
  displayName: string;
  localDescription: string;
  lyrics: string;
  checked: boolean;
  /** First existing clip id, if any — resolved at generation time if null */
  firstClipId: string | null;
  hasExistingAudio: boolean;
}

interface Props {
  mode: 'silence' | 'context';
  onClose: () => void;
}

function randomSeed() {
  return Math.floor(Math.random() * 2 ** 31);
}

export function BatchGenerateModal({ mode, onClose }: Props) {
  const project = useProjectStore((s) => s.project);
  const isGenerating = useGenerationStore((s) => s.isGenerating);
  const initialRange = useUIStore((s) => s.batchGenerateInitialRange);

  // Pre-fill from project-level global caption
  const [globalCaption, setGlobalCaption] = useState(() => project?.globalCaption ?? '');
  const [rows, setRows] = useState<TrackRow[]>([]);
  const [sharedSeed, setSharedSeed] = useState<number>(randomSeed);

  // Populate rows from current project tracks — one row per track regardless of clips
  useEffect(() => {
    if (!project) return;
    // Sync globalCaption in case the dialog was already open when project updated
    setGlobalCaption((prev) => prev || project.globalCaption || '');
    const tracks = useProjectStore.getState().getTracksInGenerationOrder();
    setRows(
      tracks.map((track) => {
        const firstClip = track.clips[0] ?? null;
        return {
          trackId: track.id,
          trackName: track.trackName,
          displayName: track.displayName ?? track.trackName.replace(/_/g, ' ').toUpperCase(),
          // Pre-populate from existing clip prompt; user can override before generating
          localDescription: firstClip?.prompt ?? '',
          lyrics: firstClip?.lyrics ?? '',
          // Check by default unless the track already has a ready result
          checked: !firstClip || firstClip.generationStatus !== 'ready',
          firstClipId: firstClip?.id ?? null,
          hasExistingAudio: firstClip?.generationStatus === 'ready',
        };
      }),
    );
  }, [project]);

  const toggleRow = useCallback((trackId: string) => {
    setRows((prev) => prev.map((r) => r.trackId === trackId ? { ...r, checked: !r.checked } : r));
  }, []);

  const updateDescription = useCallback((trackId: string, value: string) => {
    setRows((prev) => prev.map((r) => r.trackId === trackId ? { ...r, localDescription: value } : r));
  }, []);

  const updateLyrics = useCallback((trackId: string, value: string) => {
    setRows((prev) => prev.map((r) => r.trackId === trackId ? { ...r, lyrics: value } : r));
  }, []);

  const selectedRows = rows.filter((r) => r.checked);
  const canGenerate = selectedRows.length > 0 && !isGenerating;

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;

    const store = useProjectStore.getState();
    const audioDuration = store.getAudioDuration();
    const tracks: BatchTrackEntry[] = [];

    // Use the pre-filled range (from drag-select or context menu) if provided,
    // otherwise default to full project audio duration.
    const clipStartTime = initialRange?.startTime ?? 0;
    const clipDuration = initialRange?.duration ?? audioDuration;

    for (const row of selectedRows) {
      // Use existing first clip, or auto-create one at the selected time range
      let clipId = row.firstClipId;
      if (!clipId) {
        const newClip = store.addClip(row.trackId, {
          startTime: clipStartTime,
          duration: clipDuration,
          prompt: row.localDescription,
          globalCaption: globalCaption,
          lyrics: row.lyrics,
        });
        clipId = newClip.id;
      }
      tracks.push({ clipId, localDescription: row.localDescription, lyrics: row.lyrics || undefined });
    }

    onClose();
    await generateBatch({
      mode,
      globalCaption,
      tracks,
      sharedSeed,
    });
  }, [canGenerate, selectedRows, mode, globalCaption, sharedSeed, onClose]);

  const title = mode === 'silence' ? 'Generate from Silence' : 'Generate from Context';
  const isSilence = mode === 'silence';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-daw-surface border border-daw-border rounded-lg shadow-2xl w-[520px] max-h-[85vh] flex flex-col text-xs text-zinc-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white">{title}</span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${
              isSilence ? 'bg-violet-700/60 text-violet-200' : 'bg-teal-700/60 text-teal-200'
            }`}>
              {isSilence ? 'Parallel' : 'Sequential'}
            </span>
            {initialRange && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-zinc-700 text-zinc-300">
                {initialRange.startTime.toFixed(1)}s — {(initialRange.startTime + initialRange.duration).toFixed(1)}s
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 transition-colors text-base leading-none"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
          {/* Global caption — both modes */}
          <div className="space-y-1">
            <label className="font-medium text-zinc-400 uppercase tracking-wide text-[10px]">
              Global song description
              <span className="ml-1 normal-case font-normal text-zinc-600">(optional)</span>
            </label>
            <textarea
              value={globalCaption}
              onChange={(e) => setGlobalCaption(e.target.value)}
              placeholder="e.g. upbeat pop song with energetic drums and warm bass…"
              rows={2}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-daw-accent"
            />
            {!isSilence && (
              <p className="text-zinc-600 text-[10px]">
                Context mode uses existing generated audio as context. Global caption is still used for conditioning.
              </p>
            )}
          </div>

          {/* Track rows */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="font-medium text-zinc-400 uppercase tracking-wide text-[10px]">
                Tracks to generate
              </label>
              <span className="text-zinc-600 text-[10px]">
                {selectedRows.length} / {rows.length} selected
              </span>
            </div>

            {rows.length === 0 ? (
              <p className="text-zinc-600 italic py-2">No tracks in project. Add tracks via the + button first.</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {rows.map((row) => (
                  <div
                    key={row.trackId}
                    className={`rounded border transition-colors ${
                      row.checked
                        ? 'border-daw-accent/40 bg-daw-accent/5'
                        : 'border-zinc-800 bg-zinc-900/40'
                    }`}
                  >
                    {/* Track header row */}
                    <div className="flex items-center gap-2 px-2 pt-2 pb-1">
                      <input
                        type="checkbox"
                        checked={row.checked}
                        onChange={() => toggleRow(row.trackId)}
                        className="accent-daw-accent flex-shrink-0"
                      />
                      <span className={`font-bold text-[10px] uppercase tracking-wider flex-1 ${
                        row.checked ? 'text-daw-accent' : 'text-zinc-500'
                      }`}>
                        {row.displayName}
                      </span>
                      {row.hasExistingAudio && (
                        <span className="text-[9px] text-zinc-500 italic">has audio</span>
                      )}
                    </div>

                    {/* Local description — always visible; dimmed when unchecked */}
                    <div className="px-2 pb-1">
                      <textarea
                        value={row.localDescription}
                        onChange={(e) => updateDescription(row.trackId, e.target.value)}
                        placeholder={`${row.displayName} track description (optional)…`}
                        rows={2}
                        className={`w-full bg-zinc-900 border rounded px-2 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none ${
                          row.checked ? 'border-zinc-700 focus:border-daw-accent' : 'border-zinc-800 opacity-50'
                        }`}
                      />
                    </div>

                    {/* Lyrics — vocals / backing_vocals only */}
                    {VOCAL_TRACKS.has(row.trackName) && (
                      <div className="px-2 pb-2">
                        <label className={`block text-[10px] mb-1 ${row.checked ? 'text-zinc-500' : 'text-zinc-600'}`}>
                          Lyrics
                        </label>
                        <textarea
                          value={row.lyrics}
                          onChange={(e) => updateLyrics(row.trackId, e.target.value)}
                          placeholder="Song lyrics…"
                          rows={3}
                          className={`w-full bg-zinc-900 border rounded px-2 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none font-mono ${
                            row.checked ? 'border-zinc-700 focus:border-daw-accent' : 'border-zinc-800 opacity-50'
                          }`}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Shared seed */}
          <div className="space-y-1">
            <label className="font-medium text-zinc-400 uppercase tracking-wide text-[10px]">
              Shared seed
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSharedSeed(randomSeed())}
                title="Randomize seed"
                className="px-2 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors text-zinc-300 text-sm leading-none"
              >
                🔀
              </button>
              <input
                type="number"
                value={sharedSeed}
                onChange={(e) => setSharedSeed(Number(e.target.value))}
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-daw-accent font-mono"
                min={0}
                max={2147483647}
              />
            </div>
            <p className="text-zinc-600 text-[10px]">
              All tracks share this seed for consistent harmonic correlation.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-daw-border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className={`px-4 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
              canGenerate
                ? isSilence
                  ? 'bg-violet-600 hover:bg-violet-500 text-white'
                  : 'bg-teal-600 hover:bg-teal-500 text-white'
                : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
            }`}
          >
            {isSilence ? '⬜' : '🎵'}
            {isGenerating ? 'Generating…' : `Generate (${selectedRows.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
