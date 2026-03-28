import { useCallback, useRef, useState } from 'react';
import { levelToFill, fillToLevel } from '../meter-colors';

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
  const [focused, setFocused] = useState(false);

  const getValueFromY = useCallback(
    (clientY: number) => {
      const el = containerRef.current;
      if (!el) return value;
      const rect = el.getBoundingClientRect();
      const fill = 1 - (clientY - rect.top) / rect.height;
      const clampedFill = Math.max(0, Math.min(1, fill));
      const linear = fillToLevel(clampedFill);
      return Math.max(min, Math.min(max, linear));
    },
    [value, min, max],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      setFocused(true);
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

  const pct = levelToFill(value) * 100;
  const arrowH = 8;
  const arrowW = 6;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 cursor-ns-resize select-none z-10 outline-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={() => { if (!dragging.current) setFocused(false); }}
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={Math.round(min * 100)}
      aria-valuemax={Math.round(max * 100)}
      aria-valuenow={Math.round(value * 100)}
      aria-orientation="vertical"
      tabIndex={0}
    >
      {/* Arrow on LEFT side — right-pointing triangle, tip at meter bar */}
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: `calc(${pct}% - ${arrowH / 2}px)`,
          left: 8 - arrowW,
        }}
      >
        <svg
          width={arrowW}
          height={arrowH}
          viewBox={`0 0 ${arrowW} ${arrowH}`}
          fill="none"
        >
          <polygon
            points={`0,0 ${arrowW},${arrowH / 2} 0,${arrowH}`}
            fill="#c8c8cc"
          />
        </svg>
      </div>

      {/* Focus corner brackets (Ableton-style) */}
      {focused && (
        <>
          {/* Top-left */}
          <span className="absolute top-0 left-0 w-[4px] h-[4px] border-t border-l border-zinc-400 pointer-events-none" />
          {/* Top-right */}
          <span className="absolute top-0 right-0 w-[4px] h-[4px] border-t border-r border-zinc-400 pointer-events-none" />
          {/* Bottom-left */}
          <span className="absolute bottom-0 left-0 w-[4px] h-[4px] border-b border-l border-zinc-400 pointer-events-none" />
          {/* Bottom-right */}
          <span className="absolute bottom-0 right-0 w-[4px] h-[4px] border-b border-r border-zinc-400 pointer-events-none" />
        </>
      )}
    </div>
  );
}
