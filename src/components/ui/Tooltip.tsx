import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useId,
  type ReactNode,
  type ReactElement,
  cloneElement,
  isValidElement,
} from 'react';
import { createPortal } from 'react-dom';
import { Z } from '../../utils/zIndex';

export interface TooltipProps {
  /** The content shown inside the tooltip */
  content: ReactNode;
  /** Optional keyboard shortcut badge (e.g. "Cmd+S") */
  shortcut?: string;
  /** Preferred placement — auto-flips if near viewport edge */
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /** Delay before showing (ms) — default 500 */
  delay?: number;
  /** Disable the tooltip */
  disabled?: boolean;
  /** The trigger element (single child) */
  children: ReactElement;
}

const ARROW_SIZE = 5;
const OFFSET = 8;
const MAX_WIDTH = 200;

interface Position {
  top: number;
  left: number;
  arrowTop: number;
  arrowLeft: number;
  arrowRotation: string;
  actualPlacement: 'top' | 'bottom' | 'left' | 'right';
}

function computePosition(
  triggerRect: DOMRect,
  tooltipRect: { width: number; height: number },
  preferred: 'top' | 'bottom' | 'left' | 'right',
): Position {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = 8;

  const tryPlacement = (
    p: 'top' | 'bottom' | 'left' | 'right',
  ): { top: number; left: number } | null => {
    let top: number, left: number;
    switch (p) {
      case 'top':
        top = triggerRect.top - tooltipRect.height - OFFSET;
        left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
        if (top < pad) return null;
        break;
      case 'bottom':
        top = triggerRect.bottom + OFFSET;
        left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
        if (top + tooltipRect.height > vh - pad) return null;
        break;
      case 'left':
        top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
        left = triggerRect.left - tooltipRect.width - OFFSET;
        if (left < pad) return null;
        break;
      case 'right':
        top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
        left = triggerRect.right + OFFSET;
        if (left + tooltipRect.width > vw - pad) return null;
        break;
    }
    // Clamp horizontally
    left = Math.max(pad, Math.min(left, vw - tooltipRect.width - pad));
    // Clamp vertically
    top = Math.max(pad, Math.min(top, vh - tooltipRect.height - pad));
    return { top, left };
  };

  const order: ('top' | 'bottom' | 'left' | 'right')[] = [preferred];
  if (preferred === 'top') order.push('bottom', 'left', 'right');
  else if (preferred === 'bottom') order.push('top', 'left', 'right');
  else if (preferred === 'left') order.push('right', 'top', 'bottom');
  else order.push('left', 'top', 'bottom');

  let chosen: { top: number; left: number } | null = null;
  let actualPlacement = preferred;
  for (const p of order) {
    chosen = tryPlacement(p);
    if (chosen) {
      actualPlacement = p;
      break;
    }
  }
  if (!chosen) {
    // All placements overflow — force-clamp at preferred position
    const top = Math.max(pad, Math.min(
      preferred === 'bottom' ? triggerRect.bottom + OFFSET : triggerRect.top - tooltipRect.height - OFFSET,
      vh - tooltipRect.height - pad,
    ));
    const left = Math.max(pad, Math.min(
      triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2,
      vw - tooltipRect.width - pad,
    ));
    chosen = { top, left };
    actualPlacement = preferred;
  }

  // Arrow position
  let arrowTop = 0;
  let arrowLeft = 0;
  let arrowRotation = '';
  const cx = triggerRect.left + triggerRect.width / 2;
  const cy = triggerRect.top + triggerRect.height / 2;

  switch (actualPlacement) {
    case 'top':
      arrowTop = chosen.top + tooltipRect.height;
      arrowLeft = Math.max(chosen.left + 8, Math.min(cx, chosen.left + tooltipRect.width - 8));
      arrowRotation = 'rotate(180deg)';
      break;
    case 'bottom':
      arrowTop = chosen.top - ARROW_SIZE;
      arrowLeft = Math.max(chosen.left + 8, Math.min(cx, chosen.left + tooltipRect.width - 8));
      arrowRotation = 'rotate(0deg)';
      break;
    case 'left':
      arrowTop = Math.max(chosen.top + 8, Math.min(cy, chosen.top + tooltipRect.height - 8));
      arrowLeft = chosen.left + tooltipRect.width;
      arrowRotation = 'rotate(-90deg)';
      break;
    case 'right':
      arrowTop = Math.max(chosen.top + 8, Math.min(cy, chosen.top + tooltipRect.height - 8));
      arrowLeft = chosen.left - ARROW_SIZE;
      arrowRotation = 'rotate(90deg)';
      break;
  }

  return {
    top: chosen.top,
    left: chosen.left,
    arrowTop,
    arrowLeft,
    arrowRotation,
    actualPlacement,
  };
}

