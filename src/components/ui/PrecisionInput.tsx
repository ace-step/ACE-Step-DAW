import { useEffect, useRef, useState } from 'react';

interface PrecisionInputProps {
  ariaLabel: string;
  initialValue: number;
  min: number;
  max: number;
  step?: number;
  onSubmit: (value: number) => void;
  onCancel: () => void;
  className?: string;
}

export function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function roundToStep(value: number, step?: number): number {
  if (step === undefined || step <= 0) {
    return value;
  }
  return Math.round(value / step) * step;
}

export function PrecisionInput({
  ariaLabel,
  initialValue,
  min,
  max,
  step,
  onSubmit,
  onCancel,
  className,
}: PrecisionInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(initialValue.toString());

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = () => {
    const parsed = Number(draft);
    if (Number.isNaN(parsed)) {
      onCancel();
      return;
    }
    onSubmit(clampValue(roundToStep(parsed, step), min, max));
  };

  return (
    <input
      ref={inputRef}
      aria-label={ariaLabel}
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      className={className ?? 'w-16 rounded border border-white/20 bg-[#1a1a1a] px-1 py-0.5 text-[10px] text-white outline-none'}
    />
  );
}
