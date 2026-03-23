/**
 * StrudelEditor — Global tool panel: strudel.cc iframe + code input for bounce.
 *
 * The iframe is read-only (cross-origin, can't extract code from it).
 * For "Send to Track", user pastes their code into the bounce input area.
 */
import { useState, useCallback, useRef } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { Z } from '../../utils/zIndex';

const DEFAULT_STRUDEL_URL = 'https://strudel.cc/';
const DEFAULT_CODE = `s("[bd <hh oh>]*2, [~ cp]*2").bank("RolandTR909")`;

export function StrudelEditor() {
  const strudelPanelOpen = useUIStore((s) => s.strudelPanelOpen);
  const toggleStrudelPanel = useUIStore((s) => s.toggleStrudelPanel);
  const project = useProjectStore((s) => s.project);

  const [editorHeight, setEditorHeight] = useState(500);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [bouncing, setBouncing] = useState(false);
  const [bounceProgress, setBounceProgress] = useState(0);
  const [bounceBars, setBounceBars] = useState(4);
  const [showBarsMenu, setShowBarsMenu] = useState(false);
  const [bounceCode, setBounceCode] = useState(DEFAULT_CODE);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Resize
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = editorHeight;
    const onMove = (ev: MouseEvent) => {
      setEditorHeight(Math.max(300, Math.min(800, startH + startY - ev.clientY)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [editorHeight]);

  // Bounce: render the code from the textarea (NOT from the iframe)
  const handleBounce = useCallback(async () => {
    if (!project || bouncing || !bounceCode.trim()) return;
    setBouncing(true);
    setBounceProgress(0);
    try {
      const store = useProjectStore.getState();
      // Ensure a strudel track exists to store the code
      let strudelTrack = store.project?.tracks.find((t) => t.trackType === 'strudel');
      if (!strudelTrack) {
        strudelTrack = store.addTrack('strudel');
      }
      // Update the track's code to match what user wants to bounce
      if (strudelTrack) {
        store.updateStrudelCode(strudelTrack.id, bounceCode);
        await store.freezeStrudelToAudio(strudelTrack.id, bounceBars, (p: number) => setBounceProgress(p));
      }
    } catch (err: any) {
      console.error('Strudel bounce failed:', err);
    } finally {
      setBouncing(false);
      setBounceProgress(0);
    }
  }, [project, bouncing, bounceCode, bounceBars]);

  if (!strudelPanelOpen) return null;

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

      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 h-8 border-b border-zinc-700/60 shrink-0 bg-[#111118]">
        <span className="text-[13px] leading-none opacity-70">꩜</span>
        <span className="text-[11px] text-zinc-500">Strudel</span>

        <div className="flex-1" />

        {/* Toggle code input */}
        <button
          onClick={() => { setShowCodeInput(!showCodeInput); if (!showCodeInput) setTimeout(() => textareaRef.current?.focus(), 50); }}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors ${
            showCodeInput ? 'text-white bg-zinc-700' : 'text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200'
          }`}
          title="Toggle code input for bounce"
        >
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <path d="M4 4L1 7l3 3M10 4l3 3-3 3M8 2l-2 10" />
          </svg>
          code
        </button>

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
          disabled={bouncing || !project || !bounceCode.trim()}
          className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
            bouncing
              ? 'text-zinc-500 cursor-wait'
              : !bounceCode.trim()
                ? 'text-zinc-600 cursor-not-allowed'
                : 'text-daw-accent hover:bg-daw-accent/10'
          }`}
          title={bounceCode.trim() ? `Record ${bounceBars} bars of the code below and add to timeline` : 'Paste strudel code first'}
        >
          {bouncing ? (
            <>
              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
                <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
              </svg>
              Recording {Math.round(bounceProgress * 100)}%
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
          onClick={toggleStrudelPanel}
          className="flex h-5 w-5 items-center justify-center rounded text-zinc-500 hover:bg-zinc-700/50 hover:text-zinc-200 transition-colors"
          title="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 2l6 6M8 2l-6 6" />
          </svg>
        </button>
      </div>

      {/* Code input for bounce — collapsible */}
      {showCodeInput && (
        <div className="shrink-0 border-b border-zinc-700/40 bg-[#0d0d14]">
          <div className="px-3 py-1.5 flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 shrink-0">Paste your strudel code here to bounce:</span>
            <div className="flex-1" />
            <span className="text-[10px] text-zinc-600">{bounceCode.split('\n').length} lines</span>
          </div>
          <textarea
            ref={textareaRef}
            value={bounceCode}
            onChange={(e) => setBounceCode(e.target.value)}
            className="w-full px-3 pb-2 bg-transparent text-[13px] text-zinc-200 font-mono resize-none outline-none"
            style={{ minHeight: 60, maxHeight: 120 }}
            rows={Math.min(6, Math.max(2, bounceCode.split('\n').length))}
            spellCheck={false}
            placeholder='s("[bd sd]*2").bank("RolandTR808")'
          />
        </div>
      )}

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
          src={DEFAULT_STRUDEL_URL}
          className="w-full h-full border-0"
          onLoad={() => setIframeLoaded(true)}
          allow="autoplay; microphone"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          title="Strudel REPL"
          data-testid="strudel-iframe"
        />
      </div>

      {/* Click-away for bars menu */}
      {showBarsMenu && (
        <div className="fixed inset-0 z-[1]" onClick={() => setShowBarsMenu(false)} />
      )}
    </div>
  );
}
