/**
 * StrudelEditor — Embeds the full strudel.cc website in an iframe.
 * The user gets the complete strudel.cc experience (editor, sidebar tabs,
 * welcome, patterns, sounds, reference, console, settings) natively.
 */
import { useState, useMemo, useCallback } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { Z } from '../../utils/zIndex';

/** Encode code for strudel.cc URL hash */
function codeToStrudelUrl(code: string): string {
  const cleaned = code
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n')
    .trim();
  if (!cleaned) return 'https://strudel.cc/';
  try {
    return `https://strudel.cc/#${btoa(unescape(encodeURIComponent(cleaned)))}`;
  } catch {
    return 'https://strudel.cc/';
  }
}

const DEFAULT_CODE = `s("[bd <hh oh>]*2, [~ cp]*2").bank("RolandTR909")`;

export function StrudelEditor() {
  const trackId = useUIStore((s) => s.openStrudelEditorTrackId);
  const closeEditor = useUIStore((s) => s.setOpenStrudelEditor);

  const project = useProjectStore((s) => s.project);

  const track = useMemo(
    () => project?.tracks.find((t) => t.id === trackId) ?? null,
    [project, trackId],
  );

  const [editorHeight, setEditorHeight] = useState(450);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  // Build iframe URL from track's strudel code
  const iframeUrl = useMemo(() => {
    const code = track?.strudelCode ?? DEFAULT_CODE;
    return codeToStrudelUrl(code);
  }, [track?.strudelCode]);

  // Resize handle
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = editorHeight;
    const onMove = (ev: MouseEvent) => {
      setEditorHeight(Math.max(250, Math.min(800, startH + startY - ev.clientY)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [editorHeight]);

  if (!trackId || !track) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 border-t border-zinc-700 bg-[#16161e] flex flex-col"
      style={{ height: editorHeight, zIndex: Z.panel }}
      data-testid="strudel-editor-panel"
    >
      {/* Resize handle */}
      <div
        className="h-[5px] cursor-row-resize hover:bg-daw-accent/20 transition-colors shrink-0"
        onMouseDown={onResizeStart}
      />

      {/* Close button — top-right corner over iframe */}
      <div className="absolute top-[5px] right-1 z-10">
        <button
          onClick={() => closeEditor(null)}
          className="flex h-5 w-5 items-center justify-center rounded bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
          title="Close editor"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 2l6 6M8 2l-6 6" />
          </svg>
        </button>
      </div>

      {/* iframe — full strudel.cc */}
      <div className="flex-1 min-h-0 relative">
        {!iframeLoaded && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-sm z-10 bg-[#16161e]">
            <div className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
                <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
              </svg>
              Loading strudel.cc...
            </div>
          </div>
        )}
        <iframe
          src={iframeUrl}
          className="w-full h-full border-0"
          onLoad={() => setIframeLoaded(true)}
          allow="autoplay; microphone"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          title="Strudel REPL"
          data-testid="strudel-iframe"
        />
      </div>
    </div>
  );
}
