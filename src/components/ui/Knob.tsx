import { useCallback, useRef, useState } from 'react';
import { PrecisionInput, clampValue, roundToStep } from './PrecisionInput';
import { useNonPassiveWheel } from '../../hooks/useNonPassiveWheel';

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
  const [showPrecisionInput, setShowPrecisionInput] = useState(false);

  const clamp = (v: number) => clampValue(v, min, max);
  const applyStep = useCallback((nextValue: number) => clamp(roundToStep(nextValue, step)), [clamp, step]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    dragStart.current = { y: e.clientY, value };
    knobRef.current?.requestPointerLock?.();

    const onMove = (mv: MouseEvent) => {
      if (!dragStart.current) return;
      const range = max - min;
      const movementY = mv.movementY || (dragStart.current.y - mv.clientY);
      const delta = movementY * (range / 200);
      const newVal = applyStep(dragStart.current.value + delta);
      dragStart.current = { y: mv.clientY, value: newVal };
      onChange(newVal);
    };

    const onUp = () => {
      dragStart.current = null;
      document.exitPointerLock?.();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [value, min, max, onChange, disabled, applyStep]);

  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    onChange(defaultValue);
  }, [defaultValue, onChange, disabled]);

  // Scroll wheel support — non-passive so preventDefault() blocks native page scroll
  const onWheelHandler = useCallback((e: WheelEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    const range = max - min;
    const delta = -e.deltaY * (range / 500);
    onChange(applyStep(value + delta));
  }, [value, min, max, onChange, disabled, applyStep]);

  const wheelRef = useNonPassiveWheel(onWheelHandler);
  const mergedKnobRef = useCallback((el: HTMLDivElement | null) => {
    (knobRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    wheelRef(el);
  }, [wheelRef]);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setShowPrecisionInput(true);
  }, [disabled]);

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
        ref={mergedKnobRef}
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        aria-label={`${label ?? 'Control'} knob`}
        className={`relative transition-transform duration-150 ${disabled ? 'cursor-not-allowed' : 'cursor-ns-resize hover:scale-110'}`}
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Track arc */}
          <path
            d={trackPath}
            fill="none"
            stroke="#4a4a4a"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Fill arc (value indicator) */}
          <path
            d={fillPath}
            fill="none"
            stroke="#4a90d9"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Knob body */}
          <circle
            cx={radius}
            cy={radius}
            r={radius * 0.52}
            fill="#3c3c3c"
            stroke="#5a5a5a"
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
      {showPrecisionInput && (
        <PrecisionInput
          ariaLabel={`${label ?? 'Control'} exact value`}
          initialValue={value}
          min={min}
          max={max}
          step={step}
          onSubmit={(nextValue) => {
            onChange(nextValue);
            setShowPrecisionInput(false);
          }}
          onCancel={() => setShowPrecisionInput(false)}
        />
      )}
      {label && (
        <span className="text-[10px] text-zinc-400 leading-none uppercase tracking-wide">
          {label}
        </span>
      )}
      <span className="text-[10px] text-zinc-400 leading-none font-mono">
        {displayValue}{unit}
      </span>
    </div>
  );
}
