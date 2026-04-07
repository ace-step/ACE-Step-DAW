import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { PrecisionInput, clampValue, roundToStep } from './PrecisionInput';

interface DualRangeSliderProps {
  min: number;
  max: number;
  startValue: number;
  endValue: number;
  onChange: (start: number, end: number) => void;
  /** Minimum span between start and end (default 0.5) */
  minSpan?: number;
  step?: number;
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return m > 0 ? `${m}:${sec.padStart(4, '0')}` : `${sec}s`;
}

export function DualRangeSlider({
  min,
  max,
  startValue,
  endValue,
  onChange,
  minSpan = 0.5,
  step = 0.1,
}: DualRangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [editingHandle, setEditingHandle] = useState<'start' | 'end' | null>(null);

  const clamp = (v: number, lo: number, hi: number) => clampValue(v, lo, hi);
  const round = (v: number) => Math.round(v / step) * step;

  const pxToValue = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track) return min;
      const rect = track.getBoundingClientRect();
      const pct = clamp((clientX - rect.left) / rect.width, 0, 1);
      return round(min + pct * (max - min));
    },
    [min, max, step],
  );

  const startPct = ((startValue - min) / (max - min)) * 100;
  const endPct = ((endValue - min) / (max - min)) * 100;

  const makeKeyHandler = useCallback(
    (which: 'start' | 'end') => (e: KeyboardEvent) => {
      const coarseStep = step * 10;
      let delta = 0;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowUp':
          delta = step;
          break;
        case 'ArrowLeft':
        case 'ArrowDown':
          delta = -step;
          break;
        case 'PageUp':
          delta = coarseStep;
          break;
        case 'PageDown':
          delta = -coarseStep;
          break;
        case 'Home':
          if (which === 'start') { onChange(min, endValue); } else { onChange(startValue, clamp(startValue + minSpan, startValue + minSpan, max)); }
          e.preventDefault();
          return;
        case 'End':
          if (which === 'start') { onChange(clamp(endValue - minSpan, min, endValue - minSpan), endValue); } else { onChange(startValue, max); }
          e.preventDefault();
          return;
        default:
          return;
      }
      e.preventDefault();
      if (which === 'start') {
        const newStart = round(clamp(startValue + delta, min, endValue - minSpan));
        onChange(newStart, endValue);
      } else {
        const newEnd = round(clamp(endValue + delta, startValue + minSpan, max));
        onChange(startValue, newEnd);
      }
    },
    [startValue, endValue, min, max, minSpan, step, onChange, clamp, round],
  );

  const makeDragHandler = useCallback(
    (which: 'start' | 'end') => (e: React.MouseEvent) => {
      e.preventDefault();
      const onMove = (ev: MouseEvent) => {
        const v = pxToValue(ev.clientX);
        if (which === 'start') {
          const newStart = clamp(v, min, endValue - minSpan);
          onChange(newStart, endValue);
        } else {
          const newEnd = clamp(v, startValue + minSpan, max);
          onChange(startValue, newEnd);
        }
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [pxToValue, min, max, startValue, endValue, minSpan, onChange],
  );

  const updateExactValue = useCallback((which: 'start' | 'end', rawValue: number) => {
    const nextValue = roundToStep(rawValue, step);
    if (which === 'start') {
      onChange(clamp(nextValue, min, endValue - minSpan), endValue);
    } else {
      onChange(startValue, clamp(nextValue, startValue + minSpan, max));
    }
    setEditingHandle(null);
  }, [clamp, endValue, max, min, minSpan, onChange, startValue, step]);

  return (
    <div className="w-full select-none">
      {/* Track */}
      <div
        ref={trackRef}
        className="relative h-2 bg-[#444] rounded-full mx-2 mt-2"
        style={{ userSelect: 'none' }}
      >
        {/* Filled region */}
        <div
          className="absolute top-0 bottom-0 bg-daw-accent rounded-full"
          style={{ left: `${startPct}%`, right: `${100 - endPct}%` }}
        />

        {/* Start thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white border-2 border-daw-accent shadow-md cursor-col-resize hover:scale-110 transition-transform z-10"
          style={{ left: `${startPct}%` }}
          role="slider"
          tabIndex={0}
          aria-label="Range start"
          aria-valuenow={roundToStep(startValue, step)}
          aria-valuemin={min}
          aria-valuemax={endValue - minSpan}
          aria-valuetext={fmt(startValue)}
          onMouseDown={makeDragHandler('start')}
          onKeyDown={makeKeyHandler('start')}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setEditingHandle('start');
          }}
        />

        {/* End thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white border-2 border-daw-accent shadow-md cursor-col-resize hover:scale-110 transition-transform z-10"
          style={{ left: `${endPct}%` }}
          role="slider"
          tabIndex={0}
          aria-label="Range end"
          aria-valuenow={roundToStep(endValue, step)}
          aria-valuemin={startValue + minSpan}
          aria-valuemax={max}
          aria-valuetext={fmt(endValue)}
          onMouseDown={makeDragHandler('end')}
          onKeyDown={makeKeyHandler('end')}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setEditingHandle('end');
          }}
        />
      </div>

      {/* Labels */}
      <div className="relative h-5 mx-2 mt-1">
        {/* Start label — clamp so it doesn't overflow left */}
        <span
          className="absolute text-[10px] font-mono text-zinc-300 -translate-x-1/2 whitespace-nowrap tabular-nums"
          style={{ left: `${clamp(startPct, 0, 85)}%` }}
        >
          {fmt(startValue)}
        </span>
        {/* End label — clamp so it doesn't overflow right */}
        <span
          className="absolute text-[10px] font-mono text-zinc-300 -translate-x-1/2 whitespace-nowrap tabular-nums"
          style={{ left: `${clamp(endPct, 15, 100)}%` }}
        >
          {fmt(endValue)}
        </span>
      </div>

      {/* Duration badge */}
      <div className="text-center text-[10px] text-zinc-400 mt-0.5 tabular-nums">
        duration: {fmt(endValue - startValue)}
      </div>
      {editingHandle && (
        <div className="mt-1 flex justify-center">
          <PrecisionInput
            ariaLabel={editingHandle === 'start' ? 'Start exact value' : 'End exact value'}
            initialValue={editingHandle === 'start' ? startValue : endValue}
            min={editingHandle === 'start' ? min : startValue + minSpan}
            max={editingHandle === 'start' ? endValue - minSpan : max}
            step={step}
            onSubmit={(nextValue) => updateExactValue(editingHandle, nextValue)}
            onCancel={() => setEditingHandle(null)}
          />
        </div>
      )}
    </div>
  );
}
