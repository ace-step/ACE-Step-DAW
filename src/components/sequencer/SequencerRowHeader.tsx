import type { RefObject } from 'react';
import type { SequencerRow } from '../../types/project';
import { MiniKnob } from './MiniKnob';
import { FL } from './SequencerConstants';

interface SequencerRowHeaderProps {
  row: SequencerRow;
  rowIdx: number;
  stepH: number;
  isSelected: boolean;
  isSoloed: boolean;
  isAudible: boolean;
  isDragTarget: boolean;
  inlineRenameRowId: string | null;
  inlineRenameValue: string;
  inlineRenameInputRef: RefObject<HTMLInputElement | null>;
  samplePickerRow: string | null;
  onSelectRow: (rowId: string) => void;
  onOpenContextMenu: (rowId: string, x: number, y: number) => void;
  onToggleMute: (rowId: string) => void;
  onToggleSolo: (rowId: string) => void;
  onSetPan: (rowId: string, value: number) => void;
  onSetVolume: (rowId: string, value: number) => void;
  onToggleSamplePicker: (rowId: string) => void;
  onStartInlineRename: (row: SequencerRow) => void;
  onInlineRenameChange: (value: string) => void;
  onCommitInlineRename: () => void;
  onCancelInlineRename: () => void;
  onDragStart: (idx: number, e: React.DragEvent) => void;
  onDragOver: (idx: number, e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDrop: (idx: number) => void;
}

export function SequencerRowHeader({
  row,
  rowIdx,
  stepH,
  isSelected,
  isSoloed,
  isAudible,
  isDragTarget,
  inlineRenameRowId,
  inlineRenameValue,
  inlineRenameInputRef,
  samplePickerRow,
  onSelectRow,
  onOpenContextMenu,
  onToggleMute,
  onToggleSolo,
  onSetPan,
  onSetVolume,
  onToggleSamplePicker,
  onStartInlineRename,
  onInlineRenameChange,
  onCommitInlineRename,
  onCancelInlineRename,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: SequencerRowHeaderProps) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(rowIdx, e)}
      onDragOver={(e) => onDragOver(rowIdx, e)}
      onDragEnd={onDragEnd}
      onDrop={() => onDrop(rowIdx)}
      className="flex items-center"
      style={{
        height: stepH,
        background: isSelected ? '#3a3a3a' : rowIdx % 2 === 0 ? FL.rowBg : FL.rowBgAlt,
        borderBottom: `1px solid ${FL.border}`,
        borderTop: isDragTarget ? `2px solid ${FL.accentBright}` : '2px solid transparent',
        opacity: isAudible ? 1 : 0.35,
        cursor: 'default',
        gap: 2,
        paddingLeft: 2,
        paddingRight: 3,
      }}
      onClick={() => onSelectRow(row.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpenContextMenu(row.id, e.clientX, e.clientY);
      }}
      onDragOverCapture={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
    >
      <div
        className="shrink-0 cursor-grab"
        style={{ width: 4, height: stepH - 4, borderRadius: 2, background: row.color }}
        title="Drag to reorder"
      />

      <div
        className="shrink-0 cursor-pointer"
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: row.muted ? FL.muteLed : isSoloed ? '#f1c40f' : FL.muteActive,
          border: `1px solid ${FL.borderLight}`,
          boxShadow: row.muted
            ? 'none'
            : isSoloed
              ? '0 0 4px #f1c40f80'
              : `0 0 4px ${FL.muteActive}80`,
        }}
        onClick={(e) => {
          e.stopPropagation();
          onToggleMute(row.id);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleSolo(row.id);
        }}
        title={row.muted ? 'Unmute (click) / Solo (right-click)' : isSoloed ? 'Unsolo (right-click)' : 'Mute (click) / Solo (right-click)'}
      />

      <MiniKnob
        value={row.pan ?? 0}
        min={-1}
        max={1}
        size={16}
        color="#3498db"
        onChange={(value) => onSetPan(row.id, value)}
        bipolar
      />

      <MiniKnob
        value={row.volume}
        min={0}
        max={1}
        size={16}
        color={FL.accentBright}
        onChange={(value) => onSetVolume(row.id, value)}
      />

      {inlineRenameRowId === row.id ? (
        <input
          ref={inlineRenameInputRef}
          value={inlineRenameValue}
          onChange={(e) => onInlineRenameChange(e.target.value)}
          onBlur={onCommitInlineRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommitInlineRename();
            if (e.key === 'Escape') onCancelInlineRename();
          }}
          className="flex-1 min-w-0"
          style={{
            background: FL.stepOff,
            border: `1px solid ${FL.accent}`,
            borderRadius: 3,
            color: FL.textBright,
            fontSize: 10,
            padding: '0 4px',
            outline: 'none',
            height: Math.min(stepH - 6, 20),
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <button
          className="flex-1 min-w-0 text-left truncate"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: isSelected ? FL.textBright : FL.text,
            fontSize: 10,
            fontWeight: isSelected ? 600 : 400,
            padding: '0 3px',
            lineHeight: 1.2,
          }}
          title={`${row.name} — click to select, double-click to rename`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSamplePicker(samplePickerRow === row.id ? '' : row.id);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onStartInlineRename(row);
          }}
        >
          {row.name}
        </button>
      )}
    </div>
  );
}
