import { useState, useRef, useCallback, useEffect } from 'react';
import { TRACK_COLOR_PALETTE } from '../../constants/colorPalette';
import { ContextMenuWrapper, ContextMenuItem, ContextMenuSeparator, ContextMenuSubmenu } from '../ui/ContextMenu';

interface ClipContextMenuProps {
  x: number;
  y: number;
  onEdit: () => void;
  onGenerate: () => void;
  onRegenerate: () => void;
  onOpenMidi: () => void;
  onExportMidi: () => void;
  onDuplicate: () => void;
  onConsolidate: () => void;
  onDelete: () => void;
  onAddLayer: () => void;
  onCreateCover: () => void;
  onRepaint: () => void;
  onVocal2BGM: () => void;
  onAnalyze: () => void;
  onSeparateStems: () => void;
  onConvertToMidi: () => void;
  onCreateQuickSampler: () => void;
  onQuantizeAudio: () => void;
  onClearAudioQuantize: () => void;
  onSplitAtPlayhead: () => void;
  onAssignColor: (color: string) => void;
  onResetColor: () => void;
  onToggleMute: () => void;
  onClose: () => void;
  isMuted: boolean;
  hasPrompt: boolean;
  isReady: boolean;
  isMidiClip: boolean;
  isVocalTrack: boolean;
  hasAudio: boolean;
  hasWarpMarkers: boolean;
  canConsolidate: boolean;
  hasCustomColor: boolean;
}

/** Minimum submenu width for viewport edge detection */
const SUBMENU_MIN_WIDTH = 140;

