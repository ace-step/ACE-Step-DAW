import type { SequencerRow } from '../../types/project';
import { ROW_COLORS } from './SequencerConstants';
import { ContextMenuWrapper, ContextMenuItem, ContextMenuSeparator } from '../ui/ContextMenu';

export interface RowContextMenuState {
  rowId: string;
  x: number;
  y: number;
}

interface SequencerContextMenuProps {
  menu: RowContextMenuState | null;
  rows: SequencerRow[];
  onClose: () => void;
  onRename: (rowId: string) => void;
  onSetColor: (rowId: string, color: string) => void;
  onClone: (rowId: string) => void;
  onFill: (rowId: string, every: number) => void;
  onClear: (rowId: string) => void;
  onPreview: (rowId: string) => void;
  onDelete: (rowId: string) => void;
}

export function SequencerContextMenu({
  menu,
  rows,
  onClose,
  onRename,
  onSetColor,
  onClone,
  onFill,
  onClear,
  onPreview,
  onDelete,
}: SequencerContextMenuProps) {
  if (!menu) return null;

  const row = rows.find((candidate) => candidate.id === menu.rowId);

  return (
    <ContextMenuWrapper x={menu.x} y={menu.y} onClose={onClose}>
      <ContextMenuItem label="Rename / Color..." onClick={() => onRename(menu.rowId)} />
      <ContextMenuSeparator />
      <div style={{ padding: '4px 8px', display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {ROW_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Set row color ${color}`}
            style={{
              width: 14,
              height: 14,
              borderRadius: 3,
              background: color,
              cursor: 'pointer',
              border: row?.color === color
                ? '2px solid #fff'
                : '1px solid rgba(255,255,255,0.1)',
            }}
            onClick={() => onSetColor(menu.rowId, color)}
          />
        ))}
      </div>
      <ContextMenuSeparator />
      <ContextMenuItem label="Clone Channel" onClick={() => onClone(menu.rowId)} />
      <ContextMenuSeparator />
      <ContextMenuItem label="Fill every 2 steps" onClick={() => onFill(menu.rowId, 2)} />
      <ContextMenuItem label="Fill every 4 steps" onClick={() => onFill(menu.rowId, 4)} />
      <ContextMenuItem label="Fill every 8 steps" onClick={() => onFill(menu.rowId, 8)} />
      <ContextMenuSeparator />
      <ContextMenuItem label="Clear Steps" onClick={() => onClear(menu.rowId)} />
      <ContextMenuItem label="Preview Sound" onClick={() => onPreview(menu.rowId)} />
      <ContextMenuSeparator />
      <ContextMenuItem label="Delete Channel" danger onClick={() => onDelete(menu.rowId)} />
    </ContextMenuWrapper>
  );
}
