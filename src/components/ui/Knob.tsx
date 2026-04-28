import { useCallback, useEffect, useRef, useState } from 'react';
import { PrecisionInput, clampValue, roundToStep } from './PrecisionInput';
import { useNonPassiveWheel } from '../../hooks/useNonPassiveWheel';
import { useSmoothedValue } from '../../hooks/useSmoothedValue';

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
  /** Parameter ID for hover highlighting (links knob to visualization elements) */
  paramId?: string;
  /** Called when hover state changes — enables connected parameter highlighting */
  onHoverChange?: (paramId: string, hovered: boolean) => void;
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
  paramId,
  onHoverChange,
}: KnobProps) {
  const actualSize = variant ? VARIANT_SIZES[variant] : size;
  const dragStart = useRef<{ y: number; value: number } | null>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const [showPrecisionInput, setShowPrecisionInput] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isFineMode, setIsFineMode] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up reset timer on unmount
  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

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
      const fine = mv.altKey;
      let sensitivity = fine ? range / 2000 : range / 200;
      // Magnetic snap: reduce sensitivity near default value
      const snapZone = range * 0.03; // 3% of range
      const distFromDefault = Math.abs(dragStart.current.value - defaultValue);
      if (distFromDefault < snapZone) {
        sensitivity *= 0.5; // half speed near default
      }
      const delta = mv.movementY * sensitivity;
      let newVal = applyStep(dragStart.current.value + delta);
      // Snap to exact default if within half-step
      if (Math.abs(newVal - defaultValue) < (step ?? range / 200) * 0.5) {
        newVal = defaultValue;
      }
      dragStart.current = { y: mv.clientY, value: newVal };
      setIsFineMode(fine);
      onChange(newVal);
    };

    const onUp = () => {
      dragStart.current = null;
      setIsDragging(false);
      setIsFineMode(false);
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
    // Trigger reset animation
    setIsResetting(true);
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setIsResetting(false), 200);
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

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) return;
    const range = max - min;
    const coarseStep = step ?? range / 100;
    const fineStep = step ? step : range / 1000;
    const s = e.altKey ? fineStep : coarseStep;

    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        e.preventDefault();
        onChange(applyStep(value + s));
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        e.preventDefault();
        onChange(applyStep(value - s));
        break;
      case 'Home':
        e.preventDefault();
        onChange(min);
        break;
      case 'End':
        e.preventDefault();
        onChange(max);
        break;
    }
  }, [value, min, max, step, onChange, disabled, applyStep]);

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

  const onMouseEnter = useCallback(() => {
    if (paramId && onHoverChange) onHoverChange(paramId, true);
  }, [paramId, onHoverChange]);

  const onMouseLeave = useCallback(() => {
    if (paramId && onHoverChange) onHoverChange(paramId, false);
  }, [paramId, onHoverChange]);

  // Visual smoothing: smooth external (automation/preset) changes over ~3 frames,
  // but during drag, use direct value for instant feedback
  const smoothedValue = useSmoothedValue(value, { factor: isDragging ? 1 : 0.35 });
  const visualValue = isDragging ? value : smoothedValue;

  // SVG geometry — Ableton-flat style: arc + center dot only
  const s = actualSize;
  const radius = s / 2;
  const strokeWidth = Math.max(3, s / 7);
  const startAngle = -arc / 2 - 90;
  const endAngle = arc / 2 - 90;
  const angle = valueToAngle(visualValue, min, max, arc);

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

  // Default value detent marker position
  const defaultAngle = valueToAngle(defaultValue, min, max, arc);
  const detentInner = polarToXY(defaultAngle - 90, trackR - strokeWidth * 0.6);
  const detentOuter = polarToXY(defaultAngle - 90, trackR + strokeWidth * 0.6);
  const isAtDefault = Math.abs(value - defaultValue) < (step ?? (max - min) / 200) * 0.5;

  // Value display
  const defaultDisplayValue = step !== undefined && step >= 1
    ? Math.round(value).toString()
    : value.toFixed(1);
  const displayValue = formatValue ? formatValue(value) : defaultDisplayValue;

  return (
    <div
      className={`flex flex-col items-center gap-1 select-none ${disabled ? 'opacity-40' : ''}`}
      title={`${label ?? ''}: ${displayValue}${unit && !formatValue ? unit : ''} (double-click to reset)`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      data-param-id={paramId}
    >
      <div className="relative">
        <div
          ref={mergedKnobRef}
          onMouseDown={onMouseDown}
          onDoubleClick={onDoubleClick}
          onContextMenu={onContextMenu}
          onKeyDown={onKeyDown}
          aria-label={`${label ?? 'Control'} knob`}
          tabIndex={disabled ? -1 : 0}
          role="slider"
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuetext={`${displayValue}${unit && !formatValue ? unit : ''}`}
          className={`relative outline-none rounded-full transition-[transform,filter] duration-150
            focus-visible:ring-2 focus-visible:ring-daw-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent
            ${disabled ? 'cursor-not-allowed' : 'cursor-ns-resize hover:brightness-110 hover:scale-[1.03]'}`}
          style={{
            width: s,
            height: s,
            ...(isDragging ? { filter: 'brightness(1.15)', transform: 'scale(1.05)' } : {}),
          }}
          data-dragging={isDragging ? 'true' : undefined}
          data-resetting={isResetting ? 'true' : undefined}
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
              stroke={isFineMode ? '#22d3ee' : color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              opacity={isDragging ? 1 : 0.8}
              filter={isDragging ? 'url(#knob-glow)' : undefined}
              style={isResetting ? { transition: 'd 200ms ease-out' } : undefined}
            />

            {/* Default value detent marker */}
            <line
              x1={detentInner.x} y1={detentInner.y}
              x2={detentOuter.x} y2={detentOuter.y}
              stroke={isAtDefault ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)'}
              strokeWidth={isAtDefault ? 1.5 : 0.75}
              strokeLinecap="round"
            />

            {/* Reset pulse — bright flash on the arc when double-click resets */}
            {isResetting && (
              <path
                d={trackPath}
                fill="none"
                stroke="rgba(255,255,255,0.6)"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                style={{ animation: 'knob-reset-pulse 200ms ease-out forwards' }}
              />
            )}

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
                        rounded-sm bg-black/90 px-1.5 py-0.5 text-[10px] font-mono text-white shadow-lg
                        border border-white/10"
            style={{ bottom: s + 4, fontVariantNumeric: 'tabular-nums' }}
          >
            {displayValue}{unit && !formatValue ? unit : ''}
          </div>
        )}

        {/* Fine mode indicator */}
        {isDragging && isFineMode && (
          <div
            className="absolute left-1/2 -translate-x-1/2 pointer-events-none z-50 whitespace-nowrap
                        rounded bg-cyan-500/90 px-1 py-0.5 text-[10px] font-mono text-white shadow-lg"
            style={{ bottom: s + (showTooltip ? 22 : 4) }}
          >
            Fine
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
      {/* Value — tabular-nums prevents digit jitter during parameter changes */}
      <span className="text-xs text-white/75 leading-tight font-mono font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {displayValue}{unit && !formatValue ? unit : ''}
      </span>
    </div>
  );
}
