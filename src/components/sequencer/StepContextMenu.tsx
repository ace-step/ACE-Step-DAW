import { useEffect, useRef } from 'react';
import { FL } from './SequencerConstants';

const PROBABILITY_PRESETS = [100, 75, 50, 25, 10] as const;

interface StepContextMenuProps {
  x: number;
  y: number;
  currentProbability: number;
  currentVelocity: number;
  stepParams: Record<string, number>;
  onSetProbability: (value: number) => void;
  onSetVelocity: (value: number) => void;
  onClose: () => void;
}

export function StepContextMenu({
  x,
  y,
  currentProbability,
  currentVelocity,
  stepParams,
  onSetProbability,
  onSetVelocity,
  onClose,
}: StepContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', handler);
    window.addEventListener('keydown', escHandler);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', escHandler);
    };
  }, [onClose]);

  // Clamp position so menu stays in viewport
  const menuW = 160;
  const menuH = 200;
  const left = Math.min(x, window.innerWidth - menuW - 8);
  const top = Math.min(y, window.innerHeight - menuH - 8);

  const probPct = Math.round((currentProbability ?? 1) * 100);
  const velPct = Math.round(currentVelocity * 127);
  const paramCount = Object.keys(stepParams ?? {}).length;

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left,
        top,
        width: menuW,
        background: '#1e1e1e',
        border: `1px solid ${FL.borderLight}`,
        borderRadius: 6,
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        padding: 4,
        zIndex: 9999,
        fontSize: 11,
        color: FL.text,
      }}
    >
      {/* Probability section */}
      <div style={{ padding: '4px 8px', fontSize: 9, color: FL.textDim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Probability
      </div>
      <div style={{ display: 'flex', gap: 2, padding: '0 4px 4px' }}>
        {PROBABILITY_PRESETS.map((pct) => (
          <button
            key={pct}
            onClick={() => {
              onSetProbability(pct / 100);
              onClose();
            }}
            style={{
              flex: 1,
              padding: '3px 0',
              background: probPct === pct ? FL.accent : '#333',
              border: 'none',
              borderRadius: 3,
              color: probPct === pct ? '#fff' : FL.text,
              fontSize: 9,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {pct}%
          </button>
        ))}
      </div>

      {/* Probability slider */}
      <div style={{ padding: '2px 8px 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={probPct}
          onChange={(e) => onSetProbability(Number(e.target.value) / 100)}
          style={{ flex: 1, accentColor: FL.accent, height: 12 }}
        />
        <span style={{ fontSize: 9, color: FL.textBright, fontWeight: 600, minWidth: 28, textAlign: 'right' }}>
          {probPct}%
        </span>
      </div>

      <div style={{ height: 1, background: FL.border, margin: '2px 4px' }} />

      {/* Velocity display */}
      <div style={{ padding: '4px 8px', fontSize: 9, color: FL.textDim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Velocity
      </div>
      <div style={{ padding: '2px 8px 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="range"
          min={1}
          max={127}
          step={1}
          value={velPct}
          onChange={(e) => onSetVelocity(Number(e.target.value) / 127)}
          style={{ flex: 1, accentColor: FL.accent, height: 12 }}
        />
        <span style={{ fontSize: 9, color: FL.textBright, fontWeight: 600, minWidth: 24, textAlign: 'right' }}>
          {velPct}
        </span>
      </div>

      {/* Param locks info */}
      {paramCount > 0 && (
        <>
          <div style={{ height: 1, background: FL.border, margin: '2px 4px' }} />
          <div style={{ padding: '4px 8px 6px', fontSize: 9, color: FL.textDim }}>
            {paramCount} param lock{paramCount > 1 ? 's' : ''} set
          </div>
        </>
      )}
    </div>
  );
}
