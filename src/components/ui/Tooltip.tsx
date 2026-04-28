import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useId,
  type ReactNode,
  type ReactElement,
  cloneElement,
  isValidElement,
} from 'react';
import { createPortal } from 'react-dom';
import { Z } from '../../utils/zIndex';

export interface TooltipProps {
  /** Text content to display */
  content: ReactNode;
  /** Optional keyboard shortcut to show (e.g. "Cmd+S") */
  shortcut?: string;
  /** Preferred position (auto-flips if near edge) */
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Delay before showing in ms (default 500) */
  delayMs?: number;
  /** Disable the tooltip */
  disabled?: boolean;
  /** Trigger element (single child) */
  children: ReactElement;
}

const ARROW_SIZE = 5;
const TOOLTIP_OFFSET = 8;
const VIEWPORT_PADDING = 8;
const MAX_WIDTH = 200;

interface Position {
  top: number;
  left: number;
  arrowTop: number;
  arrowLeft: number;
  arrowRotation: string;
  actualSide: 'top' | 'bottom' | 'left' | 'right';
}

function fitsInViewport(
  side: 'top' | 'bottom' | 'left' | 'right',
  triggerRect: DOMRect,
  tooltipRect: { width: number; height: number },
): boolean {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  switch (side) {
    case 'top':
      return triggerRect.top - tooltipRect.height - TOOLTIP_OFFSET >= VIEWPORT_PADDING;
    case 'bottom':
      return triggerRect.bottom + tooltipRect.height + TOOLTIP_OFFSET <= vh - VIEWPORT_PADDING;
    case 'left':
      return triggerRect.left - tooltipRect.width - TOOLTIP_OFFSET >= VIEWPORT_PADDING;
    case 'right':
      return triggerRect.right + tooltipRect.width + TOOLTIP_OFFSET <= vw - VIEWPORT_PADDING;
  }
}

function computePosition(
  triggerRect: DOMRect,
  tooltipRect: { width: number; height: number },
  preferredSide: 'top' | 'bottom' | 'left' | 'right',
): Position {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const fallbacks: Record<string, Array<'top' | 'bottom' | 'left' | 'right'>> = {
    top: ['bottom', 'left', 'right'],
    bottom: ['top', 'left', 'right'],
    left: ['right', 'top', 'bottom'],
    right: ['left', 'top', 'bottom'],
  };

  // Pick first side that fits, starting with preferred
  let side = preferredSide;
  if (!fitsInViewport(side, triggerRect, tooltipRect)) {
    for (const fb of fallbacks[preferredSide]) {
      if (fitsInViewport(fb, triggerRect, tooltipRect)) {
        side = fb;
        break;
      }
    }
  }

  let top = 0;
  let left = 0;
  let arrowTop = 0;
  let arrowLeft = 0;
  let arrowRotation = '';

  if (side === 'top') {
    top = triggerRect.top - tooltipRect.height - TOOLTIP_OFFSET;
    left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
    arrowTop = tooltipRect.height - 1;
    arrowLeft = tooltipRect.width / 2 - ARROW_SIZE;
    arrowRotation = 'rotate(180deg)';
  } else if (side === 'bottom') {
    top = triggerRect.bottom + TOOLTIP_OFFSET;
    left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
    arrowTop = -ARROW_SIZE * 2 + 1;
    arrowLeft = tooltipRect.width / 2 - ARROW_SIZE;
    arrowRotation = 'rotate(0deg)';
  } else if (side === 'left') {
    top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
    left = triggerRect.left - tooltipRect.width - TOOLTIP_OFFSET;
    arrowTop = tooltipRect.height / 2 - ARROW_SIZE;
    arrowLeft = tooltipRect.width - 1;
    arrowRotation = 'rotate(270deg)';
  } else {
    top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
    left = triggerRect.right + TOOLTIP_OFFSET;
    arrowTop = tooltipRect.height / 2 - ARROW_SIZE;
    arrowLeft = -ARROW_SIZE * 2 + 1;
    arrowRotation = 'rotate(90deg)';
  }

  // Clamp to viewport (after side selection)
  left = Math.max(VIEWPORT_PADDING, Math.min(left, vw - tooltipRect.width - VIEWPORT_PADDING));
  top = Math.max(VIEWPORT_PADDING, Math.min(top, vh - tooltipRect.height - VIEWPORT_PADDING));

  return { top, left, arrowTop, arrowLeft, arrowRotation, actualSide: side };
}

