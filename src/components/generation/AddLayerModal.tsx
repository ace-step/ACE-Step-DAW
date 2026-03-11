import { useState, useEffect, useCallback, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';
import { generateFromAddLayer } from '../../services/generationPipeline';
import { DualRangeSlider } from '../ui/DualRangeSlider';
import { extractContextAudio } from '../../services/contextAudioExtractor';

const VOCAL_TRACKS = new Set(['vocals', 'backing_vocals']);

interface Props {
  trackId: string;
  startTime: number;
  duration: number;
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

export function AddLayerModal({ trackId, startTime, duration, contextWindow, onClose }: Props) {
  const project = useProjectStore((s) => s.project);
  const setTrackLocalCaption = useProjectStore((s) => s.setTrackLocalCaption);
  const isGenerating = useGenerationStore((s) => s.isGenerating);

  const track = project?.tracks.find((t) => t.id === trackId);
  const isVocal = track ? VOCAL_TRACKS.has(track.trackName) : false;

  // Pre-fill local caption from track's localCaption (or fall back to display name)
  const defaultLocalCaption = track?.localCaption ?? track?.displayName ?? '';

  const [selStart, setSelStart] = useState(startTime);
  const [selEnd, setSelEnd] = useState(startTime + duration);
  const [localCaption, setLocalCaption] = useState(defaultLocalCaption);
  const [globalCaption, setGlobalCaption] = useState(project?.globalCaption ?? '');
  const [lyrics, setLyrics] = useState('');
  const [chunkMaskMode, setChunkMaskMode] = useState<'auto' | 'explicit'>('auto');

  // ── Context audio preview ──────────────────────────────────────────────────
  type PreviewState = 'idle' | 'loading' | 'playing';
  const [previewState, setPreviewState] = useState<PreviewState>('idle');
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const scrubIntervalRef = useRef<number | null>(null);

  const stopPreview = useCallback(() => {
    if (scrubIntervalRef.current) {
      clearInterval(scrubIntervalRef.current);
      scrubIntervalRef.current = null;
    }
    previewAudioRef.current?.pause();
    previewAudioRef.current = null;
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewState('idle');
    setPreviewCurrentTime(0);
    setPreviewDuration(0);
  }, []);

  // Stop preview on unmount
  useEffect(() => stopPreview, [stopPreview]);

  const handlePreviewContext = useCallback(async () => {
    if (previewState === 'playing') { stopPreview(); return; }
    if (!contextWindow) return;
    setPreviewState('loading');
    try {
      const blob = await extractContextAudio(contextWindow);
      if (!blob) { setPreviewState('idle'); return; }
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      audio.onloadedmetadata = () => setPreviewDuration(audio.duration);
      audio.onended = () => stopPreview();
      audio.onerror = () => stopPreview();
      scrubIntervalRef.current = window.setInterval(() => {
        if (previewAudioRef.current) setPreviewCurrentTime(previewAudioRef.current.currentTime);
      }, 100);
      await audio.play();
      setPreviewState('playing');
    } catch {
      stopPreview();
    }
  }, [previewState, contextWindow, stopPreview]);

  const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value);
    if (previewAudioRef.current) previewAudioRef.current.currentTime = t;
    setPreviewCurrentTime(t);
  }, []);

  useEffect(() => {
    setSelStart(startTime);
    setSelEnd(startTime + duration);
    setLocalCaption(track?.localCaption ?? track?.displayName ?? '');
    setGlobalCaption(project?.globalCaption ?? '');
  }, [trackId, startTime, duration]);

  const handleRangeChange = useCallback((s: number, e: number) => {
    setSelStart(s);
    setSelEnd(e);
  }, []);

  if (!project || !track) return null;

  const hasContext = contextWindow !== null;
  const modeLabel = hasContext ? 'From Context' : 'From Silence';
  const modeBadgeClass = hasContext
    ? 'bg-teal-700/60 text-teal-200'
    : 'bg-violet-700/60 text-violet-200';

  const totalDur = project.totalDuration || 1;
  function pct(t: number) { return `${(t / totalDur) * 100}%`; }

  const handleGenerate = async () => {
    stopPreview();
    // Persist local caption back to the track if the user changed it
    if (track && localCaption !== (track.localCaption ?? '')) {
      setTrackLocalCaption(trackId, localCaption);
    }
    onClose();
    await generateFromAddLayer({
      trackId,
      startTime: selStart,
      duration: selEnd - selStart,
      localDescription: localCaption,
      globalCaption,
      lyrics: isVocal ? lyrics : '',
      contextWindow,
      chunkMaskMode,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) { stopPreview(); onClose(); } }}
    >
      <div className="bg-daw-surface border border-daw-border rounded-lg shadow-2xl w-[480px] max-h-[85vh] flex flex-col text-xs text-zinc-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white">Add Layer</span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${modeBadgeClass}`}>
              {modeLabel}
            </span>
            {hasContext && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-blue-900/60 text-blue-200 border border-blue-700/40">
                ctx {fmt(contextWindow!.startTime)} — {fmt(contextWindow!.endTime)}
              </span>
            )}
          </div>
          <button
            onClick={() => { stopPreview(); onClose(); }}
            className="text-zinc-500 hover:text-zinc-200 transition-colors text-base leading-none"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          {/* Timeline diagram */}
          <div className="bg-zinc-900/60 rounded px-3 pt-2 pb-4 border border-zinc-800">
            <p className="text-[10px] text-zinc-400 mb-2">
              {hasContext
                ? 'The model generates audio for the Select Window, conditioned on the Context Window.'
                : 'The model generates audio from silence for the Select Window.'}
            </p>
            <div className="relative w-full" style={{ height: '52px' }}>
              {/* Track labels on left */}
              {hasContext && (
                <span className="absolute left-0 text-[8px] text-blue-300 leading-none" style={{ top: '4px' }}>
                  Context
                </span>
              )}
              <span className={`absolute left-0 text-[8px] leading-none ${hasContext ? 'text-teal-300' : 'text-violet-300'}`} style={{ top: hasContext ? '24px' : '14px' }}>
                Select
              </span>
              {/* Timeline area — inset to leave room for labels */}
              <div className="absolute right-0" style={{ left: '44px', top: '0', bottom: '12px' }}>
                {/* Base bar */}
                <div className="absolute inset-x-0 bg-zinc-700 rounded" style={{ top: '50%', height: '2px', transform: 'translateY(-50%)' }} />
                {/* Context window (blue) */}
                {hasContext && (
                  <div
                    className="absolute rounded bg-blue-600/50 border border-blue-500/70"
                    style={{
                      left: pct(contextWindow!.startTime),
                      width: pct(contextWindow!.endTime - contextWindow!.startTime),
                      top: '2px',
                      height: '16px',
                    }}
                  />
                )}
                {/* Select window (teal or violet) */}
                <div
                  className={`absolute rounded border ${hasContext ? 'bg-teal-600/50 border-teal-500/70' : 'bg-violet-600/50 border-violet-500/70'}`}
                  style={{
                    left: pct(selStart),
                    width: pct(selEnd - selStart),
                    top: hasContext ? '22px' : '10px',
                    height: '16px',
                  }}
                />
              </div>
              {/* Time axis labels */}
              <span className="absolute text-[8px] text-zinc-600 bottom-0" style={{ left: '44px' }}>0s</span>
              <span className="absolute right-0 text-[8px] text-zinc-600 bottom-0">{project.totalDuration.toFixed(0)}s</span>
            </div>
            {/* Legend */}
            <div className="flex items-center gap-3 mt-1">
              {hasContext && (
                <span className="flex items-center gap-1 text-[8px] text-blue-300">
                  <span className="inline-block w-3 h-2 rounded-sm bg-blue-600/60 border border-blue-500/70" />
                  Context Window ({fmt(contextWindow!.startTime)} — {fmt(contextWindow!.endTime)})
                </span>
              )}
              <span className={`flex items-center gap-1 text-[8px] ${hasContext ? 'text-teal-300' : 'text-violet-300'}`}>
                <span className={`inline-block w-3 h-2 rounded-sm border ${hasContext ? 'bg-teal-600/60 border-teal-500/70' : 'bg-violet-600/60 border-violet-500/70'}`} />
                Select Window ({fmt(selStart)} — {fmt(selEnd)})
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

          {/* Select window — adjustable range slider */}
          <div className="bg-zinc-900/60 rounded px-3 pt-2 pb-3 border border-zinc-800">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-medium text-zinc-300">{track.displayName}</span>
              <span className="text-[10px] text-zinc-600">Select window</span>
            </div>
            <DualRangeSlider
              min={0}
              max={project.totalDuration}
              startValue={selStart}
              endValue={selEnd}
              onChange={handleRangeChange}
              minSpan={0.5}
              step={0.1}
            />
          </div>

          {/* Local caption */}
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">
              Track description
              <span className="ml-1 normal-case font-normal text-zinc-600">(local caption)</span>
            </label>
            <textarea
              value={localCaption}
              onChange={(e) => setLocalCaption(e.target.value)}
              placeholder={`Describe the ${track.displayName} sound…`}
              rows={3}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-daw-accent"
            />
          </div>

          {/* Global caption */}
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">
              Global song description
              <span className="ml-1 normal-case font-normal text-zinc-600">(optional)</span>
            </label>
            <textarea
              value={globalCaption}
              onChange={(e) => setGlobalCaption(e.target.value)}
              placeholder="e.g. upbeat pop song with energetic drums…"
              rows={2}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-daw-accent"
            />
          </div>

          {/* Lyrics (vocals only) */}
          {isVocal && (
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">
                Lyrics
              </label>
              <textarea
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder="Song lyrics…"
                rows={4}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-daw-accent font-mono"
              />
            </div>
          )}

          {/* Chunk mask mode */}
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
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-daw-border">
          <button
            onClick={() => { stopPreview(); onClose(); }}
            className="px-3 py-1.5 rounded text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className={`px-4 py-1.5 rounded text-xs font-medium transition-colors ${
              isGenerating
                ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                : hasContext
                  ? 'bg-teal-600 hover:bg-teal-500 text-white'
                  : 'bg-violet-600 hover:bg-violet-500 text-white'
            }`}
          >
            {isGenerating ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}
