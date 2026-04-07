import { useCallback, useEffect, useRef, useState } from 'react';
import { drumEngine, DRUM_PAD_NAMES, BEAT_PAD_KEYS } from '../../engine/DrumEngine';
import { useProjectStore } from '../../store/projectStore';

const PAD_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#f59e0b', '#10b981', '#14b8a6', '#0ea5e9',
  '#6366f1', '#d946ef', '#a855f7', '#78716c',
];

interface BeatPadProps {
  trackId: string;
}

export function BeatPad({ trackId }: BeatPadProps) {
  const [activePads, setActivePads] = useState<Set<number>>(new Set());
  const timeoutRefs = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const track = useProjectStore((s) => s.project?.tracks.find((t) => t.id === trackId));

  const [engineReady, setEngineReady] = useState(false);

  // Effect 1: Ensure drum engine is initialized, sync pads, then mark ready
  useEffect(() => {
    setEngineReady(false);
    if (!track) return;
    let cancelled = false;
    drumEngine.ensureTrack(trackId, track.drumKit ?? '808').then(() => {
      if (cancelled) return;
      const pads = track.drumMachine?.pads;
      if (pads) drumEngine.syncTrackPadParams(trackId, pads);
      setEngineReady(true);
    });
    return () => { cancelled = true; };
  }, [trackId, track?.drumKit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Effect 2: Sync pad params when pads change OR engine becomes ready
  useEffect(() => {
    if (!engineReady) return;
    const pads = track?.drumMachine?.pads;
    if (pads) drumEngine.syncTrackPadParams(trackId, pads);
  }, [trackId, track?.drumMachine?.pads, engineReady]);

  const triggerPad = useCallback(
    (padIndex: number) => {
      const kit = track?.drumKit ?? '808';
      // Pass pads when engine not yet ready so params are synced at trigger time
      const padData = engineReady ? undefined : track?.drumMachine?.pads;
      drumEngine.triggerPad(trackId, padIndex, 100, kit, padData);

      // Visual feedback
      setActivePads((prev) => new Set(prev).add(padIndex));
      const existing = timeoutRefs.current.get(padIndex);
      if (existing) clearTimeout(existing);
      const timeout = setTimeout(() => {
        setActivePads((prev) => {
          const next = new Set(prev);
          next.delete(padIndex);
          return next;
        });
        timeoutRefs.current.delete(padIndex);
      }, 150);
      timeoutRefs.current.set(padIndex, timeout);
    },
    [trackId, track?.drumKit, engineReady, track?.drumMachine?.pads],
  );

  // Keyboard mapping
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const key = e.key.toLowerCase();
      const padIndex = BEAT_PAD_KEYS.indexOf(key);
      if (padIndex !== -1) {
        e.preventDefault();
        triggerPad(padIndex);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [triggerPad]);

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      for (const t of timeoutRefs.current.values()) clearTimeout(t);
    };
  }, []);

  return (
    <div className="h-full flex flex-col p-2 gap-1">
      <div className="text-[10px] text-white/30 text-center uppercase tracking-wider mb-1">Beat Pads</div>
      <div className="grid grid-cols-4 gap-1 flex-1">
        {DRUM_PAD_NAMES.slice(0, 16).map((name, i) => {
          const isActive = activePads.has(i);
          const color = PAD_COLORS[i];
          const keyLabel = BEAT_PAD_KEYS[i]?.toUpperCase() ?? '';

          return (
            <button
              key={i}
              className={`relative rounded-md border transition-all duration-75 flex flex-col items-center justify-center ${
                isActive ? 'scale-95 brightness-150' : 'hover:brightness-125 active:scale-95'
              }`}
              style={{
                backgroundColor: isActive ? color : `${color}40`,
                borderColor: isActive ? color : `${color}60`,
                boxShadow: isActive ? `0 0 12px ${color}80` : 'none',
              }}
              onMouseDown={() => triggerPad(i)}
            >
              <span className="text-[8px] text-white/80 font-medium leading-tight text-center px-0.5 truncate w-full">
                {name}
              </span>
              <span className="text-[7px] text-white/30 absolute bottom-0.5 right-1">
                {keyLabel}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