export function Tooltip({
  content,
  shortcut,
  placement = 'top',
  delay = 500,
  disabled = false,
  children,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [entered, setEntered] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number>(0);
  const tooltipId = useId();

  const show = useCallback(() => {
    if (disabled) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setVisible(true);
    }, delay);
  }, [delay, disabled]);

  const hide = useCallback(() => {
    window.clearTimeout(timerRef.current);
    setEntered(false);
    setVisible(false);
    setPosition(null);
  }, []);

  // Position on mount/visible
  useEffect(() => {
    if (!visible) return;
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;

    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const pos = computePosition(triggerRect, tooltipRect, placement);
    setPosition(pos);

    // Trigger enter animation on next frame
    requestAnimationFrame(() => setEntered(true));
  }, [visible, placement]);

  // Cleanup timer
  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  if (!isValidElement(children)) return children;

  const trigger = cloneElement(children as ReactElement<Record<string, unknown>>, {
    'aria-describedby': visible ? tooltipId : undefined,
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      // Forward ref if child has one
      const childRef = (children as { ref?: unknown }).ref;
      if (typeof childRef === 'function') childRef(node);
      else if (childRef && typeof childRef === 'object' && 'current' in childRef) {
        (childRef as React.MutableRefObject<HTMLElement | null>).current = node;
      }
    },
    onMouseEnter: (e: React.MouseEvent) => {
      show();
      const orig = (children.props as Record<string, unknown>).onMouseEnter;
      if (typeof orig === 'function') orig(e);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      hide();
      const orig = (children.props as Record<string, unknown>).onMouseLeave;
      if (typeof orig === 'function') orig(e);
    },
    onFocus: (e: React.FocusEvent) => {
      show();
      const orig = (children.props as Record<string, unknown>).onFocus;
      if (typeof orig === 'function') orig(e);
    },
    onBlur: (e: React.FocusEvent) => {
      hide();
      const orig = (children.props as Record<string, unknown>).onBlur;
      if (typeof orig === 'function') orig(e);
    },
  });

  return (
    <>
      {trigger}
      {visible &&
        createPortal(
          <>
            <div
              ref={tooltipRef}
              id={tooltipId}
              role="tooltip"
              className="pointer-events-none"
              style={{
                position: 'fixed',
                zIndex: Z.contextualTip,
                top: position?.top ?? -9999,
                left: position?.left ?? -9999,
                maxWidth: MAX_WIDTH,
                opacity: entered ? 1 : 0,
                transform: entered
                  ? 'translateY(0)'
                  : position?.actualPlacement === 'bottom'
                    ? 'translateY(-4px)'
                    : 'translateY(4px)',
                transition: `opacity 150ms var(--ease-out), transform 150ms var(--ease-out)`,
              }}
            >
              <div className="rounded-md bg-zinc-900/95 border border-white/10 px-2.5 py-1.5 shadow-lg backdrop-blur-sm">
                <span className="text-[11px] leading-tight text-zinc-100">
                  {content}
                </span>
                {shortcut && (
                  <kbd className="ml-2 inline-block rounded border border-white/15 bg-white/8 px-1 py-0.5 text-[10px] font-mono text-zinc-400 leading-none">
                    {shortcut}
                  </kbd>
                )}
              </div>
            </div>
            {/* Arrow */}
            {position && (
              <div
                className="pointer-events-none"
                style={{
                  position: 'fixed',
                  zIndex: Z.contextualTip,
                  top: position.arrowTop,
                  left: position.arrowLeft,
                  width: 0,
                  height: 0,
                  borderLeft: `${ARROW_SIZE}px solid transparent`,
                  borderRight: `${ARROW_SIZE}px solid transparent`,
                  borderTop: `${ARROW_SIZE}px solid rgba(24, 24, 27, 0.95)`,
                  transform: `translate(-${ARROW_SIZE}px, 0) ${position.arrowRotation}`,
                  opacity: entered ? 1 : 0,
                  transition: 'opacity 150ms',
                }}
              />
            )}
          </>,
          document.body,
        )}
    </>
  );
}
