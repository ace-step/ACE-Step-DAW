/**
 * StrudelEditor — StrudelMirror-based editor with sidebar tabs.
 *
 * Everything runs in one module graph: editor, transpiler, webaudio, samples.
 * Flow: edit code → play → hear audio → update code live → Send to export
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { Z } from '../../utils/zIndex';
import type { StrudelFromMidiOptions } from '../../types/project';
import { registerStrudelEditorPlaybackStop, registerStrudelEditorAudioContext, resumeStrudelAudio } from '../../engine/strudelEditorPlayback';
import { createDebugLogger } from '../../utils/debugLogger';
import { computeLineDiff, formatDiffSummary, type DiffLine } from '../../utils/codeDiff';

const log = createDebugLogger('strudel-editor');
const DEFAULT_CODE = `s("[bd <hh oh>]*2, [~ cp]*2")`;

// Inject CSS to constrain the autocomplete info panel
if (typeof document !== 'undefined' && !document.getElementById('strudel-autocomplete-css')) {
  const style = document.createElement('style');
  style.id = 'strudel-autocomplete-css';
  style.textContent = `
    .cm-tooltip-autocomplete .cm-completionInfo {
      display: none !important;
    }
    .cm-tooltip-autocomplete {
      max-height: 200px !important;
      font-size: 13px !important;
    }
  `;
  document.head.appendChild(style);
}

/* ── Sidebar data ──────────────────────────────────── */

type SidebarTab = 'import' | 'sounds' | 'reference' | 'console' | 'diff' | 'settings';


const SOUND_BANKS = [
  { name: 'Default (dirt-samples)', sounds: 'bd, sd, hh, oh, cp, sn, lt, mt, ht, rim, cb, cy, cr' },
  { name: 'tr909', sounds: 'bd, sd, hh, oh, cp, lt, mt, ht, cy, rc, rs' },
  { name: 'tr808', sounds: 'bd, sd, hh, oh, cp, cb, lt, mt, ht, lc, mc, hc, cl, ma, cy, rs' },
  { name: 'cr78', sounds: 'bd, sd, hh, oh, cp, cb, ma, gu, ta, co, cl' },
];

/* ── Component ─────────────────────────────────────── */

