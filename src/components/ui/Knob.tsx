import { useCallback, useRef, useEffect } from 'react';

interface KnobProps {
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  onChange: (value: number) => void;
  label?: string;
  unit?: string;
  size?: number;       // diameter in px, default 32
  /** Degrees of total rotation arc (default 270 — starts at 7 o'clock, ends at 5 o'clock) */
  arc?: number;
  step?: number;
  disabled?: boolean;
}

/** Maps a value in [min,max] to a rotation angle in degrees. */
function valueToAngle(value: number, min: number, max: number, arc: number): number {
  const pct = (value - min) / (max - min);
  return -arc / 2 + pct * arc;
}

export function Knob({
  value,
  min,
  max,
  defaultValue,
  onChange,
  label,
  unit,
  size = 32,
  arc = 270,
  step,
  disabled = false,
}: KnobProps) {
  const dragStart = useRef<{ y: number; value: number } | null>(null);
  const knobRef = useRef<HTMLDivElement>(null);

  const clamp = (v: number) => Math.max(min, Math.min(max, v));

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    dragStart.current = { y: e.clientY, value };

    const onMove = (mv: MouseEvent) => {
      if (!dragStart.current) return;
      const range = max - min;
      // 1 px = range / 200 (200 px for full sweep — feels natural)
      const delta = -(mv.clientY - dragStart.current.y) * (range / 200);
      let newVal = dragStart.current.value + delta;
      if (step !== undefined) {
        newVal = Math.round(newVal / step) * step;
      }
      onChange(clamp(newVal));
    };

    const onUp = () => {
      dragStart.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [value, min, max, onChange, step, disabled]);

  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    onChange(defaultValue);
  }, [defaultValue, onChange, disabled]);

  // Scroll wheel support
  const onWheel = useCallback((e: React.WheelEvent) => {
    if (disabled) return;
    e.preventDefault();
    const range = max - min;
    const delta = -e.deltaY * (range / 500);
    let newVal = value + delta;
    if (step !== undefined) {
      newVal = Math.round(newVal / step) * step;
    }
    onChange(clamp(newVal));
  }, [value, min, max, onChange, step, disabled]);

  const angle = valueToAngle(value, min, max, arc);
  const radius = size / 2;
  const strokeWidth = Math.max(2, size / 12);
  // Arc path parameters
  const startAngle = -arc / 2 - 90; // in SVG degrees (0 = top)
  const endAngle   = arc / 2 - 90;

  function polarToXY(deg: number, r: number) {
    const rad = (deg * Math.PI) / 180;
    return {
      x: radius + r * Math.sin(rad),
      y: radius - r * Math.cos(rad),
    };
  }

  const trackR = radius - strokeWidth / 2 - 1;
  const arcStart = polarToXY(startAngle, trackR);
  const arcEnd   = polarToXY(endAngle, trackR);
  const fillEnd  = polarToXY(angle - 90, trackR);

  const largeArc = arc > 180 ? 1 : 0;
  const fillLarge = Math.abs(angle - (-arc / 2)) > 180 ? 1 : 0;

  const trackPath = `M ${arcStart.x} ${arcStart.y} A ${trackR} ${trackR} 0 ${largeArc} 1 ${arcEnd.x} ${arcEnd.y}`;
  const fillPath  = `M ${arcStart.x} ${arcStart.y} A ${trackR} ${trackR} 0 ${fillLarge} 1 ${fillEnd.x} ${fillEnd.y}`;

  // Pointer / tick line
  const tickInner = polarToXY(angle - 90, radius * 0.25);
  const tickOuter = polarToXY(angle - 90, radius * 0.82);

  const displayValue = step !== undefined && step >= 1
    ? Math.round(value).toString()
    : value.toFixed(1);

  return (
    <div
      className={`flex flex-col items-center gap-0.5 select-none ${disabled ? 'opacity-40' : ''}`}
      title={`${label ?? ''}: ${displayValue}${unit ?? ''} (double-click to reset)`}
    >
      <div
        ref={knobRef}
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        className={`relative ${disabled ? 'cursor-not-allowed' : 'cursor-ns-resize'}`}
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Track arc */}
          <path
            d={trackPath}
            fill="none"
            stroke="#3f3f46"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Fill arc (value indicator) */}
          <path
            d={fillPath}
            fill="none"
            stroke="#6366f1"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Knob body */}
          <circle
            cx={radius}
            cy={radius}
            r={radius * 0.52}
            fill="#27272a"
            stroke="#52525b"
            strokeWidth={1}
          />
          {/* Pointer tick */}
          <line
            x1={tickInner.x}
            y1={tickInner.y}
            x2={tickOuter.x}
            y2={tickOuter.y}
            stroke="#a1a1aa"
            strokeWidth={Math.max(1, strokeWidth * 0.6)}
            strokeLinecap="round"
          />
        </svg>
      </div>
      {label && (
        <span className="text-[9px] text-zinc-500 leading-none uppercase tracking-wide">
          {label}
        </span>
      )}
      <span className="text-[9px] text-zinc-400 leading-none font-mono">
        {displayValue}{unit}
      </span>
    </div>
  );
}
