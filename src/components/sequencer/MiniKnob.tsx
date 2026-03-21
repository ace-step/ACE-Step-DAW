import { useRef, useCallback, useState } from 'react';
import { useNonPassiveWheel } from '../../hooks/useNonPassiveWheel';
import { PrecisionInput, clampValue } from '../ui/PrecisionInput';

interface MiniKnobProps {
  value: number;
  min?: number;
  max?: number;
  size?: number;
  color?: string;
  label?: string;
  onChange: (value: number) => void;
  bipolar?: boolean;
}

const ARC_START = (3 * Math.PI) / 4;
const ARC_END = (1 * Math.PI) / 4 + 2 * Math.PI;
const ARC_RANGE = ARC_END - ARC_START;

export function MiniKnob({
  value,
  min = 0,
  max = 1,
  size = 18,
  color = '#22c55e',
  label,
  onChange,
  bipolar = false,
}: MiniKnobProps) {
  const dragRef = useRef<{ startY: number; startVal: number } | null>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const [showPrecisionInput, setShowPrecisionInput] = useState(false);

  const norm = (value - min) / (max - min);
  const r = size / 2;
  const strokeW = 2.5;
  const arcR = r - strokeW;
  const cx = r;
  const cy = r;

  const polarToXY = (angle: number) => ({
    x: cx + arcR * Math.cos(angle),
    y: cy + arcR * Math.sin(angle),
  });

  const bgStart = polarToXY(ARC_START);
  const bgEnd = polarToXY(ARC_END);
  const bgPath = `M ${bgStart.x} ${bgStart.y} A ${arcR} ${arcR} 0 1 1 ${bgEnd.x} ${bgEnd.y}`;

  let fillPath = '';
  if (bipolar) {
    const midAngle = ARC_START + ARC_RANGE * 0.5;
    const valAngle = ARC_START + ARC_RANGE * norm;
    const fromAngle = Math.min(midAngle, valAngle);
    const toAngle = Math.max(midAngle, valAngle);
    const sweep = toAngle - fromAngle;
    const largeArc = sweep > Math.PI ? 1 : 0;
    const from = polarToXY(fromAngle);
    const to = polarToXY(toAngle);
    fillPath = `M ${from.x} ${from.y} A ${arcR} ${arcR} 0 ${largeArc} 1 ${to.x} ${to.y}`;
  } else {
    const valAngle = ARC_START + ARC_RANGE * norm;
    const sweep = valAngle - ARC_START;
    const largeArc = sweep > Math.PI ? 1 : 0;
    const start = polarToXY(ARC_START);
    const end = polarToXY(valAngle);
    fillPath = `M ${start.x} ${start.y} A ${arcR} ${arcR} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  }

  const indicatorAngle = ARC_START + ARC_RANGE * norm;
  const indInner = polarToXY(indicatorAngle);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { startY: e.clientY, startVal: value };
      knobRef.current?.requestPointerLock?.();
      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const range = max - min;
        const sensitivity = ev.shiftKey ? 0.001 : 0.005;
        const movementY = ev.movementY || (dragRef.current.startY - ev.clientY);
        const newVal = clampValue(dragRef.current.startVal + movementY * range * sensitivity, min, max);
        dragRef.current = { startY: ev.clientY, startVal: newVal };
        onChange(newVal);
      };
      const onUp = () => {
        dragRef.current = null;
        document.exitPointerLock?.();
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [value, min, max, onChange],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onChange(bipolar ? (min + max) / 2 : min);
    },
    [bipolar, min, max, onChange],
  );

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const range = max - min;
      const sensitivity = e.shiftKey ? 0.0005 : 0.001;
      onChange(clampValue(value - e.deltaY * range * sensitivity, min, max));
    },
    [value, min, max, onChange],
  );

  const wheelRef = useNonPassiveWheel(handleWheel);
  const mergedKnobRef = useCallback((el: HTMLDivElement | null) => {
    (knobRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    wheelRef(el);
  }, [wheelRef]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setShowPrecisionInput(true);
    },
    [],
  );

  const displayVal = bipolar
    ? `${value > 0 ? '+' : ''}${Math.round(value * 100)}`
    : `${Math.round(norm * 100)}`;

  return (
    <div
      ref={mergedKnobRef}
      className="flex flex-col items-center gap-0 cursor-ns-resize"
      title={label ? `${label}: ${displayVal}%` : `${displayVal}%`}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      aria-label={`${label ?? 'Control'} mini knob`}
    >
      <svg width={size} height={size} className="shrink-0">
        <path d={bgPath} fill="none" stroke="#404040" strokeWidth={strokeW} strokeLinecap="round" />
        {norm > 0.003 || bipolar ? (
          <path d={fillPath} fill="none" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
        ) : null}
        <circle cx={indInner.x} cy={indInner.y} r={1.5} fill="#e0e0e0" />
      </svg>
      {showPrecisionInput && (
        <PrecisionInput
          ariaLabel={`${label ?? 'Control'} exact value`}
          initialValue={value}
          min={min}
          max={max}
          step={(max - min) / 100}
          onSubmit={(nextValue) => {
            onChange(nextValue);
            setShowPrecisionInput(false);
          }}
          onCancel={() => setShowPrecisionInput(false)}
          className="mt-1 w-14 rounded border border-white/20 bg-[#1a1a1a] px-1 py-0.5 text-[10px] text-white outline-none"
        />
      )}
      {label && (
        <span className="text-[7px] text-[#808080] leading-none mt-0.5 select-none">{label}</span>
      )}
    </div>
  );
}