export function StrudelEditor() {
  const strudelPanelOpen = useUIStore((s) => s.strudelPanelOpen);
  const openStrudelEditorTrackId = useUIStore((s) => s.openStrudelEditorTrackId);
  const openPianoRollTrackId = useUIStore((s) => s.openPianoRollTrackId);
  const openPianoRollClipId = useUIStore((s) => s.openPianoRollClipId);
  const setOpenStrudelEditor = useUIStore((s) => s.setOpenStrudelEditor);
  const project = useProjectStore((s) => s.project);
  const convertMidiClipToStrudel = useProjectStore((s) => s.convertMidiClipToStrudel);
  const convertMidiTrackToStrudel = useProjectStore((s) => s.convertMidiTrackToStrudel);
  const convertMidiFileToStrudel = useProjectStore((s) => s.convertMidiFileToStrudel);
  const applyStrudelCodeToTrack = useProjectStore((s) => s.applyStrudelCodeToTrack);
  const captureStrudelVersion = useProjectStore((s) => s.captureStrudelVersion);
  const restoreStrudelVersion = useProjectStore((s) => s.restoreStrudelVersion);

  const [editorHeight, setEditorHeight] = useState(380);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bouncing, setBouncing] = useState(false);
  const [bounceProgress, setBounceProgress] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [bounceBars, setBounceBars] = useState(4);
  const [showBarsMenu, setShowBarsMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SidebarTab | null>(null);
  const [consoleMessages, setConsoleMessages] = useState<string[]>([]);
  const [showVersionMenu, setShowVersionMenu] = useState(false);
  const [importOptions, setImportOptions] = useState<Pick<
    StrudelFromMidiOptions,
    'notationType' | 'timingStyle' | 'quantize' | 'measuresPerLine' | 'soundMapping' | 'targetTrackMode'
  >>({
    notationType: 'absolute',
    timingStyle: 'subdivision',
    quantize: true,
    measuresPerLine: 2,
    soundMapping: 'auto',
    targetTrackMode: 'currentOrNew',
  });

  const [editorSettings, setEditorSettings] = useState({
    fontSize: 18,
    isLineNumbersDisplayed: true,
    isLineWrappingEnabled: false,
    isBracketClosingEnabled: true,
    isFlashEnabled: true,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stopEditorPlayback = useCallback(() => {
    if (editorRef.current) {
      try {
        editorRef.current.stop();
      } catch {
        // Ignore stop failures from stale editor instances.
      }
    }
    setIsPlaying(false);
  }, []);

  const activeStrudelTrack = useMemo(() => {
    if (!project) return null;
    return (
      (openStrudelEditorTrackId
        ? project.tracks.find((track) => track.id === openStrudelEditorTrackId && track.trackType === 'strudel')
        : null)
      ?? project.tracks.find((track) => track.trackType === 'strudel')
      ?? null
    );
  }, [openStrudelEditorTrackId, project]);
  const versions = activeStrudelTrack?.strudelVersions ?? [];

  useEffect(() => {
    if (!strudelPanelOpen || !project || activeStrudelTrack) return;
    const track = useProjectStore.getState().addTrack('custom', 'strudel');
    setOpenStrudelEditor(track.id);
  }, [activeStrudelTrack, project, setOpenStrudelEditor, strudelPanelOpen]);

  // Scroll console to bottom
  useEffect(() => { consoleEndRef.current?.scrollIntoView(); }, [consoleMessages]);


  // Initialize StrudelMirror
  useEffect(() => {
    if (!containerRef.current || !strudelPanelOpen) return;
    let mounted = true;

    (async () => {
      setIsLoading(true);
      try {
        const [codemirrorMod, webaudioMod, transpilerMod, miniMod, tonalMod] = await Promise.all([
          import('@strudel/codemirror') as any,
          import('@strudel/webaudio') as any,
          import('@strudel/transpiler') as any,
          import('@strudel/mini') as any,
          import('@strudel/tonal').catch(() => ({})),
        ]);

        if (!mounted || !containerRef.current) return;

        webaudioMod.registerSynthSounds?.();
        webaudioMod.registerZZFXSounds?.();
        miniMod.miniAllStrings?.();

        const core = await import('@strudel/core') as any;
        if (core.evalScope) {
          await core.evalScope(core, miniMod, webaudioMod, codemirrorMod, tonalMod);
        }

        webaudioMod.initAudioOnFirstClick?.();

        // Enable autocompletion (disabled by default in StrudelMirror)
        if (codemirrorMod.codemirrorSettings?.setKey) {
          codemirrorMod.codemirrorSettings.setKey('isAutoCompletionEnabled', true);
        }

        // Load samples via @strudel/webaudio (same superdough singleton)
        if (webaudioMod.samples) {
          const ds = 'https://raw.githubusercontent.com/felixroos/dough-samples/main';
          await Promise.allSettled([
            webaudioMod.samples('github:tidalcycles/dirt-samples'),
            webaudioMod.samples(`${ds}/tidal-drum-machines.json`),
            webaudioMod.samples(`${ds}/piano.json`),
            webaudioMod.samples(`${ds}/vcsl.json`),
            import('@strudel/soundfonts').then((m: any) => m.registerSoundfonts?.()).catch(() => {}),
          ]);
        }

        if (!mounted || !containerRef.current) return;
        containerRef.current.innerHTML = '';

        const store = useProjectStore.getState();
        // Read the track from the store snapshot — NOT from the reactive
        // `activeStrudelTrack` memo. Using the memo as a dependency would
        // cause this entire init effect to re-run (and destroy+recreate
        // the editor) every time the track's code changes via evaluate().
        let strudelTrack = openStrudelEditorTrackId
          ? store.project?.tracks.find((t) => t.id === openStrudelEditorTrackId && t.trackType === 'strudel')
          : store.project?.tracks.find((t) => t.trackType === 'strudel');
        if (!strudelTrack) {
          strudelTrack = store.addTrack('custom', 'strudel');
          setOpenStrudelEditor(strudelTrack.id);
        }
        const initialCode = strudelTrack?.strudelCode?.replace(/^\/\/.*\n?/gm, '').trim() || DEFAULT_CODE;

        const editor = new codemirrorMod.StrudelMirror({
          defaultOutput: webaudioMod.webaudioOutput,
          getTime: () => (webaudioMod.getAudioContext?.() ?? new AudioContext()).currentTime,
          transpiler: transpilerMod.transpiler,
          root: containerRef.current,
          initialCode,
          prebake: () => Promise.resolve(),
          autocompletion: true,
          onUpdateState: (state: any) => {
            if (state.activeCode) {
              const st = useProjectStore.getState();
              let track = activeStrudelTrack
                ?? (openStrudelEditorTrackId
                  ? st.project?.tracks.find((candidate) => candidate.id === openStrudelEditorTrackId && candidate.trackType === 'strudel')
                  : undefined)
                ?? st.project?.tracks.find((candidate) => candidate.trackType === 'strudel');
              if (!track) {
                track = st.addTrack('custom', 'strudel');
                setOpenStrudelEditor(track.id);
              }
              if (track) st.updateStrudelCode(track.id, state.activeCode);
              setConsoleMessages((prev) => [...prev.slice(-50), `▶ evaluated`]);
            }
            if (state.started !== undefined) setIsPlaying(state.started);
            if (state.error) {
              setError(state.error);
              setConsoleMessages((prev) => [...prev.slice(-50), `! ${state.error}`]);
            } else if (state.activeCode) {
              setError(null);
            }
          },
        });

        // Enable autocompletion on the instance (not via settings store)
        if (editor.setAutocompletionEnabled) {
          editor.setAutocompletionEnabled(true);
        } else if (editor.reconfigureExtension) {
          editor.reconfigureExtension('isAutoCompletionEnabled', true);
        }

        editorRef.current = editor;

        // Register the AudioContext so transport stop can force-kill audio
        // even after this component unmounts.
        const ctx = webaudioMod.getAudioContext?.();
        if (ctx) registerStrudelEditorAudioContext(ctx);

        setIsLoading(false);
        setConsoleMessages(['🌀 Strudel ready']);
      } catch (err) {
        log.error('init failed:', err);
        setIsLoading(false);
        setError(err instanceof Error ? err.message : 'Failed to load editor');
      }
    })();

    return () => {
      mounted = false;
      stopEditorPlayback();
      editorRef.current = null;
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- activeStrudelTrack intentionally excluded:
  // the effect reads the track from the store snapshot to avoid re-init on every code change.
  }, [openStrudelEditorTrackId, setOpenStrudelEditor, stopEditorPlayback, strudelPanelOpen]);

  useEffect(() => {
    if (!strudelPanelOpen) {
      registerStrudelEditorPlaybackStop(null);
      return;
    }

    registerStrudelEditorPlaybackStop(stopEditorPlayback);
    return () => registerStrudelEditorPlaybackStop(null);
  }, [stopEditorPlayback, strudelPanelOpen]);

  // Play / Stop
  const togglePlay = useCallback(() => {
    if (!editorRef.current) return;
    if (isPlaying) {
      stopEditorPlayback();
      setConsoleMessages((prev) => [...prev.slice(-50), '⏹ stopped']);
    } else {
      // Resume AudioContexts in background — evaluate() triggers audio init anyway
      resumeStrudelAudio();
      editorRef.current.evaluate();
      setIsPlaying(true);
    }
  }, [isPlaying, stopEditorPlayback]);

  // Update (re-evaluate while playing)
  const handleUpdate = useCallback(() => {
    if (!editorRef.current) return;
    resumeStrudelAudio();
    editorRef.current.evaluate();
    if (!isPlaying) setIsPlaying(true);
  }, [isPlaying]);

  // Send to Track
  const handleBounce = useCallback(async () => {
    if (!project || bouncing) return;
    setBouncing(true);
    setBounceProgress(0);
    try {
      // Evaluate first to sync code to store
      if (editorRef.current) {
        resumeStrudelAudio();
        editorRef.current.evaluate();
        setIsPlaying(true);
        await new Promise((r) => setTimeout(r, 300));
      }
      const store = useProjectStore.getState();
      let strudelTrack = activeStrudelTrack;
      if (!strudelTrack) {
        strudelTrack = store.addTrack('custom', 'strudel');
        setOpenStrudelEditor(strudelTrack.id);
      }
      if (strudelTrack) {
        await store.freezeStrudelToAudio(strudelTrack.id, bounceBars, (p: number) => setBounceProgress(p));
        setConsoleMessages((prev) => [...prev.slice(-50), `✓ sent ${bounceBars} bars to track`]);
      }
    } catch (err: any) {
      log.error('Strudel bounce failed:', err);
      setError(err?.message ?? 'Bounce failed');
      setConsoleMessages((prev) => [...prev.slice(-50), `! bounce failed: ${err?.message}`]);
    } finally {
      setBouncing(false);
      setBounceProgress(0);
    }
  }, [activeStrudelTrack, bounceBars, bouncing, project]);

  // Generate from Pattern — send pattern to ACE-Step AI generation
  const handleGenerateFromPattern = useCallback(async () => {
    if (!project || generating) return;
    setGenerating(true);
    try {
      const store = useProjectStore.getState();
      let strudelTrack = activeStrudelTrack;
      if (!strudelTrack) {
        strudelTrack = store.addTrack('custom', 'strudel');
        setOpenStrudelEditor(strudelTrack.id);
      }
      const code = strudelTrack?.strudelCode?.trim();
      if (!code) {
        setConsoleMessages((prev) => [...prev.slice(-50), '! no pattern code to generate from']);
        return;
      }

      const { generateFromStrudelPattern } = await import('../../services/strudelGenerationBridge');
      const result = await generateFromStrudelPattern({
        trackId: strudelTrack.id,
        code,
        bars: bounceBars,
        bpm: project.bpm ?? 120,
        beatsPerBar: typeof project.timeSignature === 'number' ? project.timeSignature : 4,
        keyScale: project.keyScale ?? undefined,
      });

      if (result) {
        setConsoleMessages((prev) => [...prev.slice(-50), `✓ AI generation started from ${bounceBars} bars pattern`]);
      } else {
        setConsoleMessages((prev) => [...prev.slice(-50), '! pattern analysis returned no data']);
      }
    } catch (err: any) {
      log.error('Generate from pattern failed:', err);
      setError(err?.message ?? 'Generation failed');
      setConsoleMessages((prev) => [...prev.slice(-50), `! generation failed: ${err?.message}`]);
    } finally {
      setGenerating(false);
    }
  }, [activeStrudelTrack, bounceBars, generating, project, setOpenStrudelEditor]);

  const buildImportOptions = useCallback((): Partial<StrudelFromMidiOptions> => ({
    ...importOptions,
    keyScale: project?.keyScale ?? null,
  }), [importOptions, project?.keyScale]);

  const applyConversion = useCallback(async (label: string, run: () => Promise<Awaited<ReturnType<typeof convertMidiTrackToStrudel>>>) => {
    try {
      setError(null);
      const result = await run();
      if (!result) {
        setConsoleMessages((prev) => [...prev.slice(-50), `! ${label.toLowerCase()} unavailable`]);
        return;
      }

      const applied = await applyStrudelCodeToTrack(
        result.code,
        activeStrudelTrack?.id ?? openStrudelEditorTrackId,
        { label, targetTrackMode: importOptions.targetTrackMode },
      );

      if (!applied) {
        setConsoleMessages((prev) => [...prev.slice(-50), `! failed to apply ${label.toLowerCase()}`]);
        return;
      }

      setConsoleMessages((prev) => [
        ...prev.slice(-50),
        `✓ ${label.toLowerCase()} applied (${result.sourceSummary.noteCount} notes)`,
        ...result.warnings.map((warning) => `! ${warning}`),
      ].slice(-50));
      setActiveTab('console');
    } catch (err) {
      const message = err instanceof Error ? err.message : `${label} failed`;
      setError(message);
      setConsoleMessages((prev) => [...prev.slice(-50), `! ${message}`]);
    }
  }, [activeStrudelTrack?.id, applyStrudelCodeToTrack, buildImportOptions, importOptions.targetTrackMode, openStrudelEditorTrackId]);

  const handleConvertCurrentClip = useCallback(async () => {
    if (!openPianoRollClipId) return;
    await applyConversion('Convert MIDI Clip', () => convertMidiClipToStrudel(openPianoRollClipId, buildImportOptions()));
  }, [applyConversion, buildImportOptions, convertMidiClipToStrudel, openPianoRollClipId]);

  const handleConvertCurrentTrack = useCallback(async () => {
    if (!openPianoRollTrackId) return;
    await applyConversion('Convert MIDI Track', () => convertMidiTrackToStrudel(openPianoRollTrackId, buildImportOptions()));
  }, [applyConversion, buildImportOptions, convertMidiTrackToStrudel, openPianoRollTrackId]);

  const handleImportMidiFile = useCallback(async (file: File) => {
    await applyConversion('Import MIDI File', () => convertMidiFileToStrudel(file, buildImportOptions()));
  }, [applyConversion, buildImportOptions, convertMidiFileToStrudel]);

  const handleFileInputChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await handleImportMidiFile(file);
    }
    event.target.value = '';
  }, [handleImportMidiFile]);

  // Resize
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = editorHeight;
    const onMove = (ev: MouseEvent) => setEditorHeight(Math.max(200, Math.min(700, startH + startY - ev.clientY)));
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [editorHeight]);

  // Memoize diff computation to avoid O(m·n) recalculation on every render
  const diffData = useMemo(() => {
    const track = activeStrudelTrack;
    const versionList = track?.strudelVersions ?? [];
    if (versionList.length === 0) return null;
    const lastVersion = versionList[versionList.length - 1];
    const currentCode = track?.strudelCode ?? '';
    const diff = computeLineDiff(lastVersion.code, currentCode);
    const summary = formatDiffSummary(diff);
    return { diff, summary, lastVersion, versionCount: versionList.length };
  }, [activeStrudelTrack?.strudelCode, activeStrudelTrack?.strudelVersions]);

  if (!strudelPanelOpen) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 border-t border-zinc-700 bg-[#1a1a2e] flex flex-col"
      style={{ height: editorHeight, zIndex: Z.panel }}
      data-testid="strudel-editor-panel"
    >
      {/* Resize */}
      <div className="h-[5px] cursor-row-resize hover:bg-daw-accent/20 transition-colors shrink-0" onMouseDown={onResizeStart} />

      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 h-8 border-b border-zinc-700/60 shrink-0 bg-[#111118]">
        {/* Play */}
        <button
          onClick={togglePlay}
          disabled={isLoading}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
            isPlaying ? 'bg-orange-500/20 text-orange-400' : 'text-zinc-400 hover:bg-zinc-700/50 hover:text-white'
          }`}
          title={isPlaying ? 'Stop' : 'Play (Cmd+Enter)'}
        >
          {isPlaying ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect x="1" y="1" width="8" height="8" rx="1" /></svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><polygon points="2,0 10,5 2,10" /></svg>
          )}
          {isPlaying ? 'stop' : 'play'}
        </button>

        {/* Update (visible when playing) */}
        {isPlaying && (
          <button
            onClick={handleUpdate}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-emerald-400 hover:bg-emerald-500/10 transition-colors"
            title="Update pattern (Cmd+Enter)"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M8 2L4 8M2 5l2 3 4-6" />
            </svg>
            update
          </button>
        )}

        {/* Spiral — rotates when playing */}
        <span className={`text-[13px] leading-none ml-1 ${isPlaying ? 'animate-spin' : ''}`} style={isPlaying ? { animationDuration: '2s' } : {}}>
          ꩜
        </span>
        <span className="text-[11px] text-zinc-600">Strudel</span>
        {activeStrudelTrack && (
          <span className="text-[10px] text-zinc-500 truncate max-w-[180px]">{activeStrudelTrack.displayName}</span>
        )}

        <div className="flex-1" />

        {/* Error */}
        {error && <span className="text-[10px] text-red-400 truncate max-w-[150px]" title={error}>{error}</span>}

        {/* Sidebar tabs */}
        {(['import', 'sounds', 'reference', 'console', 'diff', 'settings'] as SidebarTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(activeTab === tab ? null : tab)}
            className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
              activeTab === tab ? 'text-white bg-zinc-700' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab}
          </button>
        ))}

        <div className="w-px h-4 bg-zinc-700 mx-1" />

        {/* Version controls */}
        {activeStrudelTrack && (
          <>
            <button
              onClick={() => {
                captureStrudelVersion(activeStrudelTrack.id);
                setConsoleMessages((prev) => [...prev.slice(-50), '📸 version captured']);
              }}
              className="px-1.5 py-0.5 rounded text-[10px] text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200 transition-colors"
              title="Capture current code as a version snapshot"
            >
              snapshot
            </button>
            <div className="relative">
              <button
                onClick={() => setShowVersionMenu(!showVersionMenu)}
                disabled={versions.length === 0}
                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                  versions.length === 0 ? 'text-zinc-600 cursor-default' : 'text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200'
                }`}
                title={versions.length === 0 ? 'No versions captured yet' : `${versions.length} version(s)`}
              >
                v{versions.length}
                <svg width="6" height="6" viewBox="0 0 8 8" fill="currentColor" className="opacity-40"><path d="M1 3l3 3 3-3" /></svg>
              </button>
              {showVersionMenu && versions.length > 0 && (
                <div className="absolute bottom-full right-0 mb-1 bg-zinc-800 border border-zinc-600 rounded shadow-lg py-0.5 min-w-[180px] max-h-[200px] overflow-y-auto z-20">
                  {versions.map((version, index) => (
                    <button
                      key={version.id}
                      onClick={() => {
                        restoreStrudelVersion(activeStrudelTrack.id, index);
                        setShowVersionMenu(false);
                        setConsoleMessages((prev) => [...prev.slice(-50), `↩ restored v${index + 1}`]);
                      }}
                      className="w-full text-left px-2 py-1 text-[11px] text-zinc-400 hover:bg-zinc-700 hover:text-white flex items-center justify-between"
                    >
                      <span>{version.label || `v${index + 1}`}</span>
                      <span className="text-[9px] text-zinc-600">{new Date(version.timestamp).toLocaleTimeString()}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="w-px h-4 bg-zinc-700 mx-1" />
          </>
        )}

        {/* Bars */}
        <div className="relative">
          <button
            onClick={() => setShowBarsMenu(!showBarsMenu)}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200"
          >
            {bounceBars}bar
            <svg width="6" height="6" viewBox="0 0 8 8" fill="currentColor" className="opacity-40"><path d="M1 3l3 3 3-3" /></svg>
          </button>
          {showBarsMenu && (
            <div className="absolute bottom-full right-0 mb-1 bg-zinc-800 border border-zinc-600 rounded shadow-lg py-0.5 min-w-[60px] z-20">
              {[1, 2, 4, 8, 16].map((b) => (
                <button key={b} onClick={() => { setBounceBars(b); setShowBarsMenu(false); }}
                  className={`w-full text-left px-2 py-1 text-[11px] ${b === bounceBars ? 'text-white bg-zinc-700' : 'text-zinc-400 hover:bg-zinc-700 hover:text-white'}`}
                >{b} bar{b > 1 ? 's' : ''}</button>
              ))}
            </div>
          )}
        </div>

        {/* Send */}
        <button
          onClick={handleBounce}
          disabled={bouncing || !project || isLoading}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
            bouncing ? 'text-zinc-500 cursor-wait' : 'text-daw-accent hover:bg-daw-accent/10'
          }`}
          title={`Record ${bounceBars} bars to a new track`}
        >
          {bouncing ? (
            <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.3" /><path d="M12 2a10 10 0 0110 10" strokeLinecap="round" /></svg>{Math.round(bounceProgress * 100)}%</>
          ) : (
            <><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M5 8V2M2 4l3-3 3 3" /></svg>Send</>
          )}
        </button>

        {/* Freeze to MIDI / Drums */}
        {activeStrudelTrack && (
          <>
            <button
              onClick={async () => {
                const track = await useProjectStore.getState().freezeStrudelToMidi(activeStrudelTrack.id, bounceBars);
                setConsoleMessages((prev) => [...prev.slice(-50), track ? '🎹 frozen to MIDI' : '⚠ no melodic content']);
              }}
              disabled={!project || isLoading}
              className="px-1.5 py-0.5 rounded text-[10px] text-emerald-400/70 hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors"
              title={`Freeze ${bounceBars} bars to MIDI piano roll track`}
            >
              MIDI
            </button>
            <button
              onClick={async () => {
                const track = await useProjectStore.getState().freezeStrudelToDrumMachine(activeStrudelTrack.id, bounceBars);
                setConsoleMessages((prev) => [...prev.slice(-50), track ? '🥁 frozen to drums' : '⚠ no percussion content']);
              }}
              disabled={!project || isLoading}
              className="px-1.5 py-0.5 rounded text-[10px] text-amber-400/70 hover:bg-amber-500/10 hover:text-amber-400 transition-colors"
              title={`Freeze ${bounceBars} bars to drum machine track`}
            >
              Drums
            </button>
            <button
              onClick={() => void handleGenerateFromPattern()}
              disabled={!project || isLoading || generating}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                generating
                  ? 'text-indigo-400 animate-pulse cursor-wait'
                  : 'text-indigo-400/70 hover:bg-indigo-500/10 hover:text-indigo-400'
              }`}
              title={`Analyze ${bounceBars} bars pattern and generate AI audio`}
              data-testid="strudel-generate-from-pattern"
            >
              {generating ? 'AI...' : 'AI Gen'}
            </button>
          </>
        )}

        {/* Close */}
        <button onClick={() => { stopEditorPlayback(); setOpenStrudelEditor(null); }}
          className="flex h-5 w-5 items-center justify-center rounded text-zinc-500 hover:bg-zinc-700/50 hover:text-zinc-200" title="Close">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 2l6 6M8 2l-6 6" /></svg>
        </button>
      </div>

      {/* Main: Editor + Sidebar */}
      <div className="flex flex-1 min-h-0">
        {/* Editor */}
        <div className="flex-1 min-w-0 relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-sm z-10 bg-[#1a1a2e]">
              <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.3" /><path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
              </svg>Loading Strudel...
            </div>
          )}
          <div ref={containerRef} className="h-full overflow-auto" data-testid="strudel-mirror-container" />
        </div>

        {/* Sidebar */}
        {activeTab && (
          <div className={`w-[240px] shrink-0 border-l border-zinc-700/60 bg-[#111118] overflow-hidden text-[12px]`}>
            {activeTab === 'import' && (
              <div className="p-3 space-y-3 text-[11px]">
                <div>
                  <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider">MIDI to Strudel</h3>
                  <p className="mt-1 text-[10px] text-zinc-500">Convert MIDI sources into editable Strudel code on the current Strudel track.</p>
                </div>

                <label className="block space-y-1">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Notation</span>
                  <select
                    value={importOptions.notationType}
                    onChange={(e) => setImportOptions((current) => ({ ...current, notationType: e.target.value as StrudelFromMidiOptions['notationType'] }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200"
                  >
                    <option value="absolute">Absolute</option>
                    <option value="relative">Relative</option>
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Timing</span>
                  <select
                    value={importOptions.timingStyle}
                    onChange={(e) => setImportOptions((current) => ({ ...current, timingStyle: e.target.value as StrudelFromMidiOptions['timingStyle'] }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200"
                  >
                    <option value="subdivision">Subdivision</option>
                    <option value="absoluteDuration">Absolute duration</option>
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Sound</span>
                  <select
                    value={importOptions.soundMapping}
                    onChange={(e) => setImportOptions((current) => ({ ...current, soundMapping: e.target.value as StrudelFromMidiOptions['soundMapping'] }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200"
                  >
                    <option value="auto">Auto</option>
                    <option value="piano">Piano</option>
                    <option value="sawtooth">Sawtooth</option>
                    <option value="triangle">Triangle</option>
                    <option value="square">Square</option>
                  </select>
                </label>

                <label className="flex items-center justify-between text-zinc-300">
                  <span>Quantize to grid</span>
                  <input
                    type="checkbox"
                    checked={importOptions.quantize}
                    onChange={(e) => setImportOptions((current) => ({ ...current, quantize: e.target.checked }))}
                    className="accent-daw-accent"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Destination</span>
                  <select
                    value={importOptions.targetTrackMode}
                    onChange={(e) => setImportOptions((current) => ({ ...current, targetTrackMode: e.target.value as StrudelFromMidiOptions['targetTrackMode'] }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200"
                  >
                    <option value="currentOrNew">Current or new Strudel track</option>
                    <option value="alwaysNew">Always create new Strudel track</option>
                  </select>
                </label>

                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    disabled={!openPianoRollClipId}
                    onClick={() => void handleConvertCurrentClip()}
                    className="w-full rounded bg-violet-600/20 px-2 py-1.5 text-left text-[11px] text-violet-200 transition-colors hover:bg-violet-600/30 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Convert Current MIDI Clip
                  </button>
                  <button
                    type="button"
                    disabled={!openPianoRollTrackId}
                    onClick={() => void handleConvertCurrentTrack()}
                    className="w-full rounded bg-cyan-600/15 px-2 py-1.5 text-left text-[11px] text-cyan-100 transition-colors hover:bg-cyan-600/25 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Convert Current MIDI Track
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full rounded bg-amber-600/15 px-2 py-1.5 text-left text-[11px] text-amber-100 transition-colors hover:bg-amber-600/25"
                  >
                    Import .mid File
                  </button>
                </div>
              </div>
            )}
            {activeTab === 'sounds' && (
              <div className="p-3 space-y-3">
                <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider">Sound Banks</h3>
                {SOUND_BANKS.map((b) => (
                  <div key={b.name} className="space-y-0.5">
                    <div className="text-zinc-300 font-mono text-[11px]">{b.name}</div>
                    <div className="text-zinc-500 text-[10px] font-mono">{b.sounds}</div>
                  </div>
                ))}
              </div>
            )}
            {activeTab === 'reference' && (
              <div className="p-3 space-y-2 text-[11px]">
                <h3 className="text-zinc-300 font-semibold text-[12px]">Strudel Reference</h3>
                <p className="text-zinc-500 text-[10px]">Open the official documentation:</p>
                <a href="https://strudel.cc/learn/reference/" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-zinc-800 text-daw-accent hover:bg-zinc-700 transition-colors">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M10 1H7M10 1V4M10 1L5.5 5.5M5 1H2.5C1.95 1 1.5 1.45 1.5 2V9.5C1.5 10.05 1.95 10.5 2.5 10.5H10C10.55 10.5 11 10.05 11 9.5V7" /></svg>
                  API Reference
                </a>
                <a href="https://strudel.cc/workshop/getting-started/" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-zinc-800 text-daw-accent hover:bg-zinc-700 transition-colors">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M10 1H7M10 1V4M10 1L5.5 5.5M5 1H2.5C1.95 1 1.5 1.45 1.5 2V9.5C1.5 10.05 1.95 10.5 2.5 10.5H10C10.55 10.5 11 10.05 11 9.5V7" /></svg>
                  Getting Started Tutorial
                </a>
                <a href="https://strudel.cc/learn/samples/" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-zinc-800 text-daw-accent hover:bg-zinc-700 transition-colors">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M10 1H7M10 1V4M10 1L5.5 5.5M5 1H2.5C1.95 1 1.5 1.45 1.5 2V9.5C1.5 10.05 1.95 10.5 2.5 10.5H10C10.55 10.5 11 10.05 11 9.5V7" /></svg>
                  Samples &amp; Sound Banks
                </a>
                <a href="https://strudel.cc/learn/effects/" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-zinc-800 text-daw-accent hover:bg-zinc-700 transition-colors">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M10 1H7M10 1V4M10 1L5.5 5.5M5 1H2.5C1.95 1 1.5 1.45 1.5 2V9.5C1.5 10.05 1.95 10.5 2.5 10.5H10C10.55 10.5 11 10.05 11 9.5V7" /></svg>
                  Effects Reference
                </a>
                <a href="https://strudel.cc/learn/mini-notation/" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-zinc-800 text-daw-accent hover:bg-zinc-700 transition-colors">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M10 1H7M10 1V4M10 1L5.5 5.5M5 1H2.5C1.95 1 1.5 1.45 1.5 2V9.5C1.5 10.05 1.95 10.5 2.5 10.5H10C10.55 10.5 11 10.05 11 9.5V7" /></svg>
                  Mini-Notation Guide
                </a>
              </div>
            )}
            {activeTab === 'console' && (
              <div className="p-2 font-mono text-[10px]">
                {consoleMessages.length === 0 ? (
                  <div className="text-zinc-600 p-2">Press play to start.</div>
                ) : consoleMessages.map((msg, i) => (
                  <div key={i} className={`py-0.5 ${msg.startsWith('!') ? 'text-red-400' : 'text-zinc-400'}`}>{msg}</div>
                ))}
                <div ref={consoleEndRef} />
              </div>
            )}
            {activeTab === 'diff' && (
              <div className="p-2 font-mono text-[10px] overflow-y-auto h-full">
                <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Version Diff</h3>
                {!diffData ? (
                  <div className="text-zinc-600 p-1">No versions captured. Click &quot;snapshot&quot; to start tracking changes.</div>
                ) : (
                  <>
                    <div className="text-zinc-500 mb-1 text-[9px]">
                      vs {diffData.lastVersion.label || `v${diffData.versionCount}`} ({new Date(diffData.lastVersion.timestamp).toLocaleTimeString()}) — {diffData.summary}
                    </div>
                    <div className="space-y-0">
                      {diffData.diff.map((line: DiffLine, i: number) => (
                        <div
                          key={i}
                          className={`py-0 px-1 ${
                            line.type === 'added' ? 'bg-emerald-900/30 text-emerald-300' :
                            line.type === 'removed' ? 'bg-red-900/30 text-red-300' :
                            'text-zinc-500'
                          }`}
                        >
                          <span className="inline-block w-3 text-right mr-1 opacity-50">
                            {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                          </span>
                          {line.content || '\u00A0'}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {activeTab === 'settings' && (
              <div className="p-3 space-y-3 text-[11px]">
                <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider">Editor</h3>
                {([
                  ['Font size', 'fontSize', 'number'] as const,
                  ['Line numbers', 'isLineNumbersDisplayed', 'bool'] as const,
                  ['Line wrapping', 'isLineWrappingEnabled', 'bool'] as const,
                  ['Bracket closing', 'isBracketClosingEnabled', 'bool'] as const,
                  ['Flash on eval', 'isFlashEnabled', 'bool'] as const,
                ] as const).map(([label, key, type]) => (
                  <label key={key} className="flex items-center justify-between text-zinc-300">
                    <span>{label}</span>
                    {type === 'bool' ? (
                      <input type="checkbox" checked={editorSettings[key] as boolean} className="accent-daw-accent"
                        onChange={(e) => {
                          const val = e.target.checked;
                          setEditorSettings((s) => ({ ...s, [key]: val }));
                          editorRef.current?.reconfigureExtension?.(key, val);
                        }}
                      />
                    ) : (
                      <div className="flex items-center gap-1">
                        <button className="w-5 h-5 flex items-center justify-center rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 text-[10px]"
                          onClick={() => {
                            const val = Math.max(10, (editorSettings[key] as number) - 1);
                            setEditorSettings((s) => ({ ...s, [key]: val }));
                            editorRef.current?.updateSettings?.({ [key]: val });
                          }}>-</button>
                        <span className="w-5 text-center text-zinc-200">{editorSettings[key]}</span>
                        <button className="w-5 h-5 flex items-center justify-center rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 text-[10px]"
                          onClick={() => {
                            const val = Math.min(30, (editorSettings[key] as number) + 1);
                            setEditorSettings((s) => ({ ...s, [key]: val }));
                            editorRef.current?.updateSettings?.({ [key]: val });
                          }}>+</button>
                      </div>
                    )}
                  </label>
                ))}

                <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider mt-3">Shortcuts</h3>
                <div className="text-zinc-500 space-y-0.5 text-[10px]">
                  <p><kbd className="text-zinc-300">Cmd+Enter</kbd> evaluate/update</p>
                  <p><kbd className="text-zinc-300">Cmd+.</kbd> stop</p>
                  <p><kbd className="text-zinc-300">Ctrl+/</kbd> toggle comment</p>
                </div>

                <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider mt-3">Links</h3>
                <a href="https://strudel.cc/workshop/getting-started" target="_blank" rel="noopener noreferrer" className="text-daw-accent hover:underline block text-[10px]">Tutorial</a>
                <a href="https://strudel.cc/learn/samples/" target="_blank" rel="noopener noreferrer" className="text-daw-accent hover:underline block text-[10px]">All Samples</a>
                <a href="https://strudel.cc/" target="_blank" rel="noopener noreferrer" className="text-daw-accent hover:underline block text-[10px]">strudel.cc</a>
              </div>
            )}
          </div>
        )}
      </div>

      {showBarsMenu && <div className="fixed inset-0 z-[1]" onClick={() => setShowBarsMenu(false)} />}
      {showVersionMenu && <div className="fixed inset-0 z-[1]" onClick={() => setShowVersionMenu(false)} />}
      <input
        ref={fileInputRef}
        type="file"
        accept=".mid,.midi"
        className="hidden"
        onChange={(event) => { void handleFileInputChange(event); }}
      />
    </div>
  );
}
