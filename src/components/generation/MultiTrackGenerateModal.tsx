import { useState, useEffect, useCallback, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';
import { generateFromMultiTrack } from '../../services/generationPipeline';
import { extractContextAudio } from '../../services/contextAudioExtractor';

const VOCAL_TRACKS = new Set(['vocals', 'backing_vocals']);

interface Props {
  selectWindow: { startTime: number; endTime: number };
  contextWindow: { startTime: number; endTime: number } | null;
  onClose: () => void;
}

function fmt(s: number) {
  return `${s.toFixed(1)}s`;
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

interface TrackRow {
  trackId: string;
  trackName: string;
  displayName: string;
  checked: boolean;
  localDescription: string;
  lyrics: string;
  isVocal: boolean;
}

export function MultiTrackGenerateModal({ selectWindow, contextWindow, onClose }: Props) {
  const project = useProjectStore((s) => s.project);
  const isGenerating = useGenerationStore((s) => s.isGenerating);

  // Detect context mode
  const hasContextWindow = contextWindow !== null;
  const [hasContextAudio, setHasContextAudio] = useState(false);

  useEffect(() => {
    if (!hasContextWindow || !project) {
      setHasContextAudio(false);
      return;
    }
    const clips = project.tracks.flatMap((t) => t.clips);
    const audioInRange = clips.some(
      (c) =>
        (c.cumulativeMixKey || c.isolatedAudioKey) &&
        c.startTime < contextWindow!.endTime &&
        c.startTime + c.duration > contextWindow!.startTime,
    );
    setHasContextAudio(audioInRange);
  }, [hasContextWindow, contextWindow, project]);

  const hasContext = hasContextWindow && hasContextAudio;

  // Track rows — initialize once on mount; guard against Zustand re-renders
  const rowsInitRef = useRef(false);
  const [rows, setRows] = useState<TrackRow[]>([]);
  useEffect(() => {
    if (rowsInitRef.current || !project) return;
    rowsInitRef.current = true;
    const sorted = [...project.tracks].sort((a, b) => a.order - b.order);
    setRows(
      sorted.map((t) => ({
        trackId: t.id,
        trackName: t.trackName,
        displayName: t.displayName,
        checked: true,
        localDescription: t.localCaption ?? t.displayName,
        lyrics: '',
        isVocal: VOCAL_TRACKS.has(t.trackName),
      })),
    );
  }, [project]);

  const [globalCaption, setGlobalCaption] = useState(() => project?.globalCaption ?? '');
  const [chunkMaskMode, setChunkMaskMode] = useState<'auto' | 'explicit'>('auto');
  const [sharedSeed, setSharedSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));

  // Context audio preview
  type PreviewState = 'idle' | 'loading' | 'playing';
  const [previewState, setPreviewState] = useState<PreviewState>('idle');
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const scrubIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPreview = useCallback(() => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.src = '';
      previewAudioRef.current = null;
    }
    if (scrubIntervalRef.current) {
      clearInterval(scrubIntervalRef.current);
      scrubIntervalRef.current = null;
    }
    setPreviewState('idle');
    setPreviewCurrentTime(0);
    setPreviewDuration(0);
  }, []);

  useEffect(() => () => stopPreview(), [stopPreview]);

  const handlePreviewContext = useCallback(async () => {
    if (previewState === 'playing') {
      stopPreview();
      return;
    }
    if (!contextWindow) return;
    setPreviewState('loading');
    try {
      const blob = await extractContextAudio(contextWindow);
      if (!blob || blob.size <= 44) {
        setPreviewState('idle');
        return;
      }
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      audio.addEventListener('loadedmetadata', () => {
        setPreviewDuration(audio.duration);
      });
      audio.addEventListener('ended', () => stopPreview());
      await audio.play();
      setPreviewState('playing');
      scrubIntervalRef.current = setInterval(() => {
        if (previewAudioRef.current) setPreviewCurrentTime(previewAudioRef.current.currentTime);
      }, 100);
    } catch {
      setPreviewState('idle');
    }
  }, [contextWindow, previewState, stopPreview]);

  const handleScrub = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const t = parseFloat(e.target.value);
      if (previewAudioRef.current) previewAudioRef.current.currentTime = t;
      setPreviewCurrentTime(t);
    },
    [],
  );

  const toggleRow = (idx: number) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, checked: !r.checked } : r)));
  };

  const updateRowField = (idx: number, field: 'localDescription' | 'lyrics', value: string) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const checkedCount = rows.filter((r) => r.checked).length;
  const selDuration = selectWindow.endTime - selectWindow.startTime;

  const handleGenerate = async () => {
    if (checkedCount === 0) return;
    stopPreview();
    const selected = rows.filter((r) => r.checked);
    const opts = {
      selectWindow,
      contextWindow,
      globalCaption,
      tracks: selected.map((r) => ({
        trackId: r.trackId,
        localDescription: r.localDescription,
        lyrics: r.lyrics,
      })),
      sharedSeed,
      chunkMaskMode,
    };
    onClose();
    await generateFromMultiTrack(opts);
  };

  if (!project) return null;

  // Timeline diagram layout
  const totalDuration = project.totalDuration || 60;
  const ctxStart = contextWindow?.startTime ?? 0;
  const ctxEnd = contextWindow?.endTime ?? 0;
  const diagramMin = hasContext ? Math.min(ctxStart, selectWindow.startTime) : selectWindow.startTime;
  const diagramMax = hasContext ? Math.max(ctxEnd, selectWindow.endTime) : selectWindow.endTime;
  const diagramRange = diagramMax - diagramMin || 1;
  const pad = diagramRange * 0.08;
  const dMin = Math.max(0, diagramMin - pad);
  const dMax = Math.min(totalDuration, diagramMax + pad);
  const dRange = dMax - dMin || 1;
  const toPercent = (t: number) => `${((t - dMin) / dRange) * 100}%`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl flex flex-col"
        style={{ width: 580, maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-zinc-100">Generate Tracks</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                hasContext
                  ? 'bg-blue-900/60 text-blue-300 border border-blue-700/50'
                  : 'bg-violet-900/60 text-violet-300 border border-violet-700/50'
              }`}
            >
              {hasContext ? 'From Context' : 'From Silence'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-xs text-zinc-300">
          {/* Timeline diagram */}
          <div className="bg-zinc-900/60 rounded px-3 pt-2 pb-4 border border-zinc-800">
            <p className="text-[10px] text-zinc-400 mb-2">
              {hasContext
                ? 'The model generates audio for the Select Window, conditioned on the Context Window.'
                : 'The model generates audio from silence for the Select Window.'}
            </p>
            <div className="relative w-full" style={{ height: '52px' }}>
              {hasContext && (
                <>
                  <span
                    className="absolute left-0 text-[8px] text-blue-300 leading-none"
                    style={{ top: '4px' }}
                  >
                    Context
                  </span>
                  <div
                    className="absolute rounded"
                    style={{
                      top: '14px',
                      height: '12px',
                      left: toPercent(ctxStart),
                      width: `calc(${toPercent(ctxEnd)} - ${toPercent(ctxStart)})`,
                      background: 'rgba(59,130,246,0.25)',
                      border: '1px solid rgba(96,165,250,0.6)',
                    }}
                  />
                </>
              )}
              <span
                className={`absolute left-0 text-[8px] leading-none ${
                  hasContext ? 'text-orange-300' : 'text-violet-300'
                }`}
                style={{ top: hasContext ? '30px' : '14px' }}
              >
                Select
              </span>
              <div
                className="absolute rounded"
                style={{
                  top: hasContext ? '40px' : '24px',
                  height: '12px',
                  left: toPercent(selectWindow.startTime),
                  width: `calc(${toPercent(selectWindow.endTime)} - ${toPercent(selectWindow.startTime)})`,
                  background: hasContext ? 'rgba(251,146,60,0.25)' : 'rgba(139,92,246,0.25)',
                  border: `1px solid ${hasContext ? 'rgba(251,146,60,0.6)' : 'rgba(139,92,246,0.6)'}`,
                }}
              />
            </div>
            <div className="flex items-center gap-3 mt-1">
              {hasContext && (
                <span className="flex items-center gap-1 text-[8px] text-blue-400">
                  <span
                    className="inline-block w-2 h-2 rounded-sm"
                    style={{ background: 'rgba(59,130,246,0.4)', border: '1px solid rgba(96,165,250,0.7)' }}
                  />
                  Context {fmt(ctxStart)}–{fmt(ctxEnd)}
                </span>
              )}
              <span
                className={`flex items-center gap-1 text-[8px] ${
                  hasContext ? 'text-orange-400' : 'text-violet-400'
                }`}
              >
                <span
                  className="inline-block w-2 h-2 rounded-sm"
                  style={{
                    background: hasContext ? 'rgba(251,146,60,0.4)' : 'rgba(139,92,246,0.4)',
                    border: `1px solid ${hasContext ? 'rgba(251,146,60,0.7)' : 'rgba(139,92,246,0.7)'}`,
                  }}
                />
                Select {fmt(selectWindow.startTime)}–{fmt(selectWindow.endTime)} ({fmt(selDuration)})
              </span>
            </div>
          </div>

          {/* Context audio player */}
          {hasContext && (
            <div className="flex items-center gap-2 px-3 py-2 rounded bg-blue-950/50 border border-blue-800/40">
              <button
                onClick={handlePreviewContext}
                disabled={previewState === 'loading'}
                className="w-6 h-6 flex items-center justify-center rounded bg-blue-800/60 hover:bg-blue-700/60 text-blue-200 text-[10px] disabled:opacity-50 shrink-0 transition-colors"
                title={previewState === 'playing' ? 'Stop preview' : 'Preview context audio'}
              >
                {previewState === 'loading' ? '…' : previewState === 'playing' ? '■' : '▶'}
              </button>
              <input
                type="range"
                min={0}
                max={previewDuration || 1}
                step={0.01}
                value={previewCurrentTime}
                onChange={handleScrub}
                disabled={previewState !== 'playing'}
                className="flex-1 h-1 accent-blue-400 cursor-pointer disabled:opacity-40"
              />
              <span className="text-[9px] font-mono text-blue-300 shrink-0 w-[60px] text-right">
                {fmtTime(previewCurrentTime)} / {fmtTime(previewDuration)}
              </span>
            </div>
          )}

          {/* Chunk mask mode toggle */}
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-zinc-400">Mask mode:</label>
            <button
              onClick={() => setChunkMaskMode(chunkMaskMode === 'auto' ? 'explicit' : 'auto')}
              className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                chunkMaskMode === 'auto'
                  ? 'bg-teal-900/50 border-teal-700/50 text-teal-300'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400'
              }`}
            >
              {chunkMaskMode === 'auto' ? 'Auto (model decides)' : 'Explicit (select window only)'}
            </button>
          </div>

          {/* Track list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
                Tracks ({checkedCount} selected)
              </span>
            </div>
            {rows.map((row, idx) => (
              <div
                key={row.trackId}
                className={`rounded border p-2 space-y-1 transition-colors ${
                  row.checked
                    ? 'bg-zinc-800/60 border-zinc-700'
                    : 'bg-zinc-900/40 border-zinc-800 opacity-60'
                }`}
              >
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={row.checked}
                    onChange={() => toggleRow(idx)}
                    className="accent-teal-500"
                  />
                  <span className="text-[11px] font-medium text-zinc-200">{row.displayName}</span>
                  <span className="text-[9px] text-zinc-500">({row.trackName})</span>
                </label>
                {row.checked && (
                  <div className="pl-5 space-y-1">
                    <textarea
                      value={row.localDescription}
                      onChange={(e) => updateRowField(idx, 'localDescription', e.target.value)}
                      placeholder="Local description for this track…"
                      rows={2}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 placeholder-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-teal-600"
                    />
                    {row.isVocal && (
                      <textarea
                        value={row.lyrics}
                        onChange={(e) => updateRowField(idx, 'lyrics', e.target.value)}
                        placeholder="Lyrics…"
                        rows={2}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 placeholder-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-teal-600"
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Global caption */}
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">
              Global Song Description
            </label>
            <textarea
              value={globalCaption}
              onChange={(e) => setGlobalCaption(e.target.value)}
              placeholder="Describe the overall song (genre, mood, tempo…)"
              rows={2}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-[11px] text-zinc-200 placeholder-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-teal-600"
            />
          </div>

          {/* Shared seed */}
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-zinc-400 shrink-0">Seed:</label>
            <input
              type="number"
              value={sharedSeed}
              onChange={(e) => setSharedSeed(parseInt(e.target.value) || 0)}
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-600 w-28"
            />
            <button
              onClick={() => setSharedSeed(Math.floor(Math.random() * 2 ** 31))}
              className="text-[10px] px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
            >
              🎲
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-zinc-700">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs text-zinc-400 border border-zinc-700 hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={isGenerating || checkedCount === 0}
            className="px-4 py-1.5 rounded text-xs font-medium bg-teal-700 text-white hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isGenerating ? 'Generating…' : `Generate ${checkedCount} track${checkedCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