export function Tooltip({
  content,
  shortcut,
  side = 'top',
  delayMs = 500,
  disabled = false,
  children,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const timerRef = useRef<number>(0);
  const triggerRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();

  const show = useCallback(() => {
    if (disabled) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setVisible(true);
    }, delayMs);
  }, [delayMs, disabled]);

  const hide = useCallback(() => {
    window.clearTimeout(timerRef.current);
    setVisible(false);
    setPosition(null);
  }, []);

  // Position the tooltip when it becomes visible
  useEffect(() => {
    if (!visible || !triggerRef.current) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      const tooltip = tooltipRef.current;
      if (!trigger || !tooltip) return;

      const triggerRect = trigger.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      setPosition(computePosition(triggerRect, tooltipRect, side));
    };

    // Allow one frame for the tooltip to render and measure
    requestAnimationFrame(updatePosition);
  }, [visible, side]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => window.clearTimeout(timerRef.current);
  }, []);

  if (!isValidElement(children)) return children;

  const trigger = cloneElement(children as ReactElement<Record<string, unknown>>, {
    'aria-describedby': visible ? tooltipId : undefined,
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      // Forward ref if original child had one
      const originalRef = (children as { ref?: unknown }).ref;
      if (typeof originalRef === 'function') originalRef(node);
      else if (originalRef && typeof originalRef === 'object' && 'current' in originalRef) {
        (originalRef as { current: HTMLElement | null }).current = node;
      }
    },
    onMouseEnter: (e: React.MouseEvent) => {
      show();
      const original = (children.props as Record<string, unknown>).onMouseEnter;
      if (typeof original === 'function') (original as (e: React.MouseEvent) => void)(e);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      hide();
      const original = (children.props as Record<string, unknown>).onMouseLeave;
      if (typeof original === 'function') (original as (e: React.MouseEvent) => void)(e);
    },
    onFocus: (e: React.FocusEvent) => {
      show();
      const original = (children.props as Record<string, unknown>).onFocus;
      if (typeof original === 'function') (original as (e: React.FocusEvent) => void)(e);
    },
    onBlur: (e: React.FocusEvent) => {
      hide();
      const original = (children.props as Record<string, unknown>).onBlur;
      if (typeof original === 'function') (original as (e: React.FocusEvent) => void)(e);
    },
  });

  const tooltipEl = visible
    ? createPortal(
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none fixed"
          style={{
            zIndex: Z.contextualTip,
            top: position?.top ?? -9999,
            left: position?.left ?? -9999,
            maxWidth: MAX_WIDTH,
            opacity: position ? 1 : 0,
            transform: position ? 'translateY(0)' : 'translateY(4px)',
            transition: 'opacity 150ms ease-out, transform 150ms ease-out',
          }}
        >
          <div className="rounded-md bg-zinc-900/95 border border-white/10 px-2.5 py-1.5 text-[11px] leading-snug text-zinc-100 shadow-lg backdrop-blur-sm">
            <span>{content}</span>
            {shortcut && (
              <kbd className="ml-2 inline-block rounded border border-white/15 bg-white/8 px-1 py-0.5 font-mono text-[10px] text-zinc-400 leading-none">
                {shortcut}
              </kbd>
            )}
          </div>
          {/* Arrow */}
          {position && (
            <div
              className="absolute"
              style={{
                top: position.arrowTop,
                left: position.arrowLeft,
                transform: position.arrowRotation,
              }}
            >
              <svg width={ARROW_SIZE * 2} height={ARROW_SIZE * 2} viewBox="0 0 10 10">
                <polygon points="5,10 0,0 10,0" fill="rgba(24, 24, 27, 0.95)" />
              </svg>
            </div>
          )}
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      {trigger}
      {tooltipEl}
    </>
  );
}
