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

    const onMove = (mv: MouseEvent) => {
      if (!dragStart.current) return;
      const range = max - min;
      const dy = dragStart.current.y - mv.clientY;
      const sensitivity = mv.altKey ? range / 2000 : range / 200;
      const delta = dy * sensitivity;
      const newVal = applyStep(dragStart.current.value + delta);
      dragStart.current = { y: mv.clientY, value: newVal };
      onChange(newVal);
    };

    const onUp = () => {
      dragStart.current = null;
      setIsDragging(false);
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
  const strokeWidth = Math.max(2.5, s / 10); // thicker arcs for better visibility
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

  // Pointer tick — extends from center toward edge
  const tickInner = polarToXY(angle - 90, radius * 0.15);
  const tickOuter = polarToXY(angle - 90, radius * 0.46);

  // Body radius — larger for more surface area
  const bodyR = radius * 0.56;

  // Value display
  const defaultDisplayValue = step !== undefined && step >= 1
    ? Math.round(value).toString()
    : value.toFixed(1);
  const displayValue = formatValue ? formatValue(value) : defaultDisplayValue;

  // Unique IDs for SVG defs
  const uid = useRef(`knob-${Math.random().toString(36).slice(2, 8)}`).current;

  return (
    <div
      className={`flex flex-col items-center gap-[3px] select-none ${disabled ? 'opacity-40' : ''}`}
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
              {/* Drop shadow — subtle depth */}
              <filter id={`${uid}-shadow`} x="-25%" y="-15%" width="150%" height="160%">
                <feDropShadow dx="0" dy={s > 30 ? 1.5 : 1} stdDeviation={s > 30 ? 2.5 : 1.5} floodColor="#000" floodOpacity="0.6" />
              </filter>
              {/* Radial gradient — brighter metallic feel with off-center highlight */}
              <radialGradient id={`${uid}-body`} cx="42%" cy="38%" r="55%">
                <stop offset="0%" stopColor="#6a6a6a" />
                <stop offset="45%" stopColor="#4a4a4a" />
                <stop offset="80%" stopColor="#353535" />
                <stop offset="100%" stopColor="#282828" />
              </radialGradient>
              {/* Active glow — brighter, wider */}
              {isDragging && (
                <filter id={`${uid}-glow`} x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feFlood floodColor={color} floodOpacity="0.4" result="color" />
                  <feComposite in="color" in2="blur" operator="in" result="glow" />
                  <feMerge>
                    <feMergeNode in="glow" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              )}
            </defs>

            {/* Track arc — darker background ring */}
            <path
              d={trackPath}
              fill="none"
              stroke="#252525"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />

            {/* Value fill arc — colored, brighter */}
            <path
              d={fillPath}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              opacity={isDragging ? 1 : 0.85}
            />

            {/* Knob body — layered for depth */}
            <g filter={isDragging ? `url(#${uid}-glow)` : `url(#${uid}-shadow)`}>
              {/* Outer edge ring — dark bevel */}
              <circle
                cx={radius}
                cy={radius}
                r={bodyR + 1.5}
                fill="none"
                stroke="#1a1a1a"
                strokeWidth={1}
              />
              {/* Main body — metallic gradient */}
              <circle
                cx={radius}
                cy={radius}
                r={bodyR}
                fill={`url(#${uid}-body)`}
              />
              {/* Top highlight — convex surface simulation */}
              <circle
                cx={radius}
                cy={radius}
                r={bodyR - 1}
                fill="none"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth={0.7}
              />
            </g>

            {/* Pointer tick — bright indicator line */}
            <line
              x1={tickInner.x}
              y1={tickInner.y}
              x2={tickOuter.x}
              y2={tickOuter.y}
              stroke={isDragging ? '#fff' : '#ddd'}
              strokeWidth={Math.max(1.5, strokeWidth * 0.45)}
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Floating value tooltip during drag */}
        {showTooltip && isDragging && (
          <div
            className="absolute left-1/2 -translate-x-1/2 pointer-events-none z-50 whitespace-nowrap
                        rounded-md bg-black/90 px-2 py-0.5 text-[10px] font-mono text-white shadow-lg
                        border border-white/10"
            style={{ bottom: s + 6 }}
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
        <span className="text-[10px] text-zinc-400 leading-none tracking-wide">
          {label}
        </span>
      )}
      <span className="text-[10px] text-zinc-300 leading-none font-mono">
        {displayValue}{unit && !formatValue ? unit : ''}
      </span>
    </div>
  );
}
