import { useState } from 'react';
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
  onClose: () => void;
  hasPrompt: boolean;
  isReady: boolean;
  isMidiClip: boolean;
  isVocalTrack: boolean;
  hasAudio: boolean;
  hasWarpMarkers: boolean;
  canConsolidate: boolean;
  hasCustomColor: boolean;
}

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
  onClose,
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
      <div className="relative">
        <ContextMenuItem
          label="Assign Color"
          shortcut={showColorMenu ? '◀' : '▶'}
          onClick={() => setShowColorMenu((open) => !open)}
        />
        {showColorMenu && (
          <div className="absolute top-0 left-full ml-1">
            <ContextMenuSubmenu>
              {TRACK_COLOR_PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
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
            </ContextMenuSubmenu>
          </div>
        )}
      </div>
      <ContextMenuItem label="Reset to Track Color" onClick={onResetColor} disabled={!hasCustomColor} />
      <ContextMenuItem label="Consolidate" onClick={onConsolidate} disabled={!canConsolidate} />
      {!isMidiClip && (
        <ContextMenuItem label="Add Layer here..." onClick={onAddLayer} />
      )}
      <ContextMenuSeparator />
      <ContextMenuItem label="Delete" onClick={onDelete} danger />
    </ContextMenuWrapper>
  );
}
