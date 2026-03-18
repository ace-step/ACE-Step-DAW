import type { SequencerRow } from '../../types/project';
import { FL, ROW_COLORS } from './SequencerConstants';

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
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="fixed z-50 py-1"
        style={{
          left: Math.min(menu.x, window.innerWidth - 180),
          top: Math.min(menu.y, window.innerHeight - 260),
          background: FL.headerBg,
          border: `1px solid ${FL.borderLight}`,
          borderRadius: 4,
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          minWidth: 160,
        }}
      >
        <CtxMenuItem label="Rename / Color..." onClick={() => onRename(menu.rowId)} />
        <CtxMenuSep />
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
        <CtxMenuSep />
        <CtxMenuItem label="Clone Channel" onClick={() => onClone(menu.rowId)} />
        <CtxMenuSep />
        <CtxMenuItem label="Fill every 2 steps" onClick={() => onFill(menu.rowId, 2)} />
        <CtxMenuItem label="Fill every 4 steps" onClick={() => onFill(menu.rowId, 4)} />
        <CtxMenuItem label="Fill every 8 steps" onClick={() => onFill(menu.rowId, 8)} />
        <CtxMenuSep />
        <CtxMenuItem label="Clear Steps" onClick={() => onClear(menu.rowId)} />
        <CtxMenuItem label="Preview Sound" onClick={() => onPreview(menu.rowId)} />
        <CtxMenuSep />
        <CtxMenuItem label="Delete Channel" danger onClick={() => onDelete(menu.rowId)} />
      </div>
    </>
  );
}

export function CtxMenuItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '4px 12px',
        fontSize: 11,
        border: 'none',
        cursor: 'pointer',
        background: 'transparent',
        color: danger ? '#e74c3c' : FL.text,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? 'rgba(231,76,60,0.15)' : FL.stepOff;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      {label}
    </button>
  );
}

export function CtxMenuSep() {
  return <div style={{ margin: '2px 8px', height: 1, background: FL.border }} />;
}
