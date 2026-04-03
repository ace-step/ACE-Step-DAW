import { useCallback, useRef } from 'react';
import { levelToFill, fillToLevel, METER_PADDING_PCT } from '../meter-colors';

interface VerticalFaderProps {
  value: number;
  min?: number;
  max?: number;
  defaultValue?: number;
  onChange: (value: number) => void;
  accentColor?: string;
  'aria-label'?: string;
  width?: number;
}

/**
 * Transparent vertical fader overlay — sits on top of LevelMeter.
 * Arrow on the LEFT side pointing RIGHT (tip at the meter bar).
 * Focus shows corner brackets like Ableton.
 */
export function VerticalFader({
  value,
  min = 0,
  max = 1,
  defaultValue,
  onChange,
  accentColor = '#666',
  'aria-label': ariaLabel,
  width = 14,
}: VerticalFaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const getValueFromY = useCallback(
    (clientY: number) => {
      const el = containerRef.current;
      if (!el) return value;
      const rect = el.getBoundingClientRect();
      const pad = METER_PADDING_PCT / 100;
      // Map mouse position to the padded active area
      const rawRatio = 1 - (clientY - rect.top) / rect.height;
      const fill = Math.max(0, Math.min(1, (rawRatio - pad) / (1 - 2 * pad)));
      const linear = fillToLevel(fill);
      return Math.max(min, Math.min(max, linear));
    },
    [value, min, max],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      onChange(getValueFromY(e.clientY));
    },
    [getValueFromY, onChange],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      onChange(getValueFromY(e.clientY));
    },
    [getValueFromY, onChange],
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const onDoubleClick = useCallback(() => {
    if (defaultValue !== undefined) onChange(defaultValue);
  }, [defaultValue, onChange]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const range = max - min;
      const smallStep = range * 0.01;
      const largeStep = range * 0.1;
      let next: number | null = null;
      switch (e.key) {
        case 'ArrowUp':
        case 'ArrowRight':
          next = Math.min(max, value + smallStep);
          break;
        case 'ArrowDown':
        case 'ArrowLeft':
          next = Math.max(min, value - smallStep);
          break;
        case 'PageUp':
          next = Math.min(max, value + largeStep);
          break;
        case 'PageDown':
          next = Math.max(min, value - largeStep);
          break;
        case 'Home':
          next = max;
          break;
        case 'End':
          next = min;
          break;
      }
      if (next !== null) {
        e.preventDefault();
        e.stopPropagation();
        onChange(next);
      }
    },
    [value, min, max, onChange],
  );

  // Arrow position with padding (matches LevelMeter's fillToTopPct)
  const fill = levelToFill(value);
  const pad = METER_PADDING_PCT;
  const bottomPct = pad + fill * (100 - 2 * pad);
  const arrowH = 12;
  const arrowW = 12;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 cursor-ns-resize select-none z-10 outline-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={Math.round(min * 100)}
      aria-valuemax={Math.round(max * 100)}
      aria-valuenow={Math.round(value * 100)}
      aria-orientation="vertical"
      tabIndex={0}
    >
      {/* Fader cap — styled rect with highlight line on top */}
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: `calc(${bottomPct}% - ${arrowH / 2}px)`,
          left: -2,
          width: width + 4,
        }}
      >
        {/* Horizontal line marker across full width */}
        <div
          style={{
            position: 'absolute',
            top: arrowH / 2 - 0.5,
            left: 0,
            right: 0,
            height: 1,
            backgroundColor: accentColor,
            opacity: 0.6,
          }}
        />
        {/* Left-side fader cap: rect with 3D appearance */}
        <svg
          width={arrowW}
          height={arrowH}
          viewBox={`0 0 ${arrowW} ${arrowH}`}
          fill="none"
          style={{ display: 'block' }}
        >
          <rect
            x="0"
            y="1"
            width={arrowW}
            height={arrowH - 2}
            rx="1.5"
            fill="#c8c8cc"
          />
          {/* Highlight line on top for 3D effect */}
          <rect
            x="1"
            y="1"
            width={arrowW - 2}
            height="1.5"
            rx="0.5"
            fill="rgba(255,255,255,0.4)"
          />
          {/* Center groove */}
          <line
            x1="3"
            y1={arrowH / 2}
            x2={arrowW - 3}
            y2={arrowH / 2}
            stroke="rgba(0,0,0,0.3)"
            strokeWidth="0.5"
          />
        </svg>
      </div>
    </div>
  );
}
