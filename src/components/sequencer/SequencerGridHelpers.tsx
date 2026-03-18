/**
 * SequencerGridHelpers.tsx — VelocityLane and SamplePickerDropdown for SequencerGrid.
 * Extracted from SequencerGrid.tsx to keep it under 600 lines.
 */
import { useRef, useCallback, useState, useEffect } from 'react';
import type { Track } from '../../types/project';
import { DEFAULT_DRUM_KIT } from '../../constants/tracks';

const FL = {
  bg: '#2a2a2a',
  rowBg: '#303030',
  rowBgAlt: '#2d2d2d',
  stepOff: '#3c3c3c',
  beatBg: '#353535',
  border: '#222222',
  borderLight: '#444444',
  barBorder: '#555555',
  text: '#c0c0c0',
  textDim: '#808080',
  accent: '#5a9a3c',
};

interface VelocityLaneProps {
  track: Track;
  rowId: string;
  pattern: NonNullable<Track['sequencerPattern']>;
  stepW: number;
  patternWidthPx: number;
  tileCount: number;
  totalTimelineWidth: number;
  currentStep: number;
  isPlaying: boolean;
  onVelocityChange: (stepIdx: number, velocity: number) => void;
}

export function VelocityLane({
  rowId, pattern, stepW, patternWidthPx, tileCount, totalTimelineWidth,
  currentStep, isPlaying, onVelocityChange,
}: VelocityLaneProps) {
  const row = pattern.rows.find((r) => r.id === rowId);
  if (!row) return null;
  const stepsPerBeat = pattern.stepsPerBar / 4;
  const VELOCITY_LANE_H = 44;
  const ROW_LABEL_W = 90;

  return (
    <div className="flex shrink-0" style={{ height: VELOCITY_LANE_H, borderTop: `1px solid ${FL.border}`, background: '#252525' }}>
      <div
        className="shrink-0 flex items-center px-2 sticky left-0 z-10"
        style={{ width: ROW_LABEL_W, fontSize: 9, color: FL.textDim, fontWeight: 500, background: '#252525' }}
      >
        VEL — {row.name}
      </div>
      <div className="flex items-end" style={{ width: totalTimelineWidth - ROW_LABEL_W }}>
        {Array.from({ length: tileCount }).map((_, tileIdx) => (
          <div key={tileIdx} className="flex items-end shrink-0" style={{ width: patternWidthPx }}>
            {row.steps.map((step, idx) => {
              const isCurrent = idx === currentStep && isPlaying;
              const isBeatStart = idx % stepsPerBeat === 0;
              return (
                <div
                  key={idx}
                  className="shrink-0 flex items-end justify-center cursor-ns-resize"
                  style={{
                    width: stepW, height: VELOCITY_LANE_H,
                    borderLeft: isBeatStart ? `1px solid #333` : undefined,
                    background: isCurrent ? 'rgba(255,255,255,0.03)' : undefined,
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const update = (ev: MouseEvent) => {
                      const pct = 1 - Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
                      onVelocityChange(idx, Math.max(0.05, pct));
                    };
                    update(e.nativeEvent);
                    const onUp = () => {
                      window.removeEventListener('mousemove', update);
                      window.removeEventListener('mouseup', onUp);
                    };
                    window.addEventListener('mousemove', update);
                    window.addEventListener('mouseup', onUp);
                  }}
                >
                  {step.active && (
                    <div
                      style={{
                        width: Math.max(4, stepW * 0.5),
                        height: `${step.velocity * 100}%`,
                        background: `linear-gradient(to top, ${row.color}, ${row.color}cc)`,
                        borderRadius: '2px 2px 0 0',
                        opacity: 0.85,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Sample Picker Dropdown ─────────────────────────────────────────── */

interface SamplePickerDropdownProps {
  currentKey: string;
  onSelect: (key: string, name: string) => void;
  onClose: () => void;
  onPreview: (key: string) => void;
}

export function SamplePickerDropdown({ currentKey, onSelect, onClose, onPreview }: SamplePickerDropdownProps) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="absolute left-0 z-50 mt-1 py-1"
        style={{
          background: FL.bg,
          border: `1px solid ${FL.borderLight}`,
          borderRadius: 4,
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          width: 170,
        }}
      >
        <div style={{ padding: '4px 8px', fontSize: 9, color: FL.textDim, fontWeight: 600, textTransform: 'uppercase' }}>
          Built-in Samples
        </div>
        {DEFAULT_DRUM_KIT.map((kit) => (
          <button
            key={kit.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, width: '100%',
              padding: '3px 8px', fontSize: 10, border: 'none', cursor: 'pointer',
              background: 'transparent', textAlign: 'left',
              color: currentKey === kit.id ? FL.accent : FL.text,
            }}
            onClick={() => onSelect(kit.id, kit.name)}
            onMouseEnter={() => onPreview(kit.id)}
          >
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: kit.color }} />
            <span>{kit.name}</span>
            {currentKey === kit.id && <span style={{ marginLeft: 'auto', color: FL.accent }}>✓</span>}
          </button>
        ))}
      </div>
    </>
  );
}
