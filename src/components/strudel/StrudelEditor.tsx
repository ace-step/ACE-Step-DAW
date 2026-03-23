/**
 * StrudelEditor — Bottom panel code editor for strudel tracks.
 *
 * Follows the same docked-bottom pattern as SequencerEditor and PianoRoll.
 * Opens when a strudel track is selected, shows CodeMirror 6 editor with
 * the track's pattern code. Ctrl+Enter evaluates the pattern.
 *
 * ┌─────────────────────────────────────────────────┐
 * │ ═══ resize handle ═══                           │
 * │ [▶ Evaluate] [cycleLength] [track: Strudel]  ✕ │ ← toolbar (28px)
 * │                                                  │
 * │  // Strudel Pattern                             │
 * │  s("bd sd bd sd").bank("RolandTR808")           │ ← code area (flex)
 * │                                                  │
 * │ ▸ Console                                       │ ← error output (collapsed)
 * └─────────────────────────────────────────────────┘
 */
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { evaluateStrudelCode, queryPatternEvents } from '../../engine/strudelEngine';
import { Z } from '../../utils/zIndex';

// CodeMirror imports
import { EditorView, keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';

/** Dark theme matching DAW palette. */
const dawTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--color-daw-surface, #1c1d22)',
    color: '#e4e4e7',
    fontSize: '13px',
    fontFamily: 'ui-monospace, "JetBrains Mono", "Fira Code", monospace',
  },
  '.cm-content': {
    caretColor: '#4a90d9',
    padding: '8px 0',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--color-daw-surface-2, #2a2a2a)',
    color: '#6b7280',
    borderRight: '1px solid #333',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'rgba(74,144,217,0.3)',
  },
  '.cm-cursor': {
    borderLeftColor: '#4a90d9',
  },
}, { dark: true });

export function StrudelEditor() {
  const trackId = useUIStore((s) => s.openStrudelEditorTrackId);
  const closeEditor = useUIStore((s) => s.setOpenStrudelEditor);
  const setKeyboardContext = useUIStore((s) => s.setKeyboardContext);

  const project = useProjectStore((s) => s.project);
  const updateStrudelCode = useProjectStore((s) => s.updateStrudelCode);

  const track = useMemo(
    () => project?.tracks.find((t) => t.id === trackId) ?? null,
    [project, trackId],
  );

  const [editorHeight, setEditorHeight] = useState(240);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [showConsole, setShowConsole] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalSuccess, setEvalSuccess] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const resizeRef = useRef<{ startY: number; startH: number } | null>(null);

  // Evaluate the current code in the editor
  const handleEvaluate = useCallback(async () => {
    if (!viewRef.current || !trackId) return;
    const code = viewRef.current.state.doc.toString();
    setIsEvaluating(true);
    setEvalError(null);
    try {
      const pattern = await evaluateStrudelCode(code);
      // Verify pattern produces events (basic validation)
      queryPatternEvents(pattern, 0, 1);
      // Persist to store
      updateStrudelCode(trackId, code);
      setEvalSuccess(true);
      setShowConsole(false);
      setTimeout(() => setEvalSuccess(false), 600);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setEvalError(msg);
      setShowConsole(true);
    } finally {
      setIsEvaluating(false);
    }
  }, [trackId, updateStrudelCode]);

  // Initialize CodeMirror
  useEffect(() => {
    if (!editorRef.current || !track) return;

    // Don't recreate if view already exists for same track
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    const evalKeymap = keymap.of([{
      key: 'Mod-Enter',
      run: () => {
        handleEvaluate();
        return true;
      },
    }]);

    const state = EditorState.create({
      doc: track.strudelCode ?? '',
      extensions: [
        dawTheme,
        javascript(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        evalKeymap,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.view.hasFocus) {
            setKeyboardContext('strudel', trackId);
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId, track?.id]);

  // Handle Escape to return keyboard context
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && viewRef.current?.hasFocus) {
        viewRef.current.contentDOM.blur();
        setKeyboardContext('timeline');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setKeyboardContext]);

  // Resize handle
  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    resizeRef.current = { startY: e.clientY, startH: editorHeight };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const newH = Math.max(120, Math.min(500, resizeRef.current.startH + resizeRef.current.startY - ev.clientY));
      setEditorHeight(newH);
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  if (!trackId || !track) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 border-t border-daw-border bg-daw-surface flex flex-col"
      style={{ height: editorHeight, zIndex: Z.panel }}
      data-testid="strudel-editor-panel"
    >
      {/* Resize handle */}
      <div
        className="h-[6px] cursor-row-resize hover:bg-daw-accent/20 transition-colors shrink-0"
        onMouseDown={onResizeStart}
      />

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 h-7 border-b border-[#333] shrink-0 bg-daw-surface-2">
        <button
          onClick={handleEvaluate}
          disabled={isEvaluating}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
            evalSuccess
              ? 'bg-emerald-600/30 text-emerald-300'
              : 'bg-daw-accent/20 text-daw-accent hover:bg-daw-accent/30'
          } disabled:opacity-50`}
          title="Evaluate pattern (Ctrl+Enter)"
          data-testid="strudel-evaluate-btn"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <path d="M2 1l6 4-6 4V1z" />
          </svg>
          {isEvaluating ? 'Evaluating...' : evalSuccess ? 'OK' : 'Evaluate'}
        </button>

        <div className="h-3 w-px bg-[#444]" />

        <span className="text-[11px] text-zinc-400 truncate">
          {track.displayName}
        </span>

        {evalError && (
          <button
            onClick={() => setShowConsole(!showConsole)}
            className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-red-400 hover:bg-red-500/10"
            data-testid="strudel-error-badge"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <circle cx="5" cy="5" r="4" />
            </svg>
            Error
          </button>
        )}

        <button
          onClick={() => closeEditor(null)}
          className="ml-auto flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-[#333] hover:text-zinc-200"
          title="Close editor"
          aria-label="Close strudel editor"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 2l6 6M8 2l-6 6" />
          </svg>
        </button>
      </div>

      {/* Code editor */}
      <div
        ref={editorRef}
        className="flex-1 min-h-0 overflow-auto"
        data-testid="strudel-code-editor"
      />

      {/* Console/error output */}
      {showConsole && evalError && (
        <div
          className="border-t border-[#333] px-3 py-2 text-[11px] text-red-400 bg-[#1a1a1a] max-h-20 overflow-y-auto shrink-0"
          style={{ borderLeft: '3px solid #ef4444' }}
          data-testid="strudel-error-console"
        >
          {evalError}
        </div>
      )}
    </div>
  );
}
