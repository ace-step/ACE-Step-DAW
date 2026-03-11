import { useCallback, useRef, useEffect } from 'react';

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

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
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

  return (
    <div className="w-full select-none">
      {/* Track */}
      <div
        ref={trackRef}
        className="relative h-2 bg-zinc-700 rounded-full mx-2 mt-2"
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
          onMouseDown={makeDragHandler('start')}
        />

        {/* End thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white border-2 border-daw-accent shadow-md cursor-col-resize hover:scale-110 transition-transform z-10"
          style={{ left: `${endPct}%` }}
          onMouseDown={makeDragHandler('end')}
        />
      </div>

      {/* Labels */}
      <div className="relative h-5 mx-2 mt-1">
        {/* Start label — clamp so it doesn't overflow left */}
        <span
          className="absolute text-[9px] font-mono text-zinc-300 -translate-x-1/2 whitespace-nowrap"
          style={{ left: `${clamp(startPct, 0, 85)}%` }}
        >
          {fmt(startValue)}
        </span>
        {/* End label — clamp so it doesn't overflow right */}
        <span
          className="absolute text-[9px] font-mono text-zinc-300 -translate-x-1/2 whitespace-nowrap"
          style={{ left: `${clamp(endPct, 15, 100)}%` }}
        >
          {fmt(endValue)}
        </span>
      </div>

      {/* Duration badge */}
      <div className="text-center text-[9px] text-zinc-500 mt-0.5">
        duration: {fmt(endValue - startValue)}
      </div>
    </div>
  );
}
