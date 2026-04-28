/**
 * HSlider — Reusable horizontal slider component.
 * Extracted from EffectCards.tsx.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { PrecisionInput, clampValue, roundToStep } from './PrecisionInput';

interface HSliderProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  defaultValue?: number;
  label?: string;
  displayValue?: string;
  color?: string;
  width?: number;
}
export function HSlider({ value, onChange, min = 0, max = 1, defaultValue = min, label, displayValue, color = '#a855f7', width = 80 }: HSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [showPrecisionInput, setShowPrecisionInput] = useState(false);
  const clamp = useCallback((nextValue: number) => clampValue(nextValue, min, max), [min, max]);
  const step = (max - min) / 100;

  // Store active listeners in a ref so cleanup can remove them on unmount
  const listenersRef = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void } | null>(null);

  useEffect(() => {
    return () => {
      if (listenersRef.current) {
        document.removeEventListener('pointermove', listenersRef.current.move);
        document.removeEventListener('pointerup', listenersRef.current.up);
        document.removeEventListener('pointercancel', listenersRef.current.up);
        listenersRef.current = null;
      }
    };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const track = trackRef.current;
    if (!track) return;

    // Clean up any existing drag session before starting a new one
    if (listenersRef.current) {
      document.removeEventListener('pointermove', listenersRef.current.move);
      document.removeEventListener('pointerup', listenersRef.current.up);
      document.removeEventListener('pointercancel', listenersRef.current.up);
      listenersRef.current = null;
    }

    track.setPointerCapture(e.pointerId);

    const update = (clientX: number) => {
      const rect = track.getBoundingClientRect();
      const norm = clampValue((clientX - rect.left) / rect.width, 0, 1);
      onChange(clamp(min + norm * (max - min)));
    };
    update(e.clientX);

    const onMove = (pe: PointerEvent) => update(pe.clientX);
    const cleanup = (pe: PointerEvent) => {
      if (track.hasPointerCapture(pe.pointerId)) {
        track.releasePointerCapture(pe.pointerId);
      }
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', cleanup);
      document.removeEventListener('pointercancel', cleanup);
      listenersRef.current = null;
    };
    listenersRef.current = { move: onMove, up: cleanup };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', cleanup);
    document.addEventListener('pointercancel', cleanup);
  }, [clamp, onChange, min, max]);

  const norm = (value - min) / (max - min);

  return (
    <div className="flex flex-col gap-0.5">
      {label && (
        <div className="flex justify-between items-center">
          <span className="text-[9px] text-white/30 tracking-wide">{label}</span>
          {displayValue && <span className="text-[10px] text-white/60 font-mono font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>{displayValue}</span>}
        </div>
      )}
      <div
        ref={trackRef}
        className="group relative cursor-pointer rounded-sm hover:brightness-125 transition-[filter] duration-150 focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/30"
        style={{ width, height: 4 }}
        role="slider"
        tabIndex={0}
        aria-label={`${label ?? 'Control'} slider`}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(value * 1000) / 1000}
        aria-valuetext={displayValue ?? `${Math.round(value * 1000) / 1000}`}
        onPointerDown={handlePointerDown}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onChange(clamp(defaultValue));
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowPrecisionInput(true);
        }}
        onKeyDown={(e) => {
          let next: number | null = null;
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = clamp(value + step);
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = clamp(value - step);
          else if (e.key === 'Home') next = min;
          else if (e.key === 'End') next = max;
          if (next !== null) { e.preventDefault(); onChange(next); }
        }}
      >
        {/* Track background */}
        <div className="absolute inset-0 rounded-sm bg-white/[0.06]" />
        {/* Filled portion — crisp right edge, no thumb */}
        <div
          className="absolute left-0 top-0 bottom-0 rounded-sm transition-opacity duration-150 group-hover:opacity-90"
          style={{ width: `${norm * 100}%`, backgroundColor: color, opacity: 0.7 }}
        />
      </div>
      {showPrecisionInput && (
        <PrecisionInput
          ariaLabel={`${label ?? 'Control'} exact value`}
          initialValue={value}
          min={min}
          max={max}
          step={step}
          onSubmit={(nextValue) => {
            onChange(clamp(roundToStep(nextValue, step)));
            setShowPrecisionInput(false);
          }}
          onCancel={() => setShowPrecisionInput(false)}
          className="mt-1 w-20 rounded border border-white/20 bg-[#111426] px-1.5 py-1 text-[10px] text-white outline-none"
        />
      )}
    </div>
  );
}
