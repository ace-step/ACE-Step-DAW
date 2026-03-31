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
  size?: number;
  /** Degrees of total rotation arc (default 270 — starts at 7 o'clock, ends at 5 o'clock) */
  arc?: number;
  step?: number;
  disabled?: boolean;
  /** Accent color for the value arc (default: '#4A5FFF') */
  color?: string;
  /** Size variant — overrides size prop. sm=24, md=32, lg=48 */
  variant?: 'sm' | 'md' | 'lg';
  /** Show floating value tooltip during drag (default: true) */
  showTooltip?: boolean;
  /** Custom value formatter for display */
  formatValue?: (v: number) => string;
}

const VARIANT_SIZES: Record<string, number> = { sm: 24, md: 32, lg: 48 };

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
  color = '#4A5FFF',
  variant,
  showTooltip = true,
  formatValue,
}: KnobProps) {
  const actualSize = variant ? VARIANT_SIZES[variant] : size;
  const dragStart = useRef<{ y: number; value: number } | null>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const [showPrecisionInput, setShowPrecisionInput] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const clamp = (v: number) => clampValue(v, min, max);
  const applyStep = useCallback((nextValue: number) => clamp(roundToStep(nextValue, step)), [clamp, step]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    dragStart.current = { y: e.clientY, value };
    setIsDragging(true);
    knobRef.current?.requestPointerLock?.();

    const onMove = (mv: MouseEvent) => {
      if (!dragStart.current) return;
      const range = max - min;
      const sensitivity = mv.altKey ? range / 2000 : range / 200;
      const delta = mv.movementY * sensitivity;
      const newVal = applyStep(dragStart.current.value + delta);
      dragStart.current = { y: mv.clientY, value: newVal };
      onChange(newVal);
    };

    const onUp = () => {
      dragStart.current = null;
      setIsDragging(false);
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

  const onWheelHandler = useCallback((e: WheelEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    const range = max - min;
    const sensitivity = e.altKey ? range / 5000 : range / 500;
    const delta = -e.deltaY * sensitivity;
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

  // SVG geometry — Ableton-flat style: arc + center dot only
  const s = actualSize;
  const radius = s / 2;
  const strokeWidth = Math.max(3, s / 7);
  const startAngle = -arc / 2 - 90;
  const endAngle = arc / 2 - 90;
  const angle = valueToAngle(value, min, max, arc);

  function polarToXY(deg: number, r: number) {
    const rad = (deg * Math.PI) / 180;
    return { x: radius + r * Math.sin(rad), y: radius - r * Math.cos(rad) };
  }

  const trackR = radius - strokeWidth / 2 - 1;
  const arcStart = polarToXY(startAngle, trackR);
  const arcEnd = polarToXY(endAngle, trackR);
  const fillEnd = polarToXY(angle - 90, trackR);

  const largeArc = arc > 180 ? 1 : 0;
  const fillLarge = Math.abs(angle - (-arc / 2)) > 180 ? 1 : 0;

  const trackPath = `M ${arcStart.x} ${arcStart.y} A ${trackR} ${trackR} 0 ${largeArc} 1 ${arcEnd.x} ${arcEnd.y}`;
  const fillPath = `M ${arcStart.x} ${arcStart.y} A ${trackR} ${trackR} 0 ${fillLarge} 1 ${fillEnd.x} ${fillEnd.y}`;

  // Pointer position — small dot at current angle
  const pointerPos = polarToXY(angle - 90, trackR);
  const pointerR = Math.max(1.5, strokeWidth * 0.4);

  // Value display
  const defaultDisplayValue = step !== undefined && step >= 1
    ? Math.round(value).toString()
    : value.toFixed(1);
  const displayValue = formatValue ? formatValue(value) : defaultDisplayValue;

  return (
    <div
      className={`flex flex-col items-center gap-1 select-none ${disabled ? 'opacity-40' : ''}`}
      title={`${label ?? ''}: ${displayValue}${unit && !formatValue ? unit : ''} (double-click to reset)`}
    >
      <div className="relative">
        <div
          ref={mergedKnobRef}
          onMouseDown={onMouseDown}
          onDoubleClick={onDoubleClick}
          onContextMenu={onContextMenu}
          aria-label={`${label ?? 'Control'} knob`}
          className={`relative ${disabled ? 'cursor-not-allowed' : 'cursor-ns-resize'}`}
          style={{ width: s, height: s }}
        >
          <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} overflow="visible">
            <defs>
              <filter id="knob-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            {/* Track arc — dark background ring */}
            <path
              d={trackPath}
              fill="none"
              stroke="rgba(255,255,255,0.14)"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />

            {/* Value fill arc — colored */}
            <path
              d={fillPath}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              opacity={isDragging ? 1 : 0.8}
              filter={isDragging ? 'url(#knob-glow)' : undefined}
            />

            {/* Minimal center anchor */}
            <circle
              cx={radius}
              cy={radius}
              r={1.5}
              fill="rgba(255,255,255,0.06)"
            />
          </svg>
        </div>

        {/* Floating value tooltip during drag */}
        {showTooltip && isDragging && (
          <div
            className="absolute left-1/2 -translate-x-1/2 pointer-events-none z-50 whitespace-nowrap
                        rounded bg-black/90 px-1.5 py-0.5 text-[10px] font-mono text-white shadow-lg
                        border border-white/10"
            style={{ bottom: s + 4 }}
          >
            {displayValue}{unit && !formatValue ? unit : ''}
          </div>
        )}
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
      {/* Label */}
      {label && (
        <span className="text-[11px] text-white/55 leading-tight">
          {label}
        </span>
      )}
      {/* Value */}
      <span className="text-xs text-white/75 leading-tight font-mono font-medium">
        {displayValue}{unit && !formatValue ? unit : ''}
      </span>
    </div>
  );
}
