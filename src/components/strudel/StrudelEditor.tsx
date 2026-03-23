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

type SidebarTab = 'sounds' | 'reference' | 'console' | 'settings';


const SOUND_BANKS = [
  { name: 'Default (dirt-samples)', sounds: 'bd, sd, hh, oh, cp, sn, lt, mt, ht, rim, cb, cy, cr' },
  { name: 'tr909', sounds: 'bd, sd, hh, oh, cp, lt, mt, ht, cy, rc, rs' },
  { name: 'tr808', sounds: 'bd, sd, hh, oh, cp, cb, lt, mt, ht, lc, mc, hc, cl, ma, cy, rs' },
  { name: 'cr78', sounds: 'bd, sd, hh, oh, cp, cb, ma, gu, ta, co, cl' },
];

/* ── Component ─────────────────────────────────────── */

export function StrudelEditor() {
  const strudelPanelOpen = useUIStore((s) => s.strudelPanelOpen);
  const toggleStrudelPanel = useUIStore((s) => s.toggleStrudelPanel);
  const project = useProjectStore((s) => s.project);

  const [editorHeight, setEditorHeight] = useState(380);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bouncing, setBouncing] = useState(false);
  const [bounceProgress, setBounceProgress] = useState(0);
  const [bounceBars, setBounceBars] = useState(4);
  const [showBarsMenu, setShowBarsMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SidebarTab | null>(null);
  const [consoleMessages, setConsoleMessages] = useState<string[]>([]);
  const [showVersionMenu, setShowVersionMenu] = useState(false);

  const captureStrudelVersion = useProjectStore((s) => s.captureStrudelVersion);
  const restoreStrudelVersion = useProjectStore((s) => s.restoreStrudelVersion);

  // Find the current strudel track and its versions
  const strudelTrack = useMemo(
    () => project?.tracks.find((t) => t.trackType === 'strudel') ?? null,
    [project],
  );
  const versions = strudelTrack?.strudelVersions ?? [];

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
        let strudelTrack = store.project?.tracks.find((t) => t.trackType === 'strudel');
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
              let track = st.project?.tracks.find((t) => t.trackType === 'strudel');
              if (!track) track = st.addTrack('strudel');
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
        setIsLoading(false);
        setConsoleMessages(['🌀 Strudel ready']);
      } catch (err) {
        console.error('[StrudelEditor] init failed:', err);
        setIsLoading(false);
        setError(err instanceof Error ? err.message : 'Failed to load editor');
      }
    })();

    return () => {
      mounted = false;
      if (editorRef.current) { try { editorRef.current.stop(); } catch { /* */ } editorRef.current = null; }
      if (containerRef.current) containerRef.current.innerHTML = '';
      setIsPlaying(false);
    };
  }, [strudelPanelOpen]);

  // Play / Stop
  const togglePlay = useCallback(() => {
    if (!editorRef.current) return;
    if (isPlaying) {
      editorRef.current.stop();
      setIsPlaying(false);
      setConsoleMessages((prev) => [...prev.slice(-50), '⏹ stopped']);
    } else {
      editorRef.current.evaluate();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  // Update (re-evaluate while playing)
  const handleUpdate = useCallback(() => {
    if (!editorRef.current) return;
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
        editorRef.current.evaluate();
        setIsPlaying(true);
        await new Promise((r) => setTimeout(r, 300));
      }
      const store = useProjectStore.getState();
      let strudelTrack = store.project?.tracks.find((t) => t.trackType === 'strudel');
      if (!strudelTrack) strudelTrack = store.addTrack('strudel');
      if (strudelTrack) {
        await store.freezeStrudelToAudio(strudelTrack.id, bounceBars, (p: number) => setBounceProgress(p));
        setConsoleMessages((prev) => [...prev.slice(-50), `✓ sent ${bounceBars} bars to track`]);
      }
    } catch (err: any) {
      console.error('Strudel bounce failed:', err);
      setError(err?.message ?? 'Bounce failed');
      setConsoleMessages((prev) => [...prev.slice(-50), `! bounce failed: ${err?.message}`]);
    } finally {
      setBouncing(false);
      setBounceProgress(0);
    }
  }, [project, bouncing, bounceBars]);

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

        <div className="flex-1" />

        {/* Error */}
        {error && <span className="text-[10px] text-red-400 truncate max-w-[150px]" title={error}>{error}</span>}

        {/* Sidebar tabs */}
        {(['sounds', 'reference', 'console', 'settings'] as SidebarTab[]).map((tab) => (
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
        {strudelTrack && (
          <>
            <button
              onClick={() => { captureStrudelVersion(strudelTrack.id); setConsoleMessages((prev) => [...prev.slice(-50), '📸 version captured']); }}
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
                  {versions.map((v, idx) => (
                    <button
                      key={v.id}
                      onClick={() => { restoreStrudelVersion(strudelTrack.id, idx); setShowVersionMenu(false); setConsoleMessages((prev) => [...prev.slice(-50), `↩ restored v${idx + 1}`]); }}
                      className="w-full text-left px-2 py-1 text-[11px] text-zinc-400 hover:bg-zinc-700 hover:text-white flex items-center justify-between"
                    >
                      <span>{v.label || `v${idx + 1}`}</span>
                      <span className="text-[9px] text-zinc-600">{new Date(v.timestamp).toLocaleTimeString()}</span>
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

        {/* Close */}
        <button onClick={() => { if (editorRef.current) { try { editorRef.current.stop(); } catch {} } setIsPlaying(false); toggleStrudelPanel(); }}
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
    </div>
  );
}