export function ClipContextMenu({
  x,
  y,
  onEdit,
  onGenerate,
  onRegenerate,
  onOpenMidi,
  onExportMidi,
  onDuplicate,
  onConsolidate,
  onDelete,
  onAddLayer,
  onCreateCover,
  onRepaint,
  onVocal2BGM,
  onAnalyze,
  onSeparateStems,
  onConvertToMidi,
  onCreateQuickSampler,
  onQuantizeAudio,
  onClearAudioQuantize,
  onSplitAtPlayhead,
  onAssignColor,
  onResetColor,
  onToggleMute,
  onClose,
  isMuted,
  hasPrompt,
  isReady,
  isMidiClip,
  isVocalTrack,
  hasAudio,
  hasWarpMarkers,
  canConsolidate,
  hasCustomColor,
}: ClipContextMenuProps) {
  const [showColorMenu, setShowColorMenu] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  // Determine if submenu should open to the left (viewport edge detection)
  const openLeft = x + 190 + SUBMENU_MIN_WIDTH + 20 > window.innerWidth;

  const openSubmenu = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    hoverTimerRef.current = setTimeout(() => {
      setShowColorMenu(true);
    }, 80);
  }, []);

  const closeSubmenu = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    leaveTimerRef.current = setTimeout(() => {
      setShowColorMenu(false);
    }, 150);
  }, []);

  const handleMouseEnterSubmenu = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  const handleSubmenuKeyDown = useCallback((e: React.KeyboardEvent) => {
    const menu = submenuRef.current;
    if (!menu) return;
    const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
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
      setShowColorMenu(false);
    }
  }, []);

  const handleTriggerKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setShowColorMenu(true);
    }
  }, []);

  // Focus first item when submenu opens
  useEffect(() => {
    if (showColorMenu && submenuRef.current) {
      const firstItem = submenuRef.current.querySelector<HTMLElement>('[role="menuitem"]');
      firstItem?.focus();
    }
  }, [showColorMenu]);

  // Clean up timers
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    };
  }, []);

  const submenuPosition: React.CSSProperties = openLeft
    ? { position: 'absolute', top: 0, right: '100%', marginRight: 4 }
    : { position: 'absolute', top: 0, left: '100%', marginLeft: 4 };

  return (
    <ContextMenuWrapper x={x} y={y} onClose={onClose} minWidth={190}>
      <ContextMenuItem label="Edit Clip" onClick={onEdit} />
      {isMidiClip ? (
        <>
          <ContextMenuItem label="Open Piano Roll" onClick={onOpenMidi} color="#ddd6fe" />
          <ContextMenuItem label="Export MIDI Clip..." onClick={onExportMidi} color="#a5f3fc" />
        </>
      ) : isReady ? (
        <ContextMenuItem label="Regenerate" onClick={onRegenerate} disabled={!hasPrompt} />
      ) : (
        <ContextMenuItem label="Generate" onClick={onGenerate} disabled={!hasPrompt} />
      )}

      {!isMidiClip && isReady && (
        <>
          <ContextMenuItem label="Create Cover..." onClick={onCreateCover} color="#fcd34d" />
          <ContextMenuItem label="Repaint Selection..." onClick={onRepaint} color="#fda4af" />
          {hasAudio && (
            <ContextMenuItem label="Separate Stems..." onClick={onSeparateStems} color="#7dd3fc" />
          )}
          {isVocalTrack && (
            <ContextMenuItem label="Generate Accompaniment..." onClick={onVocal2BGM} color="#6ee7b7" />
          )}
          <ContextMenuItem label="Analyze Audio..." onClick={onAnalyze} color="#67e8f9" />
        </>
      )}

      {!isMidiClip && hasAudio && (
        <>
          <ContextMenuItem label="Convert to MIDI..." onClick={onConvertToMidi} color="#c4b5fd" />
          <ContextMenuItem label="Create Quick Sampler" onClick={onCreateQuickSampler} color="#fdba74" />
          <ContextMenuItem label="Quantize Audio" onClick={onQuantizeAudio} color="#5eead4" />
          {hasWarpMarkers && (
            <ContextMenuItem label="Clear Audio Quantize" onClick={onClearAudioQuantize} color="#a1a1aa" />
          )}
        </>
      )}

      <ContextMenuSeparator />
      <ContextMenuItem label="Split at Playhead" onClick={onSplitAtPlayhead} shortcut="S" />
      <ContextMenuItem label="Duplicate" onClick={onDuplicate} />
      <div
        ref={triggerRef}
        className="relative"
        data-testid="color-submenu-trigger"
        onMouseEnter={openSubmenu}
        onMouseLeave={closeSubmenu}
        onKeyDown={handleTriggerKeyDown}
      >
        <ContextMenuItem
          label="Assign Color"
          onClick={() => setShowColorMenu((open) => !open)}
        />
        <svg
          data-testid="submenu-chevron"
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
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
        {showColorMenu && (
          <div
            data-testid="color-submenu-panel"
            style={submenuPosition}
            onMouseEnter={handleMouseEnterSubmenu}
            onMouseLeave={closeSubmenu}
          >
            <ContextMenuSubmenu>
              <div
                ref={submenuRef}
                role="menu"
                onKeyDown={handleSubmenuKeyDown}
              >
                {TRACK_COLOR_PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    role="menuitem"
                    aria-label={`Assign clip color ${color}`}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-zinc-200 transition-colors hover:bg-[rgba(74,144,217,0.25)]"
                    onClick={() => onAssignColor(color)}
                  >
                    <span
                      className="h-3 w-3 rounded-full border border-white/20"
                      style={{ backgroundColor: color }}
                    />
                    <span>{color.toUpperCase()}</span>
                  </button>
                ))}
              </div>
            </ContextMenuSubmenu>
          </div>
        )}
      </div>
      <ContextMenuItem label="Reset to Track Color" onClick={onResetColor} disabled={!hasCustomColor} />
      <ContextMenuItem label="Consolidate" onClick={onConsolidate} disabled={!canConsolidate} />
      {!isMidiClip && (
        <ContextMenuItem label="Add Layer here..." onClick={onAddLayer} />
      )}
      <ContextMenuItem label={isMuted ? 'Activate Clip' : 'Deactivate Clip'} onClick={onToggleMute} shortcut="0" />
      <ContextMenuSeparator />
      <ContextMenuItem label="Delete" onClick={onDelete} danger />
    </ContextMenuWrapper>
  );
}
