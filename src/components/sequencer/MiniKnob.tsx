import { useRef, useCallback } from 'react';

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
      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const dy = dragRef.current.startY - ev.clientY;
        const range = max - min;
        const sensitivity = ev.shiftKey ? 0.001 : 0.005;
        const newVal = Math.max(min, Math.min(max, dragRef.current.startVal + dy * range * sensitivity));
        onChange(newVal);
      };
      const onUp = () => {
        dragRef.current = null;
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

  const displayVal = bipolar
    ? `${value > 0 ? '+' : ''}${Math.round(value * 100)}`
    : `${Math.round(norm * 100)}`;

  return (
    <div
      className="flex flex-col items-center gap-0 cursor-ns-resize"
      title={label ? `${label}: ${displayVal}%` : `${displayVal}%`}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      <svg width={size} height={size} className="shrink-0">
        <path d={bgPath} fill="none" stroke="#404040" strokeWidth={strokeW} strokeLinecap="round" />
        {norm > 0.003 || bipolar ? (
          <path d={fillPath} fill="none" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
        ) : null}
        <circle cx={indInner.x} cy={indInner.y} r={1.5} fill="#e0e0e0" />
      </svg>
      {label && (
        <span className="text-[7px] text-[#808080] leading-none mt-0.5 select-none">{label}</span>
      )}
    </div>
  );
}
