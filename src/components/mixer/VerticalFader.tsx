import { useCallback, useRef } from 'react';

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
 * Custom vertical fader with a slim track and metallic cap.
 * Consistent visual language with the horizontal FaderMeter used in track headers.
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
      // Bottom = min, Top = max
      const ratio = 1 - (clientY - rect.top) / rect.height;
      return min + Math.max(0, Math.min(1, ratio)) * (max - min);
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

  const pct = ((value - min) / (max - min)) * 100;
  const arrowH = 8;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 cursor-ns-resize select-none z-10"
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
      {/* Arrow indicator — right-pointing triangle riding on the meter */}
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: `calc(${pct}% - ${arrowH / 2}px)`,
          right: 0,
        }}
      >
        <svg
          width="7"
          height={arrowH}
          viewBox={`0 0 7 ${arrowH}`}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <polygon
            points={`0,0 7,${arrowH / 2} 0,${arrowH}`}
            fill="#d0d0d4"
            stroke="#888"
            strokeWidth="0.5"
          />
        </svg>
      </div>
    </div>
  );
}
