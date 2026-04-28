import { useCallback, useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';
import { useUIStore } from '../../store/uiStore';
import { generateBatch, type BatchTrackEntry } from '../../services/generationPipeline';
import { TRACK_CATALOG, TRACK_NAMES } from '../../constants/tracks';
import type { Track } from '../../types/project';
import type { StemsFormDraft } from '../../store/generationStore';
import { TimbrePresetPicker } from './TimbrePresetPicker';

const VOCAL_TRACKS = new Set(['vocals', 'backing_vocals']);
const DEFAULT_MULTI_TRACK_NAMES = ['drums', 'bass', 'keyboard', 'vocals'] as const;

type MultiTrackName = (typeof TRACK_NAMES)[number];

interface TrackRow {
  rowId: string;
  linkedTrackId: string | null;
  trackName: MultiTrackName;
  localDescription: string;
  lyrics: string;
  checked: boolean;
  firstClipId: string | null;
  hasExistingAudio: boolean;
}

interface Props {
  mode: 'silence' | 'context';
  onModeChange: (mode: 'silence' | 'context') => void;
  onFooterChange?: (footer: { label: string; disabled: boolean; action: () => void }) => void;
}

function randomSeed() {
  return Math.floor(Math.random() * 2 ** 31);
}

function createRowId() {
  return `multi-track-row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isDefaultTrackName(trackName: string): trackName is MultiTrackName {
  return TRACK_NAMES.includes(trackName as MultiTrackName);
}

function createDraftRow(trackName: MultiTrackName, overrides: Partial<TrackRow> = {}): TrackRow {
  return {
    rowId: createRowId(),
    linkedTrackId: null,
    trackName,
    localDescription: '',
    lyrics: '',
    checked: true,
    firstClipId: null,
    hasExistingAudio: false,
    ...overrides,
  };
}

function createRowFromTrack(track: Track): TrackRow | null {
  if (track.trackType !== 'stems' || !isDefaultTrackName(track.trackName)) {
    return null;
  }

  const firstClip = track.clips[0] ?? null;
  return createDraftRow(track.trackName, {
    linkedTrackId: track.id,
    localDescription: firstClip?.prompt ?? '',
    lyrics: firstClip?.lyrics ?? '',
    checked: !firstClip || firstClip.generationStatus !== 'ready',
    firstClipId: firstClip?.id ?? null,
    hasExistingAudio: firstClip?.generationStatus === 'ready',
  });
}

function buildInitialRows(project: NonNullable<ReturnType<typeof useProjectStore.getState>['project']>): TrackRow[] {
  const generationTracks = useProjectStore.getState()
    .getTracksInGenerationOrder()
    .map((track) => createRowFromTrack(track))
    .filter((track): track is TrackRow => track !== null);

  const rows = [...generationTracks];
  for (const trackName of DEFAULT_MULTI_TRACK_NAMES) {
    if (!rows.some((row) => row.trackName === trackName)) {
      rows.push(createDraftRow(trackName));
    }
  }

  return rows.length > 0 ? rows : DEFAULT_MULTI_TRACK_NAMES.map((trackName) => createDraftRow(trackName));
}

export function MultiTrackGenerateSection({ mode, onModeChange, onFooterChange }: Props) {
  const project = useProjectStore((s) => s.project);
  const isGenerating = useGenerationStore((s) => s.isGenerating);
  const stemsFormDraft = useGenerationStore((s) => s.stemsFormDraft);
  const setStemsFormDraft = useGenerationStore((s) => s.setStemsFormDraft);
  const initialRange = useUIStore((s) => s.batchGenerateInitialRange);

  const [globalCaption, setGlobalCaption] = useState(() => stemsFormDraft?.globalCaption ?? project?.globalCaption ?? '');
  const [rows, setRows] = useState<TrackRow[]>(() => stemsFormDraft?.rows as TrackRow[] ?? []);
  const [sharedSeed, setSharedSeed] = useState<number>(() => stemsFormDraft?.sharedSeed ?? randomSeed());
  const [audioDuration, setAudioDuration] = useState(() => stemsFormDraft?.audioDuration ?? 30);
  const [durationAuto, setDurationAuto] = useState(() => stemsFormDraft?.durationAuto ?? false);
  const [useRandomSeed, setUseRandomSeed] = useState(() => stemsFormDraft?.useRandomSeed ?? true);

  // Refs to capture latest state for the unmount effect
  const stateRef = useRef({ globalCaption, rows, sharedSeed, audioDuration, durationAuto, useRandomSeed });
  stateRef.current = { globalCaption, rows, sharedSeed, audioDuration, durationAuto, useRandomSeed };

  // Save draft to store on unmount
  useEffect(() => {
    return () => {
      const s = stateRef.current;
      if (s.rows.length > 0) {
        setStemsFormDraft({
          globalCaption: s.globalCaption,
          rows: s.rows,
          sharedSeed: s.sharedSeed,
          audioDuration: s.audioDuration,
          durationAuto: s.durationAuto,
          useRandomSeed: s.useRandomSeed,
        });
      }
    };
  }, [setStemsFormDraft]);

  useEffect(() => {
    if (!project) return;
    // Only build from project if we don't have a saved draft
    if (rows.length === 0) {
      setGlobalCaption((prev) => prev || project.globalCaption || '');
      setRows(buildInitialRows(project));
    }
  }, [project?.id]);

  const toggleRow = useCallback((rowId: string) => {
    setRows((prev) => prev.map((row) => (row.rowId === rowId ? { ...row, checked: !row.checked } : row)));
  }, []);

  const updateTrackName = useCallback((rowId: string, trackName: MultiTrackName) => {
    setRows((prev) => prev.map((row) => (
      row.rowId === rowId
        ? {
            ...row,
            trackName,
            linkedTrackId: null,
            firstClipId: null,
            hasExistingAudio: false,
          }
        : row
    )));
  }, []);

  const updateDescription = useCallback((rowId: string, value: string) => {
    setRows((prev) => prev.map((row) => (row.rowId === rowId ? { ...row, localDescription: value } : row)));
  }, []);

  const updateLyrics = useCallback((rowId: string, value: string) => {
    setRows((prev) => prev.map((row) => (row.rowId === rowId ? { ...row, lyrics: value } : row)));
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, createDraftRow('drums')]);
  }, []);

  const removeRow = useCallback((rowId: string) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((row) => row.rowId !== rowId) : prev));
  }, []);

  const selectedRows = rows.filter((row) => row.checked);
  const canGenerate = selectedRows.length > 0 && !isGenerating;
  const isSilence = mode === 'silence';

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;

    const store = useProjectStore.getState();
    const audioDuration = store.getAudioDuration();
    const tracks: BatchTrackEntry[] = [];
    const clipStartTime = initialRange?.startTime ?? 0;
    const clipDuration = initialRange?.duration ?? audioDuration;
    const reservedTrackIds = new Set<string>();
    const resolvedRows = new Map<string, Partial<TrackRow>>();

    const projectTracks = store.project?.tracks ?? [];

    for (const row of selectedRows) {
      let targetTrack = row.linkedTrackId
        ? projectTracks.find((track) => track.id === row.linkedTrackId) ?? null
        : null;

      if (!targetTrack || reservedTrackIds.has(targetTrack.id)) {
        targetTrack = projectTracks.find((track) => (
          track.trackType === 'stems'
          && track.trackName === row.trackName
          && !reservedTrackIds.has(track.id)
        )) ?? null;
      }

      if (!targetTrack) {
        targetTrack = store.addTrack(row.trackName, 'stems');
      }

      reservedTrackIds.add(targetTrack.id);

      let clipId = row.firstClipId && targetTrack.clips.some((clip) => clip.id === row.firstClipId)
        ? row.firstClipId
        : (targetTrack.clips[0]?.id ?? null);

      if (!clipId) {
        const newClip = store.addClip(targetTrack.id, {
          startTime: clipStartTime,
          duration: clipDuration,
          prompt: row.localDescription,
          globalCaption,
          lyrics: row.lyrics,
        });
        clipId = newClip.id;
      } else {
        store.updateClip(clipId, {
          prompt: row.localDescription,
          globalCaption,
          lyrics: row.lyrics,
        });
      }

      resolvedRows.set(row.rowId, {
        linkedTrackId: targetTrack.id,
        firstClipId: clipId,
      });
      tracks.push({
        clipId,
        localDescription: row.localDescription,
        lyrics: row.lyrics || undefined,
      });
    }

    if (resolvedRows.size > 0) {
      setRows((prev) => prev.map((row) => (
        resolvedRows.has(row.rowId)
          ? { ...row, ...resolvedRows.get(row.rowId) }
          : row
      )));
    }

    // Close panel before generation starts (match Mix mode behavior)
    useUIStore.getState().setShowGenerationPanel(false);

    // Fire-and-forget — generation runs in the background
    generateBatch({
      mode,
      globalCaption,
      tracks,
      sharedSeed,
    }).catch(() => {
      // errors are handled inside generateBatch via toast
    });
  }, [canGenerate, globalCaption, initialRange?.duration, initialRange?.startTime, mode, selectedRows, sharedSeed]);

  // Sync footer state to parent dialog
  if (onFooterChange) {
    onFooterChange({
      label: isGenerating ? 'Generating...' : `Generate ${selectedRows.length} Track${selectedRows.length === 1 ? '' : 's'}`,
      disabled: !canGenerate,
      action: () => void handleGenerate(),
    });
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3" data-testid="multi-track-generation-section">
      <div className="space-y-4">
        {/* Mode toggle + Global description — compact */}
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5 rounded-lg border border-[#3a3a3a] bg-[#1c1c1c] p-0.5">
              <button
                type="button"
                onClick={() => onModeChange('silence')}
                className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors ${
                  isSilence
                    ? 'bg-indigo-600 text-white'
                    : 'text-zinc-400 hover:bg-[#2a2a2a] hover:text-zinc-200'
                }`}
                aria-pressed={isSilence}
              >
                From Silence
              </button>
              <button
                type="button"
                onClick={() => onModeChange('context')}
                className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors ${
                  !isSilence
                    ? 'bg-emerald-600 text-white'
                    : 'text-zinc-400 hover:bg-[#2a2a2a] hover:text-zinc-200'
                }`}
                aria-pressed={!isSilence}
              >
                Use Context
              </button>
            </div>
            {initialRange && (
              <span className="rounded bg-[#333] px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">
                {initialRange.startTime.toFixed(1)}s – {(initialRange.startTime + initialRange.duration).toFixed(1)}s
              </span>
            )}
          </div>
          <TimbrePresetPicker onSelect={(preset) => setGlobalCaption(preset.promptTemplate)} />
          <textarea
            value={globalCaption}
            onChange={(e) => setGlobalCaption(e.target.value)}
            placeholder="Song description (optional)..."
            rows={3}
            className="w-full rounded border border-[#444] bg-[#2a2a2a] px-2 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:border-indigo-500 focus:outline-none"
          />
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between pr-0.5">
            <label className="font-medium text-zinc-400 uppercase tracking-wide text-[10px]">
              Tracks to generate
            </label>
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-600 text-[10px]">
                {selectedRows.length}/{rows.length}
              </span>
              <button
                type="button"
                onClick={addRow}
                className="flex h-5 w-5 items-center justify-center rounded border border-[#444] bg-[#2c2c2c] text-[12px] font-medium text-zinc-200 transition-colors hover:bg-[#363636]"
                data-testid="multi-track-add-row"
                title="Add track"
              >
                +
              </button>
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="py-2 text-[11px] italic text-zinc-500">No tracks in project. Add tracks first.</p>
          ) : (
            <div className="space-y-1 overflow-y-auto pr-1">
              {rows.map((row, index) => (
                <div
                  key={row.rowId}
                  className={`rounded-lg border transition-colors ${
                    row.checked
                      ? 'border-indigo-500/30 bg-indigo-500/5'
                      : 'border-[#3a3a3a] bg-[#222]/40'
                  }`}
                >
                  {/* Compact single-line row */}
                  <div className="flex items-center gap-1.5 px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={row.checked}
                      onChange={() => toggleRow(row.rowId)}
                      className="accent-indigo-500 h-3.5 w-3.5"
                    />
                    <select
                      value={row.trackName}
                      onChange={(event) => updateTrackName(row.rowId, event.target.value as MultiTrackName)}
                      className={`w-[90px] shrink-0 rounded border px-1 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] focus:outline-none ${
                        row.checked
                          ? 'border-[#444] bg-[#222] text-indigo-100 focus:border-indigo-500'
                          : 'border-[#3a3a3a] bg-[#222] text-zinc-500'
                      }`}
                      aria-label={`Target track type for row ${index + 1}`}
                      data-testid={`multi-track-role-select-${index}`}
                    >
                      {TRACK_NAMES.map((trackName) => (
                        <option key={trackName} value={trackName}>
                          {TRACK_CATALOG[trackName].displayName}
                        </option>
                      ))}
                    </select>
                    {row.hasExistingAudio && (
                      <span className="text-[9px] italic text-zinc-600">audio</span>
                    )}
                    <input
                      type="text"
                      value={row.localDescription}
                      onChange={(e) => updateDescription(row.rowId, e.target.value)}
                      placeholder="description..."
                      className={`flex-1 min-w-0 rounded border px-1.5 py-0.5 text-[10px] placeholder-zinc-600 focus:outline-none ${
                        row.checked ? 'border-[#444] bg-[#222] text-zinc-200 focus:border-indigo-500' : 'border-[#3a3a3a] bg-[#222] text-zinc-500 opacity-50'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(row.rowId)}
                      disabled={rows.length === 1}
                      className="flex h-5 w-5 items-center justify-center rounded border border-[#444] bg-[#2c2c2c] text-[12px] font-medium text-zinc-400 transition-colors hover:bg-[#363636] hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                      aria-label={`Remove track row ${index + 1}`}
                      title="Remove track"
                    >
                      −
                    </button>
                  </div>

                  {/* Lyrics row — only for vocal tracks, kept compact */}
                  {VOCAL_TRACKS.has(row.trackName) && row.checked && (
                    <div className="px-2 pb-1.5">
                      <textarea
                        value={row.lyrics}
                        onChange={(e) => updateLyrics(row.rowId, e.target.value)}
                        placeholder="[Verse 1]\nLyrics here..."
                        rows={3}
                        className="w-full resize-none rounded border border-[#444] bg-[#222] px-1.5 py-1 text-[10px] font-mono text-zinc-200 placeholder-zinc-600 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Duration + Seed — compact inline */}
        <section className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] font-medium uppercase text-zinc-500 shrink-0">Duration</label>
            <input
              type="number"
              value={audioDuration === -1 ? '' : audioDuration}
              onChange={(e) => setAudioDuration(e.target.value === '' ? -1 : Number(e.target.value))}
              placeholder="Auto"
              min={10}
              max={600}
              step={1}
              className="w-[60px] rounded border border-[#444] bg-[#2a2a2a] px-1.5 py-0.5 text-[11px] focus:border-indigo-500 focus:outline-none"
              disabled={durationAuto}
            />
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={durationAuto}
                onChange={(e) => {
                  setDurationAuto(e.target.checked);
                  if (e.target.checked) setAudioDuration(-1);
                  else setAudioDuration(30);
                }}
                className="h-3 w-3 rounded border-[#444] accent-indigo-500"
              />
              <span className="text-[9px] text-zinc-600">Auto</span>
            </label>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] font-medium uppercase text-zinc-500 shrink-0">Seed</label>
            <input
              type="number"
              value={sharedSeed}
              onChange={(e) => setSharedSeed(Number(e.target.value))}
              className="w-[110px] rounded border border-[#444] bg-[#222] px-1.5 py-0.5 text-[11px] font-mono text-zinc-100 focus:border-indigo-500 focus:outline-none"
              min={0}
              max={2147483647}
              disabled={useRandomSeed}
            />
            <button
              type="button"
              onClick={() => {
                setSharedSeed(randomSeed());
                setUseRandomSeed(false);
              }}
              className="text-[14px] leading-none transition-opacity hover:opacity-80"
              title="Random seed"
            >
              🎲
            </button>
            <label className="flex items-center gap-1 cursor-pointer" title="Use random seed each time">
              <input
                type="checkbox"
                checked={useRandomSeed}
                onChange={(e) => setUseRandomSeed(e.target.checked)}
                className="h-3 w-3 rounded border-[#444] accent-indigo-500"
              />
              <span className="text-[9px] text-zinc-600">Random</span>
            </label>
          </div>
        </section>

        {/* Generate button moved to unified dialog footer */}
      </div>
    </div>
  );
}
