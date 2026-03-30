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
      const movementY = mv.movementY || (dragStart.current.y - mv.clientY);
      // Alt key = fine mode (1/10 sensitivity)
      const sensitivity = mv.altKey ? range / 2000 : range / 200;
      const delta = movementY * sensitivity;
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

  // SVG geometry
  const s = actualSize;
  const radius = s / 2;
  const strokeWidth = Math.max(2, s / 12);
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

  // Pointer tick
  const tickInner = polarToXY(angle - 90, radius * 0.2);
  const tickOuter = polarToXY(angle - 90, radius * 0.48);

  // Body radius
  const bodyR = radius * 0.54;

  // Value display
  const defaultDisplayValue = step !== undefined && step >= 1
    ? Math.round(value).toString()
    : value.toFixed(1);
  const displayValue = formatValue ? formatValue(value) : defaultDisplayValue;

  // Unique IDs for SVG defs
  const uid = useRef(`knob-${Math.random().toString(36).slice(2, 8)}`).current;

  return (
    <div
      className={`flex flex-col items-center gap-0.5 select-none ${disabled ? 'opacity-40' : ''}`}
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
          <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
            <defs>
              {/* Drop shadow filter */}
              <filter id={`${uid}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="1" stdDeviation={s > 30 ? 2 : 1} floodColor="#000" floodOpacity="0.5" />
              </filter>
              {/* Radial gradient for knob body — lighter center, darker edge */}
              <radialGradient id={`${uid}-body`} cx="45%" cy="40%">
                <stop offset="0%" stopColor="#555" />
                <stop offset="70%" stopColor="#3a3a3a" />
                <stop offset="100%" stopColor="#2a2a2a" />
              </radialGradient>
              {/* Active glow */}
              {isDragging && (
                <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feFlood floodColor={color} floodOpacity="0.3" result="color" />
                  <feComposite in="color" in2="blur" operator="in" result="glow" />
                  <feMerge>
                    <feMergeNode in="glow" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              )}
            </defs>

            {/* Track arc (background) */}
            <path
              d={trackPath}
              fill="none"
              stroke="#333"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />

            {/* Value fill arc */}
            <path
              d={fillPath}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />

            {/* Knob body — layered rendering */}
            <g filter={isDragging ? `url(#${uid}-glow)` : `url(#${uid}-shadow)`}>
              {/* Edge ring */}
              <circle
                cx={radius}
                cy={radius}
                r={bodyR + 1}
                fill="none"
                stroke="#222"
                strokeWidth={1.5}
              />
              {/* Main body with radial gradient */}
              <circle
                cx={radius}
                cy={radius}
                r={bodyR}
                fill={`url(#${uid}-body)`}
              />
              {/* Subtle inner bevel highlight */}
              <circle
                cx={radius}
                cy={radius}
                r={bodyR - 1}
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={0.5}
              />
            </g>

            {/* Pointer tick */}
            <line
              x1={tickInner.x}
              y1={tickInner.y}
              x2={tickOuter.x}
              y2={tickOuter.y}
              stroke={isDragging ? '#fff' : '#ccc'}
              strokeWidth={Math.max(1.5, strokeWidth * 0.5)}
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Floating value tooltip during drag */}
        {showTooltip && isDragging && (
          <div
            className="absolute left-1/2 -translate-x-1/2 pointer-events-none z-50 whitespace-nowrap
                        rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-mono text-white shadow-lg
                        animate-[fadeIn_100ms_ease-in]"
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
      {label && (
        <span className="text-[10px] text-zinc-400 leading-none uppercase tracking-wide">
          {label}
        </span>
      )}
      <span className="text-[10px] text-zinc-400 leading-none font-mono">
        {displayValue}{unit && !formatValue ? unit : ''}
      </span>
    </div>
  );
}
