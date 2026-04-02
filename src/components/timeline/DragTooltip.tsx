import { createPortal } from 'react-dom';
import { Z } from '../../utils/zIndex';

const STORAGE_KEY = 'ace-step-drag-tooltip-count';
const MAX_SHOWS = 3;

/** Read how many times the drag tooltip has been shown. */
export function getDragTooltipCount(): number {
  try {
    return parseInt(localStorage.getItem(STORAGE_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

/** Increment the drag tooltip show count. */
export function incrementDragTooltipCount(): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(getDragTooltipCount() + 1));
  } catch {
    // localStorage unavailable
  }
}

/** Whether the drag tooltip should still be shown. */
export function shouldShowDragTooltip(): boolean {
  return getDragTooltipCount() < MAX_SHOWS;
}

interface DragTooltipProps {
  x: number;
  y: number;
}

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

export function DragTooltip({ x, y }: DragTooltipProps) {
  return createPortal(
    <div
      className="fixed pointer-events-none"
      style={{
        zIndex: Z.contextualTip,
        left: x + 16,
        top: y - 40,
      }}
    >
      <div className="bg-zinc-900/95 border border-zinc-700 rounded px-2.5 py-1.5 text-[10px] text-zinc-300 whitespace-nowrap shadow-lg backdrop-blur-sm">
        <span className="text-zinc-400">Drag:</span> move
        <span className="mx-1.5 text-zinc-600">|</span>
        <span className="text-zinc-400">Shift:</span> copy
        {isMac ? null : (
          <>
            <span className="mx-1.5 text-zinc-600">|</span>
            <span className="text-zinc-400">Alt:</span> slip
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
