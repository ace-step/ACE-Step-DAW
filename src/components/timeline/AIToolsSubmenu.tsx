import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSubmenu,
  CONTEXT_MENU,
} from '../ui/ContextMenu';

export interface ClipAIContext {
  onRegenerate?: () => void;
  onSeparateStems?: () => void;
  onGenerateAccompaniment?: () => void;
  onAnalyze?: () => void;
  onConvertToMidi?: () => void;
  onCreateQuickSampler?: () => void;
  onQuantizeAudio?: () => void;
  onClearAudioQuantize?: () => void;
  hasPrompt?: boolean;
  isReady?: boolean;
}

interface AIToolsSubmenuProps {
  onInspireMe: () => void;
  onAddLayer: () => void;
  onMusicEnhancer: () => void;
  clipContext?: ClipAIContext;
  openLeft?: boolean;
}

export function AIToolsSubmenu({
  onInspireMe,
  onAddLayer,
  onMusicEnhancer,
  clipContext,
  openLeft = false,
}: AIToolsSubmenuProps) {
  const [showSubmenu, setShowSubmenu] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submenuRef = useRef<HTMLDivElement>(null);

  const openSubmenuFn = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    hoverTimerRef.current = setTimeout(() => setShowSubmenu(true), 80);
  }, []);

  const closeSubmenuFn = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    leaveTimerRef.current = setTimeout(() => setShowSubmenu(false), 150);
  }, []);

  const handleMouseEnterSubmenu = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  const handleTriggerKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setShowSubmenu(true);
    }
  }, []);

  const handleSubmenuKeyDown = useCallback((e: React.KeyboardEvent) => {
    const menu = submenuRef.current;
    if (!menu) return;
    const items = Array.from(menu.querySelectorAll<HTMLElement>('button:not([disabled])'));
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
      items[next]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
      items[prev]?.focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'Escape') {
      e.preventDefault();
      setShowSubmenu(false);
    }
  }, []);

  useEffect(() => {
    if (showSubmenu && submenuRef.current) {
      const firstItem = submenuRef.current.querySelector<HTMLElement>('button:not([disabled])');
      firstItem?.focus();
    }
  }, [showSubmenu]);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    };
  }, []);

  const submenuPosition: React.CSSProperties = openLeft
    ? { position: 'absolute', top: 0, right: '100%', marginRight: -2 }
    : { position: 'absolute', top: 0, left: '100%', marginLeft: -2 };

  return (
    <div
      className="relative"
      data-testid="ai-tools-submenu-trigger"
      onMouseEnter={openSubmenuFn}
      onMouseLeave={closeSubmenuFn}
      onKeyDown={handleTriggerKeyDown}
    >
      <button
        data-menu-item
        role="menuitem"
        className="w-full text-left flex items-center justify-between cursor-pointer"
        style={{
          padding: '5px 12px',
          fontSize: CONTEXT_MENU.fontSize,
          border: 'none',
          background: showSubmenu ? CONTEXT_MENU.hoverBg : 'transparent',
          color: showSubmenu ? '#fff' : CONTEXT_MENU.textColor,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = CONTEXT_MENU.hoverBg;
          e.currentTarget.style.color = '#fff';
        }}
        onMouseLeave={(e) => {
          if (!showSubmenu) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = CONTEXT_MENU.textColor;
          }
        }}
      >
        <span>AI Tools</span>
        <svg
          className="pointer-events-none"
          width="8"
          height="8"
          viewBox="0 0 8 8"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d={openLeft ? 'M6 1L2 4L6 7' : 'M2 1L6 4L2 7'}
            stroke="#666"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {showSubmenu && (
        <div
          data-testid="ai-tools-submenu-panel"
          style={submenuPosition}
          onMouseEnter={handleMouseEnterSubmenu}
          onMouseLeave={closeSubmenuFn}
        >
          <ContextMenuSubmenu>
            <div ref={submenuRef} role="menu" onKeyDown={handleSubmenuKeyDown}>
              <ContextMenuItem label="Inspire Me" onClick={onInspireMe} color="#a78bfa" />
              <ContextMenuItem label="Add a Layer" onClick={onAddLayer} color="#67e8f9" />
              <ContextMenuItem label="Music Enhancer" onClick={onMusicEnhancer} color="#6ee7b7" />
              <ContextMenuSeparator />
              <ContextMenuItem label="Voice Changer" onClick={() => {}} disabled />
              <ContextMenuItem label="Stem Splitter" onClick={() => {}} disabled />
              <ContextMenuItem label="Sound Effects" onClick={() => {}} disabled />

              {clipContext && (
                <>
                  <ContextMenuSeparator />
                  {clipContext.onRegenerate && (
                    <ContextMenuItem
                      label="Regenerate"
                      onClick={clipContext.onRegenerate}
                      disabled={!clipContext.hasPrompt}
                    />
                  )}
                  {clipContext.onSeparateStems && (
                    <ContextMenuItem label="Separate Stems..." onClick={clipContext.onSeparateStems} color="#7dd3fc" />
                  )}
                  {clipContext.onGenerateAccompaniment && (
                    <ContextMenuItem label="Generate Accompaniment..." onClick={clipContext.onGenerateAccompaniment} color="#6ee7b7" />
                  )}
                  {clipContext.onAnalyze && (
                    <ContextMenuItem label="Analyze Audio..." onClick={clipContext.onAnalyze} color="#67e8f9" />
                  )}
                  {clipContext.onConvertToMidi && (
                    <ContextMenuItem label="Convert to MIDI..." onClick={clipContext.onConvertToMidi} color="#c4b5fd" />
                  )}
                  {clipContext.onCreateQuickSampler && (
                    <ContextMenuItem label="Create Quick Sampler" onClick={clipContext.onCreateQuickSampler} color="#fdba74" />
                  )}
                  {clipContext.onQuantizeAudio && (
                    <ContextMenuItem label="Quantize Audio" onClick={clipContext.onQuantizeAudio} color="#5eead4" />
                  )}
                  {clipContext.onClearAudioQuantize && (
                    <ContextMenuItem label="Clear Audio Quantize" onClick={clipContext.onClearAudioQuantize} color="#a1a1aa" />
                  )}
                </>
              )}
            </div>
          </ContextMenuSubmenu>
        </div>
      )}
    </div>
  );
}
