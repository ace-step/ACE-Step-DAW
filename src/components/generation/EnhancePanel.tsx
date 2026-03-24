import { useState, useEffect, useCallback, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';
import { useUIStore, getBottomPanelHeight } from '../../store/uiStore';
import { generateCoverClip } from '../../services/generationPipeline';
import { generateRepaintClip } from '../../services/generationPipeline';
import { modelSupportsTaskType } from '../../services/aceStepApi';
import { DualRangeSlider } from '../ui/DualRangeSlider';
import { Z } from '../../utils/zIndex';
import { WaveformPreview } from './WaveformPreview';
import { WaveformRangeSelector } from './WaveformRangeSelector';
import { useEnhancePlayback } from '../../hooks/useEnhancePlayback';
import { computeWaveformPeaks } from '../../utils/waveformPeaks';
import type { RepaintMode } from '../../types/api';
import { ENHANCE_PRESETS, surpriseMe } from '../../constants/enhancePresets';

const ENHANCER_BASE_BOTTOM = 60;

type ConsistencyLevel = 'low' | 'medium' | 'high';
const CONSISTENCY_VALUES: Record<ConsistencyLevel, number> = {
  low: 0.25,
  medium: 0.5,
  high: 0.75,
};

function fmt(s: number) {
  const val = Number.isFinite(s) ? s : 0;
  return `${val.toFixed(2)}s`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface SessionEntry {
  id: string;
  label: string;
  timestamp: number;
}

interface ResultEntry {
  id: string;
  clipId: string;
  audioKey: string;
  title: string;
  duration: string;
  durationSec: number;
  peaks: number[];
  timestamp: number;
}

type ABSide = 'A' | 'B';

export function EnhancePanel() {
  const enhancerOpen = useUIStore((s) => s.enhancerOpen);
  const enhancerTarget = useUIStore((s) => s.enhancerTarget);
  const closeEnhancer = useUIStore((s) => s.closeEnhancer);
  const isGenerating = useGenerationStore((s) => s.isGenerating);
  const getClipById = useProjectStore((s) => s.getClipById);
  const project = useProjectStore((s) => s.project);
  const bottomPanelHeight = useUIStore(getBottomPanelHeight);
  const dynamicBottom = ENHANCER_BASE_BOTTOM + bottomPanelHeight;

  const clip = enhancerTarget ? getClipById(enhancerTarget.clipId) : null;
  const track = enhancerTarget
    ? project?.tracks.find((t) => t.id === enhancerTarget.trackId) ?? null
    : null;

  // Local mode state — initialized from enhancerTarget.mode but user can toggle
  const [mode, setMode] = useState<'cover' | 'repaint'>('cover');

  // Cover fields
  const [caption, setCaption] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [consistency, setConsistency] = useState<ConsistencyLevel>('medium');
  const [createNew, setCreateNew] = useState(true);

  // Repaint fields
  const [selStart, setSelStart] = useState(0);
  const [selEnd, setSelEnd] = useState(0);
  const [prompt, setPrompt] = useState('');
  const [globalCaption, setGlobalCaption] = useState('');
  const [repaintMode, setRepaintMode] = useState<RepaintMode>('balanced');
  const [repaintStrength, setRepaintStrength] = useState(0.5);

  // Sessions & results
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const sessionCounterRef = useRef(0);

  // A/B comparison
  const [abSide, setAbSide] = useState<ABSide>('A');
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);

  // Mini player selected index
  const [miniPlayerIdx, setMiniPlayerIdx] = useState(0);

  // Quick Styles section
  const [quickStylesOpen, setQuickStylesOpen] = useState(false);

  // Playback
  const playback = useEnhancePlayback();

  // Source audio key
  const sourceAudioKey = clip?.isolatedAudioKey || clip?.cumulativeMixKey || '';

  // Initialize form when enhancerTarget changes
  useEffect(() => {
    if (enhancerTarget && clip) {
      setMode(enhancerTarget.mode);

      // Cover fields
      setCaption(clip.prompt ?? '');
      setLyrics(clip.lyrics ?? '');
      setConsistency('medium');
      setCreateNew(true);

      // Repaint fields
      const clipStart = clip.startTime ?? 0;
      const clipEnd = (clip.startTime ?? 0) + (clip.duration ?? 0);
      const rangeStart = enhancerTarget.range?.start ?? clipStart;
      const rangeEnd = enhancerTarget.range?.end ?? clipEnd;
      setSelStart(rangeStart);
      setSelEnd(rangeEnd);
      setPrompt(clip.prompt ?? '');
      setGlobalCaption(clip.globalCaption ?? project?.globalCaption ?? '');
      setRepaintMode('balanced');
      setRepaintStrength(0.5);

      // Create initial session
      const sessionId = `session-${Date.now()}`;
      sessionCounterRef.current = 1;
      setSessions([{
        id: sessionId,
        label: 'Enhancement 1',
        timestamp: Date.now(),
      }]);
      setActiveSessionId(sessionId);
      setResults([]);
      setAbSide('A');
      setSelectedResultId(null);
      setMiniPlayerIdx(0);
    }
  }, [enhancerTarget?.clipId]);

  // Stop playback when panel closes
  useEffect(() => {
    if (!enhancerOpen) {
      playback.stopPlayback();
    }
  }, [enhancerOpen, playback.stopPlayback]);

  // Escape to close
  useEffect(() => {
    if (!enhancerOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeEnhancer(); }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [enhancerOpen, closeEnhancer]);

  const handleNewSession = useCallback(() => {
    sessionCounterRef.current += 1;
    const sessionId = `session-${Date.now()}`;
    const entry: SessionEntry = {
      id: sessionId,
      label: `Enhancement ${sessionCounterRef.current}`,
      timestamp: Date.now(),
    };
    setSessions((prev) => [entry, ...prev]);
    setActiveSessionId(sessionId);
    if (clip) {
      setCaption(clip.prompt ?? '');
      setLyrics(clip.lyrics ?? '');
      setPrompt(clip.prompt ?? '');
    }
    setConsistency('medium');
    setRepaintMode('balanced');
    setRepaintStrength(0.5);
    setResults([]);
    setSelectedResultId(null);
    setMiniPlayerIdx(0);
  }, [clip]);

  const handleRangeChange = useCallback((s: number, e: number) => {
    setSelStart(s);
    setSelEnd(e);
  }, []);

  // Cover generation
  const handleCoverGenerate = useCallback(async () => {
    if (!enhancerTarget || isGenerating) return;
    const coverStrength = CONSISTENCY_VALUES[consistency];
    const resultId = `result-${Date.now()}`;
    setResults((prev) => [...prev, {
      id: resultId,
      clipId: enhancerTarget.clipId,
      audioKey: '',
      title: caption || 'Untitled enhancement',
      duration: '--:--',
      durationSec: 0,
      peaks: [],
      timestamp: Date.now(),
    }]);
    await generateCoverClip({
      clipId: enhancerTarget.clipId,
      caption,
      lyrics,
      coverStrength,
      createNew,
    });
    // After generation, try to load the result audio to get peaks/duration
    await finalizeResult(resultId, enhancerTarget.clipId);
  }, [enhancerTarget, caption, lyrics, consistency, createNew, isGenerating]);

  // Repaint generation
  const handleRepaintGenerate = useCallback(async () => {
    if (!enhancerTarget || isGenerating) return;
    const resultId = `result-${Date.now()}`;
    setResults((prev) => [...prev, {
      id: resultId,
      clipId: enhancerTarget.clipId,
      audioKey: '',
      title: prompt || 'Untitled repaint',
      duration: '--:--',
      durationSec: 0,
      peaks: [],
      timestamp: Date.now(),
    }]);
    await generateRepaintClip({
      clipId: enhancerTarget.clipId,
      repaintStart: selStart,
      repaintEnd: selEnd,
      prompt,
      globalCaption: globalCaption || undefined,
      repaintMode,
      repaintStrength,
    });
    await finalizeResult(resultId, enhancerTarget.clipId);
  }, [enhancerTarget, selStart, selEnd, prompt, globalCaption, repaintMode, repaintStrength, isGenerating]);

  // After generation, load the new clip's audio to compute peaks and duration
  const finalizeResult = useCallback(async (resultId: string, originalClipId: string) => {
    // The generation pipeline creates a new clip or updates the existing one
    // Re-read the clip from the store to get the new audio key
    const updatedClip = useProjectStore.getState().getClipById(originalClipId);
    const audioKey = updatedClip?.isolatedAudioKey || updatedClip?.cumulativeMixKey || '';
    if (!audioKey) return;

    try {
      const buffer = await playback.loadBuffer(audioKey);
      if (!buffer) return;
      const peaks = computeWaveformPeaks(buffer, 60);
      const dur = buffer.duration;
      setResults((prev) => prev.map((r) =>
        r.id === resultId
          ? { ...r, audioKey, peaks, duration: formatDuration(dur), durationSec: dur }
          : r,
      ));
      // Auto-select first result
      setSelectedResultId((prev) => prev ?? resultId);
      setMiniPlayerIdx((prev) => {
        if (prev === 0) return Math.max(0, results.length); // point to new entry
        return prev;
      });
    } catch {
      // Audio decode failed — leave duration as --:--
    }
  }, [playback, results.length]);

  const handleGenerate = mode === 'cover' ? handleCoverGenerate : handleRepaintGenerate;

  // Source play handler
  const handleSourcePlay = useCallback(() => {
    if (!sourceAudioKey) return;
    playback.togglePlay('source', sourceAudioKey);
  }, [sourceAudioKey, playback]);

  const handleSourceSeek = useCallback((progress: number) => {
    if (!sourceAudioKey) return;
    playback.seek('source', sourceAudioKey, progress);
  }, [sourceAudioKey, playback]);

  // Result play handler
  const handleResultPlay = useCallback((resultId: string, audioKey: string) => {
    if (!audioKey) return;
    setSelectedResultId(resultId);
    playback.togglePlay(resultId, audioKey);
  }, [playback]);

  // A/B toggle
  const handleABToggle = useCallback(() => {
    const nextSide: ABSide = abSide === 'A' ? 'B' : 'A';
    setAbSide(nextSide);
    const selectedResult = results.find((r) => r.id === selectedResultId);

    if (nextSide === 'A' && sourceAudioKey) {
      playback.play('source', sourceAudioKey, playback.progress);
    } else if (nextSide === 'B' && selectedResult?.audioKey) {
      playback.play(selectedResult.id, selectedResult.audioKey, playback.progress);
    }
  }, [abSide, results, selectedResultId, sourceAudioKey, playback]);

  // Mini player controls
  const miniResult = results[miniPlayerIdx] ?? null;

  const handleMiniPrev = useCallback(() => {
    setMiniPlayerIdx((prev) => Math.max(0, prev - 1));
  }, []);

  const handleMiniNext = useCallback(() => {
    setMiniPlayerIdx((prev) => Math.min(results.length - 1, prev + 1));
  }, [results.length]);

  const handleMiniPlay = useCallback(() => {
    if (!miniResult?.audioKey) return;
    setSelectedResultId(miniResult.id);
    playback.togglePlay(miniResult.id, miniResult.audioKey);
  }, [miniResult, playback]);

  const handleMiniSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!miniResult?.audioKey) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setSelectedResultId(miniResult.id);
    playback.seek(miniResult.id, miniResult.audioKey, progress);
  }, [miniResult, playback]);

  if (!enhancerOpen) return null;

  // No-selection guidance screen
  if (!enhancerTarget) {
    return (
      <div
        data-testid="enhance-panel"
        className="fixed left-1/2 -translate-x-1/2 w-[780px] bg-[#1e1e22] border border-[#3a3a3a] rounded-xl shadow-2xl text-xs text-zinc-200 p-8 text-center transition-[bottom] duration-200 ease-out"
        style={{ zIndex: Z.panel, bottom: `${dynamicBottom}px` }}
      >
        <div className="flex items-center justify-between mb-6">
          <span className="text-sm font-semibold text-white">Enhance</span>
          <button
            data-testid="enhance-close-btn"
            onClick={closeEnhancer}
            className="text-zinc-400 hover:text-zinc-200 transition-colors text-base leading-none"
          >
            ✕
          </button>
        </div>
        <svg className="w-10 h-10 text-zinc-600 mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="4 2" />
          <path d="M8 12h8M12 8v8" strokeLinecap="round" />
        </svg>
        <p className="text-zinc-400 text-[13px] mb-1">First, create a selection on the canvas</p>
        <p className="text-zinc-600 text-[11px]">Use Cmd/Ctrl+drag on the timeline to select a region, or right-click a clip</p>
        <div className="mt-6">
          <button
            onClick={closeEnhancer}
            className="px-5 py-2 rounded-lg bg-[#2a2a2e] hover:bg-[#333338] text-zinc-300 text-[11px] font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const hasAudio = !!(clip?.isolatedAudioKey || clip?.cumulativeMixKey);
  const coverSupported = modelSupportsTaskType('cover');
  const repaintSupported = modelSupportsTaskType('repaint');
  const modeSupported = mode === 'cover' ? coverSupported : repaintSupported;
  const canGenerate = hasAudio && modeSupported && !isGenerating && !!(clip && track);

  const clipStart = clip?.startTime ?? 0;
  const clipEnd = (clip?.startTime ?? 0) + (clip?.duration ?? 0);
  const totalDur = project?.totalDuration ?? clipEnd;

  // Accent colors per mode
  const accentColor = mode === 'cover' ? '#14b8a6' : '#f43f5e';
  const accentBg = mode === 'cover' ? 'bg-teal-600' : 'bg-rose-600';
  const accentBgHover = mode === 'cover' ? 'hover:bg-teal-500' : 'hover:bg-rose-500';

  // Source waveform peaks
  const sourcePeaks = clip?.waveformPeaks ?? [];
  const sourceIsPlaying = playback.playingId === 'source';
  const sourceProgress = sourceIsPlaying ? playback.progress : 0;

  // A/B: determine which side has a valid result
  const selectedResult = results.find((r) => r.id === selectedResultId);
  const canAB = hasAudio && !!selectedResult?.audioKey;

  // Mini player progress
  const miniIsPlaying = miniResult ? playback.playingId === miniResult.id : false;
  const miniProgress = miniIsPlaying ? playback.progress : 0;

  return (
    <div
      data-testid="enhance-panel"
      className="fixed left-1/2 -translate-x-1/2 w-[820px] max-h-[60vh] bg-[#1e1e22] border border-[#3a3a3a] rounded-xl shadow-2xl flex text-xs text-zinc-200 overflow-hidden transition-[bottom] duration-200 ease-out"
      style={{ zIndex: Z.panel, bottom: `${dynamicBottom}px` }}
    >
      {/* Left Sidebar — Session History */}
      <div data-testid="enhance-history" className="w-[150px] min-w-[150px] border-r border-[#3a3a3a] flex flex-col bg-[#1a1a1e]">
        <div className="px-3 pt-3 pb-2">
          <button
            data-testid="enhance-new-session-btn"
            onClick={handleNewSession}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#2a2a2e] hover:bg-[#333338] text-zinc-300 text-[11px] font-medium transition-colors"
          >
            <span className="text-sm leading-none">+</span>
            New Enhance
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-1.5 pb-2 space-y-0.5">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSessionId(s.id)}
              className={`w-full text-left px-2.5 py-2 rounded-md text-[11px] transition-colors truncate ${
                s.id === activeSessionId
                  ? 'bg-[#2a2a2e] text-zinc-100'
                  : 'text-zinc-500 hover:bg-[#222226] hover:text-zinc-300'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Center Panel — Controls */}
      <div data-testid="enhance-controls" className="flex-1 min-w-0 flex flex-col border-r border-[#3a3a3a]">
        {/* Header with mode toggle */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#3a3a3a]">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-white">Enhance</span>
            {/* Segmented tab toggle */}
            <div className="flex bg-[#161618] rounded-md p-0.5" data-testid="enhance-mode-toggle">
              <button
                data-testid="enhance-mode-cover"
                onClick={() => setMode('cover')}
                className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wide transition-colors ${
                  mode === 'cover'
                    ? 'bg-teal-700/60 text-teal-200'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Cover
              </button>
              <button
                data-testid="enhance-mode-repaint"
                onClick={() => setMode('repaint')}
                className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wide transition-colors ${
                  mode === 'repaint'
                    ? 'bg-rose-700/60 text-rose-200'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Repaint
              </button>
            </div>
          </div>
          <button
            data-testid="enhance-close-btn"
            onClick={closeEnhancer}
            className="text-zinc-400 hover:text-zinc-200 transition-colors text-base leading-none"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          {/* Source audio preview */}
          <div className="bg-[#161618] rounded-lg px-3 py-3 border border-[#333]">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wide">
                Source
                {canAB && (
                  <span className={`ml-1.5 ${abSide === 'A' ? 'text-teal-400 font-bold' : 'text-zinc-600'}`}>A</span>
                )}
              </p>
              {clip && (
                <span className="text-[9px] text-zinc-600 font-mono">
                  {formatDuration(clip.duration)}
                </span>
              )}
            </div>
            {clip && track ? (
              <>
                <div className="flex items-center gap-2">
                  <button
                    data-testid="source-play-btn"
                    onClick={handleSourcePlay}
                    className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors flex-shrink-0 ${
                      sourceIsPlaying
                        ? 'bg-teal-600 text-white'
                        : 'bg-[#2a2a2e] text-zinc-400 hover:text-zinc-200'
                    }`}
                    aria-label={sourceIsPlaying ? 'Stop source' : 'Play source'}
                  >
                    {sourceIsPlaying ? (
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-zinc-200 truncate">
                      {track.displayName ?? track.trackName}
                    </p>
                    <p className="text-[10px] text-zinc-500 truncate">{clip.prompt || '(no prompt)'}</p>
                  </div>
                </div>
                {/* Real waveform */}
                <div className="mt-2">
                  <WaveformPreview
                    peaks={sourcePeaks}
                    color={accentColor}
                    height={40}
                    playbackProgress={sourceProgress}
                    onSeek={hasAudio ? handleSourceSeek : undefined}
                    data-testid="source-waveform"
                  />
                </div>
              </>
            ) : (
              <p className="text-[11px] text-zinc-500">No clip found</p>
            )}
            {clip && !hasAudio && (
              <p className="text-[10px] text-amber-400 mt-2">
                No audio generated yet — generate the clip first before enhancing.
              </p>
            )}
            {!modeSupported && (
              <p className="text-[10px] text-amber-400 mt-2">
                The currently loaded model does not support {mode} generation.
              </p>
            )}
          </div>

          {/* A/B Comparison Toggle */}
          {canAB && (
            <div className="flex items-center justify-center" data-testid="ab-toggle-section">
              <button
                data-testid="ab-toggle-btn"
                onClick={handleABToggle}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[11px] font-semibold transition-colors border ${
                  abSide === 'A'
                    ? 'border-teal-500/50 bg-teal-900/30 text-teal-300'
                    : 'border-violet-500/50 bg-violet-900/30 text-violet-300'
                }`}
              >
                <span className={abSide === 'A' ? 'text-teal-300' : 'text-zinc-500'}>A</span>
                <svg className="w-3.5 h-3.5 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M7 16l5-5-5-5M17 8l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className={abSide === 'B' ? 'text-violet-300' : 'text-zinc-500'}>B</span>
              </button>
            </div>
          )}

          {/* === COVER MODE CONTROLS === */}
          {mode === 'cover' && (
            <>
              {/* Lyrics */}
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wide mb-1">
                  Lyrics
                </label>
                <textarea
                  data-testid="enhance-lyrics-input"
                  value={lyrics}
                  onChange={(e) => setLyrics(e.target.value)}
                  placeholder="Override lyrics for this enhancement..."
                  rows={3}
                  className="w-full bg-[#161618] border border-[#333] rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-teal-500/60 font-mono"
                />
              </div>

              {/* Quick Styles presets */}
              <div>
                <button
                  data-testid="quick-styles-toggle"
                  onClick={() => setQuickStylesOpen((v) => !v)}
                  className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-500 uppercase tracking-wide mb-1 hover:text-zinc-300 transition-colors"
                >
                  <svg
                    className={`w-3 h-3 transition-transform ${quickStylesOpen ? 'rotate-90' : ''}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Quick Styles
                </button>
                {quickStylesOpen && (
                  <div data-testid="quick-styles-grid" className="flex flex-wrap gap-1.5 mb-2">
                    {ENHANCE_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        data-testid={`preset-${preset.id}`}
                        onClick={() => {
                          setCaption(preset.caption);
                          setConsistency(preset.consistency);
                        }}
                        className="px-2.5 py-1 rounded-full bg-[#2a2a2e] hover:bg-[#3a3a3e] text-[10px] text-zinc-300 transition-colors whitespace-nowrap border border-[#3a3a3a] hover:border-teal-500/40"
                      >
                        {preset.icon} {preset.label}
                      </button>
                    ))}
                    <button
                      data-testid="preset-surprise-me"
                      onClick={() => {
                        const result = surpriseMe();
                        setCaption(result.caption);
                        setConsistency(result.consistency);
                      }}
                      className="px-2.5 py-1 rounded-full bg-gradient-to-r from-purple-600/30 to-pink-600/30 hover:from-purple-600/50 hover:to-pink-600/50 text-[10px] text-zinc-200 transition-all whitespace-nowrap border border-purple-500/30 hover:border-purple-400/60 font-medium"
                    >
                      {'\u{1F3B2}'} Surprise Me
                    </button>
                  </div>
                )}
              </div>

              {/* Styles (caption) */}
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wide mb-1">
                  Styles
                </label>
                <textarea
                  data-testid="enhance-styles-input"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="e.g. jazz arrangement, acoustic guitar, slow tempo..."
                  rows={2}
                  className="w-full bg-[#161618] border border-[#333] rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-teal-500/60"
                />
              </div>

              {/* Consistency */}
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wide mb-2">
                  Consistency
                </label>
                <div className="flex gap-1" data-testid="enhance-consistency-toggle">
                  {(['low', 'medium', 'high'] as ConsistencyLevel[]).map((level) => (
                    <button
                      key={level}
                      onClick={() => setConsistency(level)}
                      className={`flex-1 py-1.5 rounded-md text-[11px] font-medium capitalize transition-colors ${
                        consistency === level
                          ? 'bg-teal-600 text-white'
                          : 'bg-[#161618] text-zinc-500 hover:bg-[#2a2a2e] hover:text-zinc-300'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              {/* Create new vs replace */}
              <div className="flex items-center gap-3 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createNew}
                    onChange={(e) => setCreateNew(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-[#444] bg-[#222] accent-teal-500"
                  />
                  <span className="text-[10px] text-zinc-400">Create new clip (leave original intact)</span>
                </label>
              </div>
            </>
          )}

          {/* === REPAINT MODE CONTROLS === */}
          {mode === 'repaint' && clip && (
            <>
              {/* Repaint range — waveform selector */}
              <div className="bg-[#222]/60 rounded px-3 pt-2 pb-2 border border-[#3a3a3a]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-medium text-zinc-300">Repaint range</span>
                  <span className="text-[10px] font-mono text-rose-300">
                    {fmt(selStart)} — {fmt(selEnd)}
                  </span>
                </div>
                <WaveformRangeSelector
                  peaks={sourcePeaks}
                  duration={clip.duration || 0}
                  rangeStart={clip.duration > 0 ? (selStart - clipStart) / clip.duration : 0}
                  rangeEnd={clip.duration > 0 ? (selEnd - clipStart) / clip.duration : 1}
                  onRangeChange={(s, e) => {
                    handleRangeChange(
                      clipStart + s * clip.duration,
                      clipStart + e * clip.duration,
                    );
                  }}
                  bpm={project?.bpm}
                  snapToGrid={true}
                />
                <div className="flex gap-4 mt-1">
                  <span className="flex items-center gap-1 text-[8px] text-zinc-400">
                    <span className="inline-block w-3 h-2 rounded-sm bg-black/55 border border-zinc-600/50" />
                    Keep
                  </span>
                  <span className="flex items-center gap-1 text-[8px] text-rose-400">
                    <span className="inline-block w-3 h-2 rounded-sm bg-rose-600/20 border border-rose-500/60" />
                    Regenerate
                  </span>
                </div>
              </div>

              {/* Prompt */}
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">
                  Prompt for this section
                </label>
                <textarea
                  data-testid="enhance-repaint-prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe how this section should sound..."
                  rows={3}
                  className="w-full bg-[#222] border border-[#444] rounded px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-rose-500/60"
                />
              </div>

              {/* Global caption */}
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">
                  Global song description
                  <span className="ml-1 normal-case font-normal text-zinc-600">(optional)</span>
                </label>
                <textarea
                  data-testid="enhance-global-caption"
                  value={globalCaption}
                  onChange={(e) => setGlobalCaption(e.target.value)}
                  placeholder="e.g. upbeat pop song..."
                  rows={2}
                  className="w-full bg-[#222] border border-[#444] rounded px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-rose-500/60"
                />
              </div>

              {/* Repaint mode & strength */}
              <div className="bg-[#222]/60 rounded px-3 py-2.5 border border-[#3a3a3a] space-y-2.5">
                <div>
                  <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">
                    Repaint mode
                  </label>
                  <div className="flex gap-1" data-testid="enhance-repaint-mode-toggle">
                    {(['conservative', 'balanced', 'aggressive'] as const).map((rm) => (
                      <button
                        key={rm}
                        onClick={() => setRepaintMode(rm)}
                        className={`flex-1 px-2 py-1.5 rounded text-[10px] font-medium transition-colors ${
                          repaintMode === rm
                            ? 'bg-rose-600/80 text-white border border-rose-500'
                            : 'bg-[#333] text-zinc-400 border border-[#444] hover:bg-[#3a3a3a]'
                        }`}
                      >
                        {rm.charAt(0).toUpperCase() + rm.slice(1)}
                      </button>
                    ))}
                  </div>
                  <p className="text-[8px] text-zinc-600 mt-1">
                    {repaintMode === 'conservative' && 'Maximum source preservation — subtle changes only.'}
                    {repaintMode === 'balanced' && 'Tunable blend between source preservation and fresh generation.'}
                    {repaintMode === 'aggressive' && 'Pure diffusion — fully regenerates the region.'}
                  </p>
                </div>

                {repaintMode === 'balanced' && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-medium text-zinc-400">
                        Repaint strength
                      </label>
                      <span className="text-[10px] font-mono text-rose-300">{repaintStrength.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={repaintStrength}
                      onChange={(e) => setRepaintStrength(Number(e.target.value))}
                      className="w-full h-1.5 accent-rose-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[8px] text-zinc-600 mt-0.5">
                      <span>Preserve source</span>
                      <span>Fresh generation</span>
                    </div>
                  </div>
                )}
              </div>

              {mode === 'repaint' && (
                <p className="text-[10px] text-zinc-600">
                  Only the selected range will be regenerated. Audio outside the repaint region is preserved.
                </p>
              )}
            </>
          )}

          {/* Enhance button */}
          <button
            data-testid="enhance-btn"
            onClick={handleGenerate}
            disabled={!canGenerate}
            className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              canGenerate
                ? `${accentBg} ${accentBgHover} text-white`
                : 'bg-[#2a2a2e] text-zinc-500 cursor-not-allowed'
            }`}
          >
            {isGenerating
              ? (mode === 'cover' ? 'Enhancing...' : 'Repainting...')
              : (mode === 'cover' ? 'Enhance' : 'Repaint Selection')
            }
          </button>
        </div>
      </div>

      {/* Right Panel — Results */}
      <div data-testid="enhance-results" className="w-[220px] min-w-[220px] flex flex-col bg-[#1a1a1e]">
        <div className="px-3 py-3 border-b border-[#3a3a3a]">
          <p className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wide">Results</p>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <svg className="w-8 h-8 text-zinc-700 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 18V5l12-2v13" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
              <p className="text-[11px] text-zinc-600">
                Enhanced results will appear here
              </p>
            </div>
          ) : (
            results.map((r, idx) => {
              const isPlaying = playback.playingId === r.id;
              const isSelected = r.id === selectedResultId;
              return (
                <div
                  key={r.id}
                  data-testid={`result-item-${idx}`}
                  onClick={() => { setSelectedResultId(r.id); setMiniPlayerIdx(idx); }}
                  className={`rounded-md transition-colors group cursor-pointer ${
                    isSelected ? 'bg-[#2a2a30] ring-1 ring-zinc-600' : 'hover:bg-[#222226]'
                  }`}
                >
                  <div className="flex items-center gap-2 px-2 py-2">
                    <button
                      data-testid={`result-play-btn-${idx}`}
                      onClick={(e) => { e.stopPropagation(); handleResultPlay(r.id, r.audioKey); }}
                      className={`w-6 h-6 flex items-center justify-center rounded-full transition-colors flex-shrink-0 ${
                        isPlaying
                          ? 'bg-violet-600 text-white'
                          : 'bg-[#2a2a2e] text-zinc-400 hover:text-zinc-200'
                      }`}
                      aria-label={isPlaying ? 'Stop result' : 'Play result'}
                    >
                      {isPlaying ? (
                        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                      ) : (
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-zinc-300 truncate">
                        {r.title}
                        {canAB && isSelected && (
                          <span className={`ml-1 ${abSide === 'B' ? 'text-violet-400 font-bold' : 'text-zinc-600'}`}>B</span>
                        )}
                      </p>
                      <p className="text-[10px] text-zinc-600">{r.duration}</p>
                    </div>
                    <button
                      className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-300 transition-opacity"
                      aria-label="More options"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="1.5" />
                        <circle cx="12" cy="12" r="1.5" />
                        <circle cx="12" cy="19" r="1.5" />
                      </svg>
                    </button>
                  </div>
                  {/* Result waveform */}
                  {r.peaks.length > 0 && (
                    <div className="px-2 pb-2">
                      <WaveformPreview
                        peaks={r.peaks}
                        color="#8b5cf6"
                        height={24}
                        playbackProgress={isPlaying ? playback.progress : 0}
                        data-testid={`result-waveform-${idx}`}
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Mini player */}
        {results.length > 0 && (
          <div className="border-t border-[#3a3a3a] px-3 py-2.5" data-testid="mini-player">
            <div className="flex items-center gap-2">
              <button
                data-testid="mini-prev-btn"
                onClick={handleMiniPrev}
                disabled={miniPlayerIdx <= 0}
                className={`transition-colors ${miniPlayerIdx <= 0 ? 'text-zinc-700' : 'text-zinc-500 hover:text-zinc-300'}`}
                aria-label="Previous"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
              </button>
              <button
                data-testid="mini-play-btn"
                onClick={handleMiniPlay}
                className={`transition-colors ${miniIsPlaying ? 'text-violet-400' : 'text-zinc-300 hover:text-white'}`}
                aria-label={miniIsPlaying ? 'Pause' : 'Play'}
              >
                {miniIsPlaying ? (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                )}
              </button>
              <button
                data-testid="mini-next-btn"
                onClick={handleMiniNext}
                disabled={miniPlayerIdx >= results.length - 1}
                className={`transition-colors ${miniPlayerIdx >= results.length - 1 ? 'text-zinc-700' : 'text-zinc-500 hover:text-zinc-300'}`}
                aria-label="Next"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M16 18h2V6h-2zm-2-6L5.5 6v12z" /></svg>
              </button>
              <div
                data-testid="mini-progress-bar"
                className="flex-1 mx-1.5 cursor-pointer"
                onClick={handleMiniSeek}
              >
                <div className="h-1 bg-[#2a2a2e] rounded-full relative">
                  <div
                    className="h-1 bg-violet-600 rounded-full transition-[width] duration-75"
                    style={{ width: `${miniProgress * 100}%` }}
                  />
                </div>
              </div>
              {miniResult && (
                <span className="text-[9px] text-zinc-600 font-mono whitespace-nowrap">
                  {miniResult.duration !== '--:--' ? miniResult.duration : ''}
                </span>
              )}
            </div>
            {miniResult && (
              <p className="text-[9px] text-zinc-500 truncate mt-1">{miniResult.title}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
