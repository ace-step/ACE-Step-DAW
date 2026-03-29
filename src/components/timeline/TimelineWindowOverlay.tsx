import type React from 'react';

const WINDOW_CONTROL_BAR_HEIGHT = 24;

export interface TimelineWindowOverlayProps {
  kind: 'select' | 'context';
  left: number;
  width: number;
  top: number;
  height: number;
  label: string;
  switchLabel: string;
  switchAriaLabel: string;
  accentTextColor: string;
  fillColor: string;
  borderColor: string;
  edgeColor: string;
  align: 'left' | 'right';
  onMoveStart: (e: React.MouseEvent<HTMLDivElement>) => void;
  onSwitch: () => void;
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export function TimelineWindowOverlay({
  kind,
  left,
  width,
  top,
  height,
  label,
  switchLabel,
  switchAriaLabel,
  accentTextColor,
  fillColor,
  borderColor,
  edgeColor,
  align,
  onMoveStart,
  onSwitch,
  onContextMenu,
}: TimelineWindowOverlayProps) {
  const justifyClass = align === 'left' ? 'justify-start' : 'justify-end';

  return (
    <div
      className="absolute pointer-events-none z-10"
      style={{
        left,
        width,
        top,
        height,
        background: fillColor,
        borderLeft: `2px solid ${edgeColor}`,
        borderRight: `2px solid ${edgeColor}`,
        borderTop: `2px solid ${borderColor}`,
        borderBottom: `2px solid ${borderColor}`,
      }}
    >
      <div
        className={`absolute left-1 right-1 top-1 flex ${justifyClass}`}
      >
        <div
          className="pointer-events-auto inline-flex max-w-full items-center gap-2 rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.22em] shadow-[0_6px_20px_rgba(0,0,0,0.22)] backdrop-blur-sm cursor-grab active:cursor-grabbing"
          data-window-overlay-control="true"
          data-window-overlay-type={kind}
          aria-label={`${label} controls`}
          onMouseDown={onMoveStart}
          onContextMenu={(e) => {
            if (!onContextMenu) return;
            e.preventDefault();
            e.stopPropagation();
            onContextMenu(e);
          }}
          style={{
            minHeight: WINDOW_CONTROL_BAR_HEIGHT,
            color: accentTextColor,
            background: 'rgba(18, 19, 24, 0.82)',
            borderColor,
          }}
        >
          <span className="truncate select-none">{label}</span>
          <button
            type="button"
            className="rounded border px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.18em] transition-colors hover:bg-white/8"
            data-window-overlay-control="true"
            aria-label={switchAriaLabel}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSwitch();
            }}
            style={{
              color: accentTextColor,
              borderColor,
            }}
          >
            {switchLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
