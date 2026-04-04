import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';
import { useUIStore, getBottomPanelHeight, isAnyModalOpen } from '../../store/uiStore';
import { generateCoverClip } from '../../services/generationPipeline';
import { generateRepaintClip } from '../../services/generationPipeline';
import { modelSupportsTaskType, isModelInventoryLoaded, isModelReady } from '../../services/aceStepApi';
import { Z } from '../../utils/zIndex';
import { WaveformPreview } from './WaveformPreview';
import { useEnhancePlayback } from '../../hooks/useEnhancePlayback';
import { computeWaveformPeaks } from '../../utils/waveformPeaks';
import type { RepaintMode } from '../../types/api';
import { ENHANCE_PRESETS, surpriseMe } from '../../constants/enhancePresets';
import type { EnhancementNode } from '../../types/enhance';
import { VersionTreeNodes } from './VersionTree';
import { EnhanceCoverControls } from './EnhanceCoverControls';
import { EnhanceRepaintControls } from './EnhanceRepaintControls';
import { ResultsPanel, type ResultEntry, type ABSide } from './ResultsPanel';

const ENHANCER_BASE_BOTTOM = 60;

type ConsistencyLevel = 'low' | 'medium' | 'high';
const CONSISTENCY_VALUES: Record<ConsistencyLevel, number> = {
  low: 0.75,
  medium: 0.5,
  high: 0.25,
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
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  // A/B comparison
  const [abSide, setAbSide] = useState<ABSide>('A');
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);

  // Mini player selected index
  const [miniPlayerIdx, setMiniPlayerIdx] = useState(0);

  // Quick Styles section
  const [quickStylesOpen, setQuickStylesOpen] = useState(false);

  // Local guard against rapid Generate clicks (supplements store-level isGenerating)
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Playback
  const playback = useEnhancePlayback();

  // Enhancement session (iterative chaining)
  const enhancementSession = useUIStore((s) => s.enhancementSession);
  const startEnhancementSession = useUIStore((s) => s.startEnhancementSession);
  const addEnhancementNode = useUIStore((s) => s.addEnhancementNode);
  const setActiveEnhancementNode = useUIStore((s) => s.setActiveEnhancementNode);
  const rollbackToNode = useUIStore((s) => s.rollbackToNode);

  // Track the overridden source audio key when using a result as new source
  const [chainedSourceAudioKey, setChainedSourceAudioKey] = useState<string | null>(null);

  // Source audio key — use chained source if iterating, otherwise clip audio
  const clipAudioKey = clip?.isolatedAudioKey || clip?.cumulativeMixKey || '';
  const sourceAudioKey = chainedSourceAudioKey || clipAudioKey;

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
      setChainedSourceAudioKey(null);

      // Start an enhancement session for version tracking (only if no session exists for this clip)
      const currentSession = useUIStore.getState().enhancementSession;
      if (!currentSession || currentSession.clipId !== enhancerTarget.clipId) {
        startEnhancementSession(enhancerTarget.clipId);
      }
    }
  }, [enhancerTarget?.clipId]);

  // Stop playback when panel closes
  useEffect(() => {
    if (!enhancerOpen) {
      playback.stopPlayback();
    }
  }, [enhancerOpen, playback.stopPlayback]);

  // Focus management: trap focus, handle Escape, auto-focus on open, restore on close
  useEffect(() => {
    if (!enhancerOpen) return;

    // Save the previously focused element to restore on close
    previousFocusRef.current = document.activeElement;

    // Auto-focus the first focusable element inside the panel
    requestAnimationFrame(() => {
      panelRef.current
        ?.querySelector<HTMLElement>(
          'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
        )
        ?.focus();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Don't close if a modal-level dialog is open on top of us
        if (isAnyModalOpen()) return;
        e.stopPropagation();
        closeEnhancer();
        return;
      }
      if (e.key === 'Tab') {
        const panel = panelRef.current;
        if (!panel) return;
        const focusable = panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      // Restore focus to the element that was focused before the panel opened
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus();
      }
    };
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

  // After generation, load the new clip's audio to compute peaks and duration
  const finalizeResult = useCallback(async (resultId: string, originalClipId: string, newClipId?: string) => {
    // The generation pipeline may create a new clip (createNew) or update the existing one.
    // When newClipId is provided (returned from the pipeline), use it directly.
    // Otherwise fall back to searching the track for the newest ready clip.
    const store = useProjectStore.getState();
    const targetId = newClipId ?? originalClipId;
    let updatedClip = store.getClipById(targetId);
    let audioKey = updatedClip?.isolatedAudioKey || updatedClip?.cumulativeMixKey || '';

    if (!audioKey && !newClipId && enhancerTarget) {
      // Fallback: When createNew=true and no newClipId was returned, search the track.
      const track = store.project?.tracks.find((t) => t.id === enhancerTarget.trackId);
      if (track) {
        const readyClip = [...track.clips]
          .reverse()
          .find((c) => c.id !== originalClipId && (c.isolatedAudioKey || c.cumulativeMixKey));
        if (readyClip) {
          updatedClip = readyClip;
          audioKey = readyClip.isolatedAudioKey || readyClip.cumulativeMixKey || '';
        }
      }
    }
    if (!audioKey) {
      setResults((prev) => prev.map((r) =>
        r.id === resultId ? { ...r, status: 'error' as const, error: 'No audio key found for result' } : r,
      ));
      return;
    }

    try {
      const buffer = await playback.loadBuffer(audioKey);
      if (!buffer) {
        setResults((prev) => prev.map((r) =>
          r.id === resultId ? { ...r, status: 'error' as const, error: 'Failed to load audio buffer' } : r,
        ));
        return;
      }
      const peaks = computeWaveformPeaks(buffer, 60);
      const dur = buffer.duration;
      const finalClipId = updatedClip?.id ?? originalClipId;
      setResults((prev) => prev.map((r) =>
        r.id === resultId
          ? { ...r, clipId: finalClipId, audioKey, peaks, duration: formatDuration(dur), durationSec: dur, status: 'ready' as const }
          : r,
      ));
      // Auto-select first result
      setSelectedResultId((prev) => prev ?? resultId);
      setMiniPlayerIdx((prev) => {
        if (prev === 0) return Math.max(0, results.length); // point to new entry
        return prev;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Audio decode failed';
      setResults((prev) => prev.map((r) =>
        r.id === resultId ? { ...r, status: 'error' as const, error: message } : r,
      ));
    }
  }, [playback, results.length, enhancerTarget]);

  // Cover generation
  const handleCoverGenerate = useCallback(async () => {
    if (!enhancerTarget || isGenerating || isSubmitting) return;
    setIsSubmitting(true);
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
      status: 'generating',
    }]);
    try {
      const newClipId = await generateCoverClip({
        clipId: enhancerTarget.clipId,
        caption,
        lyrics,
        coverStrength,
        createNew,
        sourceAudioOverride: chainedSourceAudioKey || undefined,
      });
      // After generation, try to load the result audio to get peaks/duration
      await finalizeResult(resultId, enhancerTarget.clipId, newClipId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Enhancement failed';
      setResults((prev) => prev.map((r) =>
        r.id === resultId ? { ...r, status: 'error' as const, error: message } : r,
      ));
    } finally {
      setIsSubmitting(false);
    }
  }, [enhancerTarget, caption, lyrics, consistency, createNew, isGenerating, isSubmitting, chainedSourceAudioKey, finalizeResult]);

  // Repaint generation
  const handleRepaintGenerate = useCallback(async () => {
    if (!enhancerTarget || isGenerating || isSubmitting) return;
    setIsSubmitting(true);
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
      status: 'generating',
    }]);
    try {
      const newClipId = await generateRepaintClip({
        clipId: enhancerTarget.clipId,
        repaintStart: selStart,
        repaintEnd: selEnd,
        prompt,
        globalCaption: globalCaption || undefined,
        repaintMode,
        repaintStrength,
        sourceAudioOverride: chainedSourceAudioKey || undefined,
      });
      await finalizeResult(resultId, enhancerTarget.clipId, newClipId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Repaint failed';
      setResults((prev) => prev.map((r) =>
        r.id === resultId ? { ...r, status: 'error' as const, error: message } : r,
      ));
    } finally {
      setIsSubmitting(false);
    }
  }, [enhancerTarget, selStart, selEnd, prompt, globalCaption, repaintMode, repaintStrength, isGenerating, isSubmitting, chainedSourceAudioKey, finalizeResult]);

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

  // Use result as new source for next enhancement round
  const handleUseAsSource = useCallback((result: ResultEntry) => {
    if (!result.audioKey || !enhancerTarget) return;

    // Add an enhancement node to track this in the version tree
    addEnhancementNode({
      parentId: enhancementSession?.activeNodeId ?? null,
      clipId: result.clipId,
      audioKey: result.audioKey,
      mode,
      params: mode === 'cover'
        ? { caption, lyrics, coverStrength: CONSISTENCY_VALUES[consistency] }
        : { repaintRange: { start: selStart, end: selEnd }, repaintMode, repaintStrength },
      label: result.title,
    });

    // Set this result's audio as the source for the next enhancement
    setChainedSourceAudioKey(result.audioKey);

    // Create a new session entry for the next round
    handleNewSession();
  }, [enhancerTarget, enhancementSession, addEnhancementNode, mode, caption, lyrics, consistency, selStart, selEnd, repaintMode, repaintStrength, handleNewSession]);

  // Handle clicking a version tree node to load it as the current source
  const handleVersionTreeClick = useCallback((node: EnhancementNode) => {
    rollbackToNode(node.id);
    setChainedSourceAudioKey(node.audioKey);
  }, [rollbackToNode]);

  // Handle clicking "Original" in the version tree — reset to original source
  const handleVersionTreeOriginal = useCallback(() => {
    setChainedSourceAudioKey(null);
    setActiveEnhancementNode(null);
  }, [setActiveEnhancementNode]);

  // Build the version tree structure for rendering
  const versionTreeRoots = useMemo(() => {
    if (!enhancementSession) return [];
    return enhancementSession.nodes.filter((n) => n.parentId === null);
  }, [enhancementSession]);

  const getNodeChildren = useCallback((parentId: string): EnhancementNode[] => {
    if (!enhancementSession) return [];
    return enhancementSession.nodes.filter((n) => n.parentId === parentId);
  }, [enhancementSession]);

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
      <>
      <div data-testid="enhance-backdrop" role="presentation" className="fixed inset-0 bg-black/30" style={{ zIndex: Z.panel - 1 }} onClick={closeEnhancer} />
      <div
        ref={panelRef}
        data-testid="enhance-panel"
        role="dialog"
        aria-label="AI Enhancer"
        className="fixed left-1/2 -translate-x-1/2 w-[780px] max-w-[95vw] daw-glass-subtle rounded-xl daw-shadow-xl text-xs text-zinc-200 p-8 text-center transition-[bottom] duration-200 ease-out"
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
      </>
    );
  }

  const hasAudio = !!(clip?.isolatedAudioKey || clip?.cumulativeMixKey);
  const inventoryLoaded = isModelInventoryLoaded();
  const modelReady = isModelReady();
  const coverSupported = modelSupportsTaskType('cover');
  const repaintSupported = modelSupportsTaskType('repaint');
  const modeSupported = mode === 'cover' ? coverSupported : repaintSupported;
  const canGenerate = hasAudio && modeSupported && !isGenerating && !isSubmitting && !!(clip && track);

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
    <>
    <div data-testid="enhance-backdrop" role="presentation" className="fixed inset-0 bg-black/30" style={{ zIndex: Z.panel - 1 }} onClick={closeEnhancer} />
    <div
      ref={panelRef}
      data-testid="enhance-panel"
      role="dialog"
      aria-label="AI Enhancer"
      className="fixed left-1/2 -translate-x-1/2 w-[820px] max-w-[95vw] max-h-[60vh] daw-glass-subtle rounded-xl daw-shadow-xl flex text-xs text-zinc-200 overflow-hidden transition-[bottom] duration-200 ease-out"
      style={{ zIndex: Z.panel, bottom: `${dynamicBottom}px` }}
    >
      {/* Left Sidebar — Version Tree & Session History */}
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

        {/* Version Tree */}
        {enhancementSession && enhancementSession.nodes.length > 0 && (
          <div data-testid="version-tree" className="px-1.5 pb-2 border-b border-[#3a3a3a] mb-1">
            <p className="text-[9px] text-zinc-600 uppercase tracking-wide px-2 mb-1">Versions</p>
            {/* Original source */}
            <button
              data-testid="version-tree-original"
              onClick={handleVersionTreeOriginal}
              className={`w-full text-left px-2 py-1.5 rounded-md text-[10px] transition-colors truncate flex items-center gap-1.5 ${
                enhancementSession.activeNodeId === null
                  ? 'bg-[#2a2a2e] text-teal-300'
                  : 'text-zinc-500 hover:bg-[#222226] hover:text-zinc-300'
              }`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                enhancementSession.activeNodeId === null ? 'bg-teal-400' : 'bg-zinc-600'
              }`} />
              v0 (Original)
            </button>
            {/* Tree nodes */}
            <VersionTreeNodes
              nodes={versionTreeRoots}
              getChildren={getNodeChildren}
              activeNodeId={enhancementSession.activeNodeId}
              onNodeClick={handleVersionTreeClick}
              depth={0}
            />
          </div>
        )}

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
                {chainedSourceAudioKey && (
                  <span className="ml-1 text-teal-400 normal-case" data-testid="chained-source-indicator">(chained)</span>
                )}
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
            {!inventoryLoaded && (
              <p className="text-[10px] text-amber-400 mt-2">
                Connecting to server...
              </p>
            )}
            {inventoryLoaded && !modelReady && (
              <p className="text-[10px] text-amber-400 mt-2">
                No model loaded on server. Load a model in Settings before enhancing.
              </p>
            )}
            {inventoryLoaded && modelReady && !modeSupported && (
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
            <EnhanceCoverControls
              lyrics={lyrics}
              onLyricsChange={setLyrics}
              caption={caption}
              onCaptionChange={setCaption}
              consistency={consistency}
              onConsistencyChange={setConsistency}
              createNew={createNew}
              onCreateNewChange={setCreateNew}
              quickStylesOpen={quickStylesOpen}
              onQuickStylesToggle={() => setQuickStylesOpen((v) => !v)}
            />
          )}

          {/* === REPAINT MODE CONTROLS === */}
          {mode === 'repaint' && clip && (
            <EnhanceRepaintControls
              sourcePeaks={sourcePeaks}
              clipDuration={clip.duration || 0}
              clipStart={clipStart}
              selStart={selStart}
              selEnd={selEnd}
              onRangeChange={handleRangeChange}
              prompt={prompt}
              onPromptChange={setPrompt}
              globalCaption={globalCaption}
              onGlobalCaptionChange={setGlobalCaption}
              repaintMode={repaintMode}
              onRepaintModeChange={setRepaintMode}
              repaintStrength={repaintStrength}
              onRepaintStrengthChange={setRepaintStrength}
              bpm={project?.bpm}
            />
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
            {isGenerating || isSubmitting
              ? (mode === 'cover' ? 'Enhancing...' : 'Repainting...')
              : (mode === 'cover' ? 'Enhance' : 'Repaint Selection')
            }
          </button>
        </div>
      </div>

      {/* Right Panel — Results */}
      <ResultsPanel
        results={results}
        selectedResultId={selectedResultId}
        onSelectResult={(id, idx) => { setSelectedResultId(id); setMiniPlayerIdx(idx); }}
        onResultPlay={handleResultPlay}
        onUseAsSource={handleUseAsSource}
        playingId={playback.playingId}
        playbackProgress={playback.progress}
        canAB={canAB}
        abSide={abSide}
        miniResult={miniResult}
        miniPlayerIdx={miniPlayerIdx}
        miniIsPlaying={miniIsPlaying}
        miniProgress={miniProgress}
        onMiniPrev={handleMiniPrev}
        onMiniNext={handleMiniNext}
        onMiniPlay={handleMiniPlay}
        onMiniSeek={handleMiniSeek}
        resultsLength={results.length}
      />
    </div>
    </>
  );
}
