/**
 * StrudelEditor — StrudelMirror-based editor (no iframe).
 *
 * Everything runs in one module graph: editor, transpiler, webaudio, samples.
 * This ensures code evaluation, playback, and audio export all share the same
 * superdough instance — solving the module duplication issue that broke iframe export.
 *
 * Flow: edit code → Cmd+Enter to play → hear audio → Send to Track to export
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { Z } from '../../utils/zIndex';

const DEFAULT_CODE = `s("[bd <hh oh>]*2, [~ cp]*2")`;

export function StrudelEditor() {
  const strudelPanelOpen = useUIStore((s) => s.strudelPanelOpen);
  const toggleStrudelPanel = useUIStore((s) => s.toggleStrudelPanel);
  const project = useProjectStore((s) => s.project);

  const [editorHeight, setEditorHeight] = useState(350);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bouncing, setBouncing] = useState(false);
  const [bounceProgress, setBounceProgress] = useState(0);
  const [bounceBars, setBounceBars] = useState(4);
  const [showBarsMenu, setShowBarsMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);

  // Initialize StrudelMirror
  useEffect(() => {
    if (!containerRef.current || !strudelPanelOpen) return;
    let mounted = true;

    (async () => {
      setIsLoading(true);
      try {
        // Import everything from the SAME module graph
        const [codemirrorMod, webaudioMod, transpilerMod, miniMod, tonalMod] = await Promise.all([
          import('@strudel/codemirror') as any,
          import('@strudel/webaudio') as any,
          import('@strudel/transpiler') as any,
          import('@strudel/mini') as any,
          import('@strudel/tonal').catch(() => ({})),
        ]);

        if (!mounted || !containerRef.current) return;

        // Register synth sounds + mini-notation
        webaudioMod.registerSynthSounds?.();
        miniMod.miniAllStrings?.();

        // Register DSL functions on globalThis
        const core = await import('@strudel/core') as any;
        if (core.evalScope) {
          await core.evalScope(core, miniMod, webaudioMod, codemirrorMod, tonalMod);
        }

        // Init audio engine (worklets)
        webaudioMod.initAudioOnFirstClick?.();

        // Load samples (prebake from @strudel/repl uses SAME superdough instance now)
        try {
          const { prebake } = await import('@strudel/repl');
          await prebake();
        } catch {
          // Fallback
          await webaudioMod.samples?.('github:tidalcycles/dirt-samples').catch(() => {});
        }

        if (!mounted || !containerRef.current) return;
        containerRef.current.innerHTML = '';

        // Get initial code from strudel track or default
        const store = useProjectStore.getState();
        let strudelTrack = store.project?.tracks.find((t) => t.trackType === 'strudel');
        const initialCode = strudelTrack?.strudelCode?.replace(/^\/\/.*\n?/gm, '').trim() || DEFAULT_CODE;

        // Create StrudelMirror editor
        const editor = new codemirrorMod.StrudelMirror({
          defaultOutput: webaudioMod.webaudioOutput,
          getTime: () => (webaudioMod.getAudioContext?.() ?? new AudioContext()).currentTime,
          transpiler: transpilerMod.transpiler,
          root: containerRef.current,
          initialCode,
          prebake: () => Promise.resolve(), // already prebaked above
          onUpdateState: (state: any) => {
            // Sync code back to store
            if (state.activeCode) {
              const st = useProjectStore.getState();
              let track = st.project?.tracks.find((t) => t.trackType === 'strudel');
              if (!track) {
                track = st.addTrack('strudel');
              }
              if (track) {
                st.updateStrudelCode(track.id, state.activeCode);
              }
            }
            if (state.started !== undefined) {
              setIsPlaying(state.started);
            }
            if (state.error) {
              setError(state.error);
            } else if (state.activeCode) {
              setError(null);
            }
          },
        });

        editorRef.current = editor;
        setIsLoading(false);
      } catch (err) {
        console.error('[StrudelEditor] init failed:', err);
        setIsLoading(false);
        setError(err instanceof Error ? err.message : 'Failed to load editor');
      }
    })();

    return () => {
      mounted = false;
      if (editorRef.current) {
        try { editorRef.current.stop(); } catch { /* */ }
        editorRef.current = null;
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
      setIsPlaying(false);
    };
  }, [strudelPanelOpen]);

  // Toggle play/stop
  const togglePlay = useCallback(() => {
    if (!editorRef.current) return;
    if (isPlaying) {
      editorRef.current.stop();
      setIsPlaying(false);
    } else {
      editorRef.current.evaluate();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  // Send to Track — first evaluate current code, then record
  const handleBounce = useCallback(async () => {
    if (!project || bouncing) return;
    setBouncing(true);
    setBounceProgress(0);
    try {
      // First: evaluate current code (this both plays it AND syncs to store via onUpdateState)
      if (editorRef.current) {
        editorRef.current.evaluate();
        setIsPlaying(true);
        // Give the evaluate a moment to trigger onUpdateState
        await new Promise((r) => setTimeout(r, 300));
      }

      const store = useProjectStore.getState();
      let strudelTrack = store.project?.tracks.find((t) => t.trackType === 'strudel');
      if (!strudelTrack) {
        strudelTrack = store.addTrack('strudel');
      }
      if (strudelTrack) {
        await store.freezeStrudelToAudio(strudelTrack.id, bounceBars, (p: number) => setBounceProgress(p));
      }
    } catch (err: any) {
      console.error('Strudel bounce failed:', err);
      setError(err?.message ?? 'Bounce failed');
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
    const onMove = (ev: MouseEvent) => {
      setEditorHeight(Math.max(200, Math.min(700, startH + startY - ev.clientY)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
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
      {/* Resize handle */}
      <div
        className="h-[5px] cursor-row-resize hover:bg-daw-accent/20 transition-colors shrink-0"
        onMouseDown={onResizeStart}
      />

      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 h-8 border-b border-zinc-700/60 shrink-0 bg-[#111118]">
        {/* Play / Stop */}
        <button
          onClick={togglePlay}
          disabled={isLoading}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
            isPlaying
              ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'
              : 'text-zinc-400 hover:bg-zinc-700/50 hover:text-white'
          }`}
          title={isPlaying ? 'Stop' : 'Play (Cmd+Enter in editor)'}
        >
          {isPlaying ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect x="1" y="1" width="8" height="8" rx="1" /></svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><polygon points="2,0 10,5 2,10" /></svg>
          )}
          {isPlaying ? 'stop' : 'play'}
        </button>

        <span className="text-[11px] text-zinc-600 ml-1">꩜ Strudel</span>

        <div className="flex-1" />

        {/* Error indicator */}
        {error && (
          <span className="text-[10px] text-red-400 truncate max-w-[200px]" title={error}>
            {error}
          </span>
        )}

        {/* Bars selector */}
        <div className="relative">
          <button
            onClick={() => setShowBarsMenu(!showBarsMenu)}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200 transition-colors"
          >
            {bounceBars} {bounceBars === 1 ? 'bar' : 'bars'}
            <svg width="7" height="7" viewBox="0 0 8 8" fill="currentColor" className="opacity-50">
              <path d="M1 3l3 3 3-3" />
            </svg>
          </button>
          {showBarsMenu && (
            <div className="absolute top-full right-0 mt-1 bg-zinc-800 border border-zinc-600 rounded shadow-lg py-0.5 min-w-[80px] z-20">
              {[1, 2, 4, 8, 16].map((bars) => (
                <button
                  key={bars}
                  onClick={() => { setBounceBars(bars); setShowBarsMenu(false); }}
                  className={`w-full text-left px-3 py-1 text-[11px] transition-colors ${
                    bars === bounceBars ? 'text-white bg-zinc-700' : 'text-zinc-400 hover:bg-zinc-700 hover:text-white'
                  }`}
                >
                  {bars} {bars === 1 ? 'bar' : 'bars'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Send to Track */}
        <button
          onClick={handleBounce}
          disabled={bouncing || !project || isLoading}
          className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
            bouncing ? 'text-zinc-500 cursor-wait' : 'text-daw-accent hover:bg-daw-accent/10'
          }`}
          title={`Record ${bounceBars} bars and add to timeline`}
        >
          {bouncing ? (
            <>
              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
                <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
              </svg>
              {Math.round(bounceProgress * 100)}%
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M3 7h8M8 4l3 3-3 3" />
              </svg>
              Send to Track
            </>
          )}
        </button>

        {/* Close */}
        <button
          onClick={() => {
            if (editorRef.current) { try { editorRef.current.stop(); } catch { /* */ } }
            setIsPlaying(false);
            toggleStrudelPanel();
          }}
          className="flex h-5 w-5 items-center justify-center rounded text-zinc-500 hover:bg-zinc-700/50 hover:text-zinc-200 transition-colors"
          title="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 2l6 6M8 2l-6 6" />
          </svg>
        </button>
      </div>

      {/* Editor area */}
      <div className="flex-1 min-h-0 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-sm z-10 bg-[#1a1a2e]">
            <div className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
                <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
              </svg>
              Loading Strudel...
            </div>
          </div>
        )}
        <div
          ref={containerRef}
          className="h-full overflow-auto strudel-editor"
          data-testid="strudel-mirror-container"
        />
      </div>

      {/* Click-away for bars menu */}
      {showBarsMenu && (
        <div className="fixed inset-0 z-[1]" onClick={() => setShowBarsMenu(false)} />
      )}
    </div>
  );
}
