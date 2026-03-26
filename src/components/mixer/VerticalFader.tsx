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

  const pct = ((value - min) / (max - min)) * 100;
  const capH = 20;
  const capW = width + 6;

  return (
    <div
      ref={containerRef}
      className="relative cursor-ns-resize select-none"
      style={{ width, height: '100%' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={Math.round(min * 100)}
      aria-valuemax={Math.round(max * 100)}
      aria-valuenow={Math.round(value * 100)}
      aria-orientation="vertical"
      tabIndex={0}
    >
      {/* Track groove */}
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-full"
        style={{
          width: 3,
          top: capH / 2,
          bottom: capH / 2,
          background: '#333',
        }}
      />
      {/* Filled portion */}
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-full"
        style={{
          width: 3,
          bottom: capH / 2,
          height: `calc(${pct}% * (1 - ${capH}px / 100%) )`,
          maxHeight: `calc(100% - ${capH}px)`,
          background: accentColor,
          opacity: 0.7,
        }}
      />
      {/* Fader cap */}
      <div
        className="absolute left-1/2 pointer-events-none"
        style={{
          bottom: `calc(${pct}% - ${capH / 2}px)`,
          transform: 'translateX(-50%)',
          // Clamp so cap doesn't overflow
          maxHeight: '100%',
        }}
      >
        <svg
          width={capW}
          height={capH}
          viewBox={`0 0 ${capW} ${capH}`}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="drop-shadow-md"
        >
          <defs>
            <linearGradient id="vfCapGrad" x1="0" y1="0" x2="0" y2={capH} gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#a0a0a8" />
              <stop offset="25%" stopColor="#d8d8dc" />
              <stop offset="50%" stopColor="#ececee" />
              <stop offset="75%" stopColor="#d8d8dc" />
              <stop offset="100%" stopColor="#98989e" />
            </linearGradient>
          </defs>
          <rect x="1" y="0.5" width={capW - 2} height={capH - 1} rx="2.5" fill="url(#vfCapGrad)" stroke="#68686e" strokeWidth="0.5" />
          {/* Horizontal grip lines — indicate vertical drag */}
          <line x1="4" y1={capH / 2 - 3} x2={capW - 4} y2={capH / 2 - 3} stroke="#999" strokeWidth="0.5" strokeLinecap="round" />
          <line x1="3" y1={capH / 2} x2={capW - 3} y2={capH / 2} stroke="#999" strokeWidth="0.5" strokeLinecap="round" />
          <line x1="4" y1={capH / 2 + 3} x2={capW - 4} y2={capH / 2 + 3} stroke="#999" strokeWidth="0.5" strokeLinecap="round" />
          {/* Left notch highlight */}
          <line x1="2" y1={capH / 2} x2="2" y2={capH / 2} stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
        </svg>
      </div>
    </div>
  );
}
