import { ContextMenuWrapper, ContextMenuItem, ContextMenuSeparator } from '../ui/ContextMenu';
import { ColorSwatchPalette } from '../ui/ColorSwatchPalette';
import { AIToolsSubmenu, type ClipAIContext } from './AIToolsSubmenu';
import { WarpStretchSubmenu } from './WarpStretchSubmenu';
import type { Clip } from '../../types/project';

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
  onExtractGroove?: () => void;

  /* Editing */
  onEdit: () => void;
  onDuplicate: () => void;
  onSplitAtPlayhead: () => void;
  onConsolidate: () => void;
  onDelete: () => void;
  onSelectAll: () => void;
  onLoopSelection: () => void;

  /* Audio processing */
  onReverse?: () => void;
  onNormalize?: () => void;
  onGainUp?: () => void;
  onGainDown?: () => void;
  onHalfSpeed?: () => void;
  onDoubleSpeed?: () => void;
  onResetSpeed?: () => void;

  /* Clip state */
  onToggleMute: () => void;
  isMuted: boolean;

  /* Color */
  onAssignColor: (color: string) => void;
  onResetColor: () => void;
  hasCustomColor: boolean;
  canConsolidate: boolean;
  isMidiClip: boolean;

  /* Warp & Stretch (audio clips only) */
  clip?: Clip;
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
  onExtractGroove,
  onEdit,
  onDuplicate,
  onSplitAtPlayhead,
  onConsolidate,
  onDelete,
  onSelectAll,
  onLoopSelection,
  onReverse,
  onNormalize,
  onGainUp,
  onGainDown,
  onHalfSpeed,
  onDoubleSpeed,
  onResetSpeed,
  onToggleMute,
  isMuted,
  onAssignColor,
  onResetColor,
  hasCustomColor,
  canConsolidate,
  isMidiClip,
  clip,
}: ClipContextMenuProps) {
  const openLeft = x + 190 + 140 + 20 > window.innerWidth;

  return (
    <ContextMenuWrapper x={x} y={y} onClose={onClose} minWidth={190}>
      {/* Edit Clip — first item for quick access */}
      <ContextMenuItem label="Edit Clip" onClick={onEdit} />

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
          {onExtractGroove && (
            <ContextMenuItem label="Extract Groove..." onClick={onExtractGroove} color="#6ee7b7" />
          )}
        </>
      )}

      {/* Warp & Stretch (audio clips only) */}
      {clip && !isMidiClip && (
        <>
          <ContextMenuSeparator />
          <WarpStretchSubmenu clip={clip} openLeft={openLeft} onClose={onClose} />
        </>
      )}

      {/* Clipboard & editing */}
      <ContextMenuSeparator />
      <ContextMenuItem label="Duplicate" onClick={onDuplicate} shortcut="⌘D" />

      {/* Split & consolidate */}
      <ContextMenuSeparator />
      <ContextMenuItem label="Split" onClick={onSplitAtPlayhead} shortcut="⌘E" />
      <ContextMenuItem label="Consolidate" onClick={onConsolidate} shortcut="⌘J" disabled={!canConsolidate} />

      {/* Audio processing */}
      {(onReverse || onNormalize || onGainUp || onGainDown || onHalfSpeed || onDoubleSpeed || onResetSpeed) && (
        <>
          <ContextMenuSeparator />
          {onReverse && <ContextMenuItem label="Reverse" onClick={onReverse} />}
          {onNormalize && <ContextMenuItem label="Normalize" onClick={onNormalize} />}
          {onGainUp && <ContextMenuItem label="Gain +3 dB" onClick={onGainUp} />}
          {onGainDown && <ContextMenuItem label="Gain −3 dB" onClick={onGainDown} />}
          {onHalfSpeed && <ContextMenuItem label="Half Speed" onClick={onHalfSpeed} />}
          {onDoubleSpeed && <ContextMenuItem label="Double Speed" onClick={onDoubleSpeed} />}
          {onResetSpeed && <ContextMenuItem label="Reset Speed" onClick={onResetSpeed} />}
        </>
      )}

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
      <ColorSwatchPalette
        hasCustomColor={hasCustomColor}
        onAssignColor={onAssignColor}
        onResetColor={onResetColor}
        labelPrefix="Assign clip color"
      />
    </ContextMenuWrapper>
  );
}
