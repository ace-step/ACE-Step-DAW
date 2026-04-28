import { useState, useEffect, useCallback, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';
import { generateFromAddLayer, generateSingleClip } from '../../services/generationPipeline';
import { toastError } from '../../hooks/useToast';
import type { ContextWindow } from '../../services/contextAudioExtractor';
import { extractContextAudioLazy } from '../../services/lazyContextAudioExtractor';
import { DualRangeSlider } from '../ui/DualRangeSlider';

const VOCAL_TRACKS = new Set(['vocals', 'backing_vocals']);

interface Props {
  trackId: string;
  startTime: number;
  duration: number;
  contextWindow: ContextWindow | null;
  onClose: () => void;
  /** When set, the modal operates in edit mode for the existing clip. */
  clipId?: string;
}

function fmt(s: number) {
  return `${s.toFixed(1)}s`;
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function AddLayerModal({ trackId, startTime, duration, contextWindow, onClose, clipId }: Props) {
  const project = useProjectStore((s) => s.project);
  const setTrackLocalCaption = useProjectStore((s) => s.setTrackLocalCaption);
  const getClipById = useProjectStore((s) => s.getClipById);
  const updateClip = useProjectStore((s) => s.updateClip);
  const removeClip = useProjectStore((s) => s.removeClip);
  const isGenerating = useGenerationStore((s) => s.isGenerating);

  const isEditMode = !!clipId;
  const existingClip = clipId ? getClipById(clipId) : null;

  const track = project?.tracks.find((t) => t.id === trackId);
  const isVocal = track ? VOCAL_TRACKS.has(track.trackName) : false;

  const defaultLocalCaption = track?.localCaption ?? track?.displayName ?? '';

  const [selStart, setSelStart] = useState(startTime);
  const [selEnd, setSelEnd] = useState(startTime + duration);
  const [localCaption, setLocalCaption] = useState(defaultLocalCaption);
  const [globalCaption, setGlobalCaption] = useState(project?.globalCaption ?? '');
  const [lyrics, setLyrics] = useState('');
  const [chunkMaskMode, setChunkMaskMode] = useState<'auto' | 'explicit'>('auto');

  // Advanced options (collapsed by default)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sampleMode, setSampleMode] = useState(false);
  const [autoExpandPrompt, setAutoExpandPrompt] = useState(true);
  const [seedValue, setSeedValue] = useState('');

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

  useEffect(() => stopPreview, [stopPreview]);

  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); stopPreview(); onClose(); }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose, stopPreview]);

  const handlePreviewContext = useCallback(async () => {
    if (previewState === 'playing') { stopPreview(); return; }
    if (!contextWindow) return;
    setPreviewState('loading');
    try {
      // trimToContext: blob spans [0, ctxDuration] with no leading silence
      const blob = await extractContextAudioLazy(contextWindow, { trimToContext: true });
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

  // Initialize / reset form when props change
  useEffect(() => {
    if (isEditMode && existingClip) {
      setSelStart(existingClip.startTime);
      setSelEnd(existingClip.startTime + existingClip.duration);
      setLocalCaption(existingClip.prompt || defaultLocalCaption);
      setGlobalCaption(existingClip.globalCaption || project?.globalCaption || '');
      setLyrics(existingClip.lyrics || '');
      setSampleMode(existingClip.sampleMode ?? false);
      setAutoExpandPrompt(existingClip.autoExpandPrompt ?? true);
      setSeedValue('');
    } else {
      setSelStart(startTime);
      setSelEnd(startTime + duration);
      setLocalCaption(defaultLocalCaption);
      setGlobalCaption(project?.globalCaption ?? '');
      setLyrics('');
      setSeedValue('');
    }
  }, [clipId, trackId, startTime, duration]);

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

  const parsedSeed = seedValue.trim() ? parseInt(seedValue, 10) : undefined;

  const handleSave = () => {
    if (!isEditMode || !clipId) return;
    stopPreview();
    updateClip(clipId, {
      prompt: localCaption,
      globalCaption,
      lyrics: isVocal ? lyrics : '',
      startTime: Math.max(0, selStart),
      duration: Math.max(0.5, selEnd - selStart),
      sampleMode,
      autoExpandPrompt,
      generationParams: {
        type: 'lego',
        prompt: localCaption,
        lyrics: isVocal ? lyrics : '',
        globalCaption,
        sampleMode,
        autoExpandPrompt,
      },
    });
    if (localCaption !== (track.localCaption ?? '')) {
      setTrackLocalCaption(trackId, localCaption);
    }
    onClose();
  };

  const handleGenerate = async () => {
    stopPreview();
    if (localCaption !== (track.localCaption ?? '')) {
      setTrackLocalCaption(trackId, localCaption);
    }
    onClose();

    try {
      if (isEditMode && clipId) {
        updateClip(clipId, {
          prompt: localCaption,
          globalCaption,
          lyrics: isVocal ? lyrics : '',
          startTime: Math.max(0, selStart),
          duration: Math.max(0.5, selEnd - selStart),
          sampleMode,
          autoExpandPrompt,
          generationParams: {
            type: 'lego',
            prompt: localCaption,
            lyrics: isVocal ? lyrics : '',
            globalCaption,
            sampleMode,
            autoExpandPrompt,
          },
        });
        await generateSingleClip(clipId, parsedSeed !== undefined ? { sharedSeed: parsedSeed } : undefined);
      } else {
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
      }
    } catch {
      toastError('Generation failed — please try again');
    }
  };

  const handleDelete = () => {
    if (!clipId) return;
    stopPreview();
    removeClip(clipId);
    onClose();
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
            <span className="text-sm font-semibold text-white">
              {isEditMode ? 'Edit Clip' : 'Add Layer'}
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${modeBadgeClass}`}>
              {modeLabel}
            </span>
            {hasContext && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-900/60 text-blue-200 border border-blue-700/40">
                ctx {fmt(contextWindow!.startTime)} — {fmt(contextWindow!.endTime)}
              </span>
            )}
          </div>
          <button
            onClick={() => { stopPreview(); onClose(); }}
            className="text-zinc-400 hover:text-zinc-200 transition-colors text-base leading-none"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          {/* Timeline diagram */}
          <div className="bg-[#222]/60 rounded px-3 pt-2 pb-4 border border-[#3a3a3a]">
            <p className="text-[10px] text-zinc-400 mb-2">
              {hasContext
                ? 'The model generates audio for the Select Window, conditioned on the Context Window.'
                : 'The model generates audio from silence for the Select Window.'}
            </p>
            <div className="relative w-full" style={{ height: '52px' }}>
              {hasContext && (
                <span className="absolute left-0 text-[8px] text-blue-300 leading-none" style={{ top: '4px' }}>
                  Context
                </span>
              )}
              <span className={`absolute left-0 text-[8px] leading-none ${hasContext ? 'text-teal-300' : 'text-violet-300'}`} style={{ top: hasContext ? '24px' : '14px' }}>
                Select
              </span>
              <div className="absolute right-0" style={{ left: '44px', top: '0', bottom: '12px' }}>
                <div className="absolute inset-x-0 bg-[#444] rounded" style={{ top: '50%', height: '2px', transform: 'translateY(-50%)' }} />
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
              <span className="absolute text-[8px] text-zinc-600 bottom-0" style={{ left: '44px' }}>0s</span>
              <span className="absolute right-0 text-[8px] text-zinc-600 bottom-0">{project.totalDuration.toFixed(0)}s</span>
            </div>
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
              <span className="text-[10px] font-mono text-blue-300 shrink-0 w-[60px] text-right">
                {fmtTime(previewCurrentTime)} / {fmtTime(previewDuration)}
              </span>
            </div>
          )}

          {/* Select window — adjustable range slider */}
          <div className="bg-[#222]/60 rounded px-3 pt-2 pb-3 border border-[#3a3a3a]">
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
          {!sampleMode && (
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
                className="w-full bg-[#222] border border-[#444] rounded px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-daw-accent"
              />
            </div>
          )}

          {sampleMode && (
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">
                Description
              </label>
              <textarea
                value={localCaption}
                onChange={(e) => setLocalCaption(e.target.value)}
                placeholder="Describe the sample you want…"
                rows={3}
                className="w-full bg-[#222] border border-[#444] rounded px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-daw-accent"
              />
            </div>
          )}

          {/* Global caption */}
          {!sampleMode && (
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
                className="w-full bg-[#222] border border-[#444] rounded px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-daw-accent"
              />
            </div>
          )}

          {/* Lyrics (vocals only, hidden in sample mode) */}
          {isVocal && !sampleMode && (
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">
                Lyrics
              </label>
              <textarea
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder="Song lyrics…"
                rows={4}
                className="w-full bg-[#222] border border-[#444] rounded px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-daw-accent font-mono"
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
                  : 'bg-[#333] border-[#444] text-zinc-400'
              }`}
            >
              {chunkMaskMode === 'auto' ? 'Auto (model decides)' : 'Explicit (select window only)'}
            </button>
          </div>

          {/* Advanced options (collapsed) */}
          <div className="border-t border-[#3a3a3a] pt-2">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-[10px] text-zinc-400 hover:text-zinc-300 transition-colors"
            >
              {showAdvanced ? '▾' : '▸'} Advanced options
            </button>
            {showAdvanced && (
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sampleMode}
                      onChange={(e) => setSampleMode(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-[#444] bg-[#222] accent-daw-accent"
                    />
                    <span className="text-[10px] text-zinc-400">Sample Mode</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoExpandPrompt}
                      onChange={(e) => setAutoExpandPrompt(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-[#444] bg-[#222] accent-daw-accent"
                    />
                    <span className="text-[10px] text-zinc-400">Auto-expand prompt</span>
                  </label>
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 mb-1">Seed (optional)</label>
                  <input
                    type="number"
                    value={seedValue}
                    onChange={(e) => setSeedValue(e.target.value)}
                    placeholder="Leave empty for random"
                    className="w-full bg-[#222] border border-[#444] rounded px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-daw-accent"
                  />
                  <p className="mt-1 text-[10px] text-zinc-600">
                    Project: {project.bpm} BPM · {project.keyScale} · {project.timeSignature}/4
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Inferred metadata (edit mode only, when clip has been generated) */}
          {isEditMode && existingClip?.generationStatus === 'ready' && existingClip.inferredMetas && (
            <div className="border-t border-[#3a3a3a] pt-2">
              <p className="text-[10px] text-zinc-400 mb-1.5">Inferred by ACE-Step</p>
              <div className="grid grid-cols-3 gap-x-3 gap-y-1">
                {existingClip.inferredMetas.bpm != null && (
                  <div>
                    <span className="text-[10px] text-zinc-400">BPM</span>
                    <p className="text-[10px] text-zinc-300">{existingClip.inferredMetas.bpm}</p>
                  </div>
                )}
                {existingClip.inferredMetas.keyScale && (
                  <div>
                    <span className="text-[10px] text-zinc-400">Key</span>
                    <p className="text-[10px] text-zinc-300">{existingClip.inferredMetas.keyScale}</p>
                  </div>
                )}
                {existingClip.inferredMetas.timeSignature && (
                  <div>
                    <span className="text-[10px] text-zinc-400">Time Sig</span>
                    <p className="text-[10px] text-zinc-300">{existingClip.inferredMetas.timeSignature}</p>
                  </div>
                )}
                {existingClip.inferredMetas.genres && (
                  <div>
                    <span className="text-[10px] text-zinc-400">Genres</span>
                    <p className="text-[10px] text-zinc-300 truncate">{existingClip.inferredMetas.genres}</p>
                  </div>
                )}
                {existingClip.inferredMetas.seed && (
                  <div>
                    <span className="text-[10px] text-zinc-400">Seed</span>
                    <p className="text-[10px] text-zinc-300 truncate">{existingClip.inferredMetas.seed}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-daw-border">
          {isEditMode ? (
            <>
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors"
              >
                Delete Clip
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSave}
                  className="px-4 py-1.5 text-xs font-medium bg-[#333] hover:bg-[#444] text-zinc-300 rounded transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className={`px-4 py-1.5 rounded text-xs font-medium transition-colors ${
                    isGenerating
                      ? 'bg-[#444] text-zinc-400 cursor-not-allowed'
                      : hasContext
                        ? 'bg-teal-600 hover:bg-teal-500 text-white'
                        : 'bg-violet-600 hover:bg-violet-500 text-white'
                  }`}
                >
                  {isGenerating ? 'Generating…' : 'Generate'}
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => { stopPreview(); onClose(); }}
                className="px-3 py-1.5 rounded text-xs font-medium bg-[#333] hover:bg-[#444] text-zinc-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className={`px-4 py-1.5 rounded text-xs font-medium transition-colors ${
                  isGenerating
                    ? 'bg-[#444] text-zinc-400 cursor-not-allowed'
                    : hasContext
                      ? 'bg-teal-600 hover:bg-teal-500 text-white'
                      : 'bg-violet-600 hover:bg-violet-500 text-white'
                }`}
              >
                {isGenerating ? 'Generating…' : 'Generate'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
