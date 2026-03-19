import { useState, useRef, useEffect, useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import type { TrackHeightPreset } from '../../constants/trackHeight';

const PRESETS: { label: string; value: TrackHeightPreset }[] = [
  { label: 'Small', value: 'small' },
  { label: 'Medium', value: 'medium' },
  { label: 'Large', value: 'large' },
  { label: 'Auto', value: 'auto' },
];

export function TrackHeightPresetSelector() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const setAllTracksHeightPreset = useProjectStore((s) => s.setAllTracksHeightPreset);

  const handleSelect = useCallback(
    (preset: TrackHeightPreset) => {
      setAllTracksHeightPreset(preset);
      setOpen(false);
    },
    [setAllTracksHeightPreset],
  );

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        data-testid="track-height-preset-btn"
        onClick={() => setOpen((v) => !v)}
        title="Track height presets"
        className="flex items-center justify-center w-5 h-5 text-zinc-500 hover:text-zinc-200 hover:bg-daw-surface-2 rounded transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <line x1="1" y1="3" x2="11" y2="3" />
          <line x1="1" y1="6" x2="11" y2="6" />
          <line x1="1" y1="9" x2="11" y2="9" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-[#2a2a2a] border border-[#444] rounded shadow-lg z-50 min-w-[90px] py-0.5">
          {PRESETS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => handleSelect(value)}
              className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-daw-accent hover:text-white transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
