import { TRACK_COLOR_PALETTE } from '../../constants/colorPalette';
import { ContextMenuWrapper, ContextMenuItem, ContextMenuSeparator } from '../ui/ContextMenu';
import { AIToolsSubmenu, type ClipAIContext } from './AIToolsSubmenu';

interface ClipContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;

  /* Enhance (top-level) */
  onEnhance?: () => void;

  /* AI Tools */
  onInspireMe: () => void;
  onAddLayer: () => void;
  onMusicEnhancer: () => void;
  clipAIContext?: ClipAIContext;

  /* MIDI-specific */
  onOpenMidi?: () => void;
  onExportMidi?: () => void;
  onConvertToStrudel?: () => void;

  /* Editing */
  onEdit: () => void;
  onDuplicate: () => void;
  onSplitAtPlayhead: () => void;
  onConsolidate: () => void;
  onDelete: () => void;
  onSelectAll: () => void;
  onLoopSelection: () => void;

  /* Clip state */
  onToggleMute: () => void;
  isMuted: boolean;

  /* Color */
  onAssignColor: (color: string) => void;
  onResetColor: () => void;
  hasCustomColor: boolean;
  canConsolidate: boolean;
  isMidiClip: boolean;
}

export function ClipContextMenu({
  x,
  y,
  onClose,
  onEnhance,
  onInspireMe,
  onAddLayer,
  onMusicEnhancer,
  clipAIContext,
  onOpenMidi,
  onExportMidi,
  onConvertToStrudel,
  onEdit,
  onDuplicate,
  onSplitAtPlayhead,
  onConsolidate,
  onDelete,
  onSelectAll,
  onLoopSelection,
  onToggleMute,
  isMuted,
  onAssignColor,
  onResetColor,
  hasCustomColor,
  canConsolidate,
  isMidiClip,
}: ClipContextMenuProps) {
  const openLeft = x + 190 + 140 + 20 > window.innerWidth;

  return (
    <ContextMenuWrapper x={x} y={y} onClose={onClose} minWidth={190}>
      {/* Top-level Enhance entry */}
      {onEnhance && (
        <ContextMenuItem label="Enhance..." onClick={onEnhance} color="#6ee7b7" shortcut="⇧E" />
      )}

      {/* AI Tools submenu */}
      <AIToolsSubmenu
        onInspireMe={onInspireMe}
        onAddLayer={onAddLayer}
        onMusicEnhancer={onMusicEnhancer}
        clipContext={clipAIContext}
        openLeft={openLeft}
      />

      {/* MIDI-specific items */}
      {isMidiClip && onOpenMidi && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem label="Open Piano Roll" onClick={onOpenMidi} color="#ddd6fe" />
          {onConvertToStrudel && (
            <ContextMenuItem label="Convert to Strudel..." onClick={onConvertToStrudel} color="#fcd34d" />
          )}
          {onExportMidi && (
            <ContextMenuItem label="Export MIDI Clip..." onClick={onExportMidi} color="#a5f3fc" />
          )}
        </>
      )}

      {/* Clipboard & editing */}
      <ContextMenuSeparator />
      <ContextMenuItem label="Duplicate" onClick={onDuplicate} shortcut="⌘D" />

      {/* Split & consolidate */}
      <ContextMenuSeparator />
      <ContextMenuItem label="Split" onClick={onSplitAtPlayhead} shortcut="⌘E" />
      <ContextMenuItem label="Consolidate" onClick={onConsolidate} shortcut="⌘J" disabled={!canConsolidate} />

      {/* Edit */}
      <ContextMenuSeparator />
      <ContextMenuItem label="Edit Clip" onClick={onEdit} />

      {/* Delete */}
      <ContextMenuSeparator />
      <ContextMenuItem label="Delete" onClick={onDelete} danger shortcut="⌫" />

      {/* Selection & activation */}
      <ContextMenuSeparator />
      <ContextMenuItem label="Select All" onClick={onSelectAll} shortcut="⌘A" />
      <ContextMenuItem label={isMuted ? 'Activate' : 'Deactivate'} onClick={onToggleMute} shortcut="0" />

      {/* Loop & grid */}
      <ContextMenuSeparator />
      <ContextMenuItem label="Loop Selection" onClick={onLoopSelection} shortcut="⌘L" />
      <ContextMenuItem label="Grid and snap" onClick={() => onClose()} disabled />

      {/* Inline color swatches */}
      <ContextMenuSeparator />
      <div className="px-2 py-1.5 flex flex-wrap gap-1" data-testid="color-swatch-palette">
        {hasCustomColor && (
          <button
            type="button"
            aria-label="Reset to track color"
            className="w-5 h-5 rounded-full border border-white/20 flex items-center justify-center cursor-pointer hover:border-white/50 transition-colors"
            style={{ backgroundColor: '#555' }}
            onClick={() => onResetColor()}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 2L8 8M8 2L2 8" stroke="#aaa" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
        {TRACK_COLOR_PALETTE.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Assign clip color ${color}`}
            className="w-5 h-5 rounded-full border border-white/20 cursor-pointer hover:border-white/50 hover:scale-110 transition-all"
            style={{ backgroundColor: color }}
            onClick={() => onAssignColor(color)}
          />
        ))}
      </div>
    </ContextMenuWrapper>
  );
}
