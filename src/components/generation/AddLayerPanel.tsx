import { useState, useEffect, useCallback, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';
import { useUIStore } from '../../store/uiStore';
import { generateFromAddLayer } from '../../services/generationPipeline';
import { extractContextAudioLazy } from '../../services/lazyContextAudioExtractor';
import type { TrackName } from '../../types/project';

const VOCAL_TRACK_NAMES = new Set<string>(['vocals', 'backing_vocals']);

const LAYER_TYPES = [
  { id: 'song', label: 'Song Track', trackName: 'custom' as TrackName },
  { id: 'vocal', label: 'Vocal', trackName: 'vocals' as TrackName, showLyrics: true },
  { id: 'backing', label: 'Backing', trackName: 'backing_vocals' as TrackName, showLyrics: true },
  { id: 'custom', label: 'Custom', trackName: 'custom' as TrackName },
] as const;

type LayerTypeId = (typeof LAYER_TYPES)[number]['id'];

function fmt(s: number) {
  return `${s.toFixed(1)}s`;
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function AddLayerPanel() {
  const isOpen = useUIStore((s) => s.addLayerOpen);
  const setAddLayerOpen = useUIStore((s) => s.setAddLayerOpen);
  const selectWindow = useUIStore((s) => s.selectWindow);
  const contextWindow = useUIStore((s) => s.contextWindow);

  const project = useProjectStore((s) => s.project);
  const addTrack = useProjectStore((s) => s.addTrack);
  const setTrackLocalCaption = useProjectStore((s) => s.setTrackLocalCaption);
  const isGenerating = useGenerationStore((s) => s.isGenerating);

  const [layerType, setLayerType] = useState<LayerTypeId>('song');
  const [style, setStyle] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [globalCaption, setGlobalCaption] = useState('');

  // Advanced options
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [chunkMaskMode, setChunkMaskMode] = useState<'auto' | 'explicit'>('auto');
  const [sampleMode, setSampleMode] = useState(false);
  const [autoExpandPrompt, setAutoExpandPrompt] = useState(true);
  const [seedValue, setSeedValue] = useState('');

  // Context audio preview
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

  const handleClose = useCallback(() => {
    stopPreview();
    setAddLayerOpen(false);
  }, [stopPreview, setAddLayerOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, handleClose]);

  // Reset form when panel opens
  useEffect(() => {
    if (isOpen) {
      setStyle('');
      setLyrics('');
      setGlobalCaption(project?.globalCaption ?? '');
      setSeedValue('');
      setSampleMode(false);
      setAutoExpandPrompt(true);
      setChunkMaskMode('auto');
    }
  }, [isOpen, project?.globalCaption]);

  const handlePreviewContext = useCallback(async () => {
    if (previewState === 'playing') { stopPreview(); return; }
    if (!contextWindow) return;
    setPreviewState('loading');
    try {
      const blob = await extractContextAudioLazy(contextWindow);
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

  if (!isOpen || !project) return null;

  const selectedLayerType = LAYER_TYPES.find((lt) => lt.id === layerType)!;
  const showLyrics = 'showLyrics' in selectedLayerType && selectedLayerType.showLyrics;
  const hasContext = contextWindow !== null;

  const startTime = selectWindow?.startTime ?? 0;
  const endTime = selectWindow?.endTime ?? project.totalDuration;
  const duration = endTime - startTime;

  const parsedSeed = seedValue.trim() ? parseInt(seedValue, 10) : undefined;

  const handleSelectWholeSong = () => {
    useUIStore.getState().setSelectWindow({
      startTime: 0,
      endTime: project.totalDuration,
      trackIds: selectWindow?.trackIds ?? [],
    });
  };

  const handleGenerate = async () => {
    stopPreview();

    // Prefer the track the user actually selected via selectWindow;
    // fall back to finding/creating a track by layer type name (#590)
    let targetTrack: typeof project.tracks[number] | undefined;
    if (selectWindow && selectWindow.trackIds.length > 0) {
      targetTrack = project.tracks.find((t) => selectWindow.trackIds.includes(t.id));
    }
    if (!targetTrack) {
      const targetTrackName = selectedLayerType.trackName;
      targetTrack = project.tracks.find((t) => t.trackName === targetTrackName);
      if (!targetTrack) {
        targetTrack = addTrack(targetTrackName, 'stems');
      }
    }

    if (style) {
      setTrackLocalCaption(targetTrack.id, style);
    }

    handleClose();

    await generateFromAddLayer({
      trackId: targetTrack.id,
      startTime,
      duration,
      localDescription: style,
      globalCaption,
      lyrics: showLyrics ? lyrics : '',
      contextWindow: hasContext ? contextWindow : null,
      chunkMaskMode,
    });
  };

  return (
    <div
      data-testid="add-layer-panel"
      className="fixed left-1/2 -translate-x-1/2 bottom-[60px] w-[420px] max-h-[70vh] flex flex-col bg-[#1e1e22] border border-[#3a3a3a] rounded-xl shadow-2xl text-xs text-zinc-200"
      style={{ zIndex: 60 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#3a3a3a]">
        <span className="text-sm font-semibold text-white">Add a Layer</span>
        <button
          onClick={handleClose}
          className="text-zinc-400 hover:text-zinc-200 transition-colors text-base leading-none"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {/* Selection display */}
        <div>
          <div className="text-zinc-400 text-xs">
            Selection: {fmt(startTime)} - {fmt(endTime)}
          </div>
          {(startTime > 0 || endTime < project.totalDuration) && (
            <button
              onClick={handleSelectWholeSong}
              className="text-teal-400 hover:text-teal-300 text-[11px] mt-0.5 transition-colors"
            >
              + Select the whole song
            </button>
          )}
        </div>

        {/* Layer Type */}
        <div>
          <label className="text-[10px] uppercase tracking-wide text-zinc-500 block mb-1.5">
            Layer Type
          </label>
          <div className="flex gap-1.5 flex-wrap">
            {LAYER_TYPES.map((lt) => (
              <button
                key={lt.id}
                onClick={() => setLayerType(lt.id)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${
                  layerType === lt.id
                    ? 'bg-teal-600 text-white'
                    : 'bg-[#2a2a2a] text-zinc-400 hover:text-zinc-300 hover:bg-[#333]'
                }`}
              >
                {lt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Style */}
        {!sampleMode && (
          <div>
            <label className="text-[10px] uppercase tracking-wide text-zinc-500 block mb-1">
              Style
            </label>
            <textarea
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="Describe the sound..."
              rows={2}
              className="w-full bg-[#161618] border border-[#333] rounded-lg px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-teal-600"
            />
          </div>
        )}

        {sampleMode && (
          <div>
            <label className="text-[10px] uppercase tracking-wide text-zinc-500 block mb-1">
              Description
            </label>
            <textarea
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="Describe the sample you want..."
              rows={2}
              className="w-full bg-[#161618] border border-[#333] rounded-lg px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-teal-600"
            />
          </div>
        )}

        {/* Lyrics (vocal types only) */}
        {showLyrics && !sampleMode && (
          <div>
            <label className="text-[10px] uppercase tracking-wide text-zinc-500 block mb-1">
              Lyrics
            </label>
            <textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="Song lyrics..."
              rows={3}
              className="w-full bg-[#161618] border border-[#333] rounded-lg px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-teal-600 font-mono"
            />
          </div>
        )}

        {/* Advanced section */}
        <div className="border-t border-[#3a3a3a] pt-2">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-zinc-500 hover:text-zinc-300 text-[11px] transition-colors"
          >
            {showAdvanced ? '\u25BE' : '\u25B8'} Advanced
          </button>
          {showAdvanced && (
            <div className="mt-2 space-y-2.5">
              {/* Context window info */}
              {hasContext && (
                <div>
                  <label className="text-[10px] uppercase tracking-wide text-zinc-500 block mb-1">
                    Context
                  </label>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-950/50 border border-blue-800/40">
                    <button
                      onClick={handlePreviewContext}
                      disabled={previewState === 'loading'}
                      className="w-6 h-6 flex items-center justify-center rounded bg-blue-800/60 hover:bg-blue-700/60 text-blue-200 text-[10px] disabled:opacity-50 shrink-0 transition-colors"
                      title={previewState === 'playing' ? 'Stop preview' : 'Preview context audio'}
                    >
                      {previewState === 'loading' ? '\u2026' : previewState === 'playing' ? '\u25A0' : '\u25B6'}
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
                  <span className="text-[10px] text-blue-300 mt-1 block">
                    {fmt(contextWindow.startTime)} — {fmt(contextWindow.endTime)}
                  </span>
                </div>
              )}
              {!hasContext && (
                <div className="text-[10px] text-zinc-500">
                  Context: none (Alt+drag on timeline to set)
                </div>
              )}

              {/* Mask mode */}
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-zinc-500">Mask mode:</label>
                <div className="flex gap-1">
                  <button
                    onClick={() => setChunkMaskMode('auto')}
                    className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                      chunkMaskMode === 'auto'
                        ? 'bg-teal-900/50 border-teal-700/50 text-teal-300'
                        : 'bg-[#2a2a2a] border-[#3a3a3a] text-zinc-500 hover:text-zinc-400'
                    }`}
                  >
                    Auto
                  </button>
                  <button
                    onClick={() => setChunkMaskMode('explicit')}
                    className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                      chunkMaskMode === 'explicit'
                        ? 'bg-teal-900/50 border-teal-700/50 text-teal-300'
                        : 'bg-[#2a2a2a] border-[#3a3a3a] text-zinc-500 hover:text-zinc-400'
                    }`}
                  >
                    Explicit
                  </button>
                </div>
              </div>

              {/* Checkboxes */}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sampleMode}
                    onChange={(e) => setSampleMode(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-[#444] bg-[#222] accent-teal-600"
                  />
                  <span className="text-[10px] text-zinc-400">Sample mode</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoExpandPrompt}
                    onChange={(e) => setAutoExpandPrompt(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-[#444] bg-[#222] accent-teal-600"
                  />
                  <span className="text-[10px] text-zinc-400">Auto-expand prompt</span>
                </label>
              </div>

              {/* Seed */}
              <div>
                <label className="text-[10px] text-zinc-500 block mb-1">Seed</label>
                <input
                  type="number"
                  value={seedValue}
                  onChange={(e) => setSeedValue(e.target.value)}
                  placeholder="Leave empty for random"
                  className="w-full bg-[#161618] border border-[#333] rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-teal-600"
                />
              </div>

              {/* Global caption */}
              {!sampleMode && (
                <div>
                  <label className="text-[10px] text-zinc-500 block mb-1">Global caption</label>
                  <textarea
                    value={globalCaption}
                    onChange={(e) => setGlobalCaption(e.target.value)}
                    placeholder="e.g. upbeat pop song with energetic drums..."
                    rows={2}
                    className="w-full bg-[#161618] border border-[#333] rounded-lg px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-teal-600"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[#3a3a3a]">
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className={`w-full py-2.5 rounded-lg text-xs font-medium transition-colors ${
            isGenerating
              ? 'bg-[#444] text-zinc-400 cursor-not-allowed'
              : 'bg-teal-600 hover:bg-teal-500 text-white'
          }`}
        >
          {isGenerating ? 'Generating\u2026' : 'Generate'}
        </button>
      </div>
    </div>
  );
}
