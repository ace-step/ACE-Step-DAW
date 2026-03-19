import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { drumEngine, DRUM_PAD_NAMES, BEAT_PAD_KEYS } from '../../engine/DrumEngine';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import type { DrumKitName } from '../../types/project';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { cacheUserSample } from '../../services/sampleManager';

const PAD_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#f59e0b', '#10b981', '#14b8a6', '#0ea5e9',
  '#6366f1', '#d946ef', '#a855f7', '#78716c',
];

const KIT_OPTIONS: { value: DrumKitName; label: string }[] = [
  { value: '808', label: '808' },
  { value: 'acoustic', label: 'Acoustic' },
  { value: 'electronic', label: 'Electronic' },
  { value: 'lofi', label: 'Lo-Fi' },
];

export function DrumMachineEditor() {
  const trackId = useUIStore((s) => s.openDrumMachineTrackId);
  const editorHeight = useUIStore((s) => s.drumMachineEditorHeight);
  const setEditorHeight = useUIStore((s) => s.setDrumMachineEditorHeight);
  const closeEditor = useUIStore((s) => s.setOpenDrumMachineTrackId);
  const setHistoryFocusScope = useUIStore((s) => s.setHistoryFocusScope);

  const project = useProjectStore((s) => s.project);
  const track = useMemo(() => project?.tracks.find((t) => t.id === trackId) ?? null, [project, trackId]);
  const setDrumPadSample = useProjectStore((s) => s.setDrumPadSample);
  const setDrumPadVolume = useProjectStore((s) => s.setDrumPadVolume);
  const setDrumMachineKit = useProjectStore((s) => s.setDrumMachineKit);

  const [activePads, setActivePads] = useState<Set<number>>(new Set());
  const [selectedPad, setSelectedPad] = useState<number | null>(null);
  const timeoutRefs = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const padRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const resizeRef = useRef<HTMLDivElement>(null);

  const drumMachine = track?.drumMachine;
  const pads = drumMachine?.pads ?? [];

  // Ensure drum engine for this track
  useEffect(() => {
    if (track && trackId) {
      drumEngine.ensureTrack(trackId, track.drumKit ?? '808');
    }
  }, [trackId, track?.drumKit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Velocity-sensitive pad trigger: compute velocity from vertical position within pad
  const triggerPad = useCallback(
    (padIndex: number, velocity?: number) => {
      if (!trackId) return;
      const kit = track?.drumKit ?? '808';
      const padVol = pads[padIndex]?.volume ?? 0.8;
      const vel = Math.round((velocity ?? 0.8) * padVol * 127);
      drumEngine.triggerPad(trackId, padIndex, vel, kit);

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
    [trackId, track?.drumKit, pads],
  );

  // Mouse-down handler: compute velocity from Y position within pad
  const handlePadMouseDown = useCallback(
    (padIndex: number, e: React.MouseEvent<HTMLButtonElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      // Top of pad = max velocity, bottom = min velocity (MPC-style)
      const yRatio = 1 - (e.clientY - rect.top) / rect.height;
      const velocity = 0.3 + yRatio * 0.7; // range 0.3 – 1.0
      triggerPad(padIndex, velocity);
      setSelectedPad(padIndex);
    },
    [triggerPad],
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

  // Resize handle
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startH = editorHeight;
      const onMove = (ev: MouseEvent) => {
        setEditorHeight(startH - (ev.clientY - startY));
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [editorHeight, setEditorHeight],
  );

  if (!trackId || !track || track.trackType !== 'drumMachine') return null;

  const selectedPadData = selectedPad !== null ? pads[selectedPad] : null;

  return (
    <div
      className="flex flex-col border-t border-white/10 bg-[#1a1a2e]"
      style={{ height: editorHeight }}
      data-track-id={trackId}
      onMouseDownCapture={() => setHistoryFocusScope('track')}
      onFocusCapture={() => setHistoryFocusScope('track')}
    >
      {/* Resize handle */}
      <div
        ref={resizeRef}
        className="h-1 cursor-row-resize bg-white/5 hover:bg-white/20 transition-colors"
        onMouseDown={handleResizeStart}
      />

      {/* Header bar */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-white/10 bg-[#16162a]">
        <span className="text-xs font-semibold text-white/80 uppercase tracking-wider">
          Drum Machine
        </span>
        <span className="text-[10px] text-white/40 truncate max-w-[120px]">
          {track.displayName}
        </span>

        {/* Kit selector */}
        <select
          className="ml-auto text-[10px] bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-white/70 focus:outline-none"
          value={drumMachine?.kitName ?? '808'}
          onChange={(e) => setDrumMachineKit(trackId, e.target.value as DrumKitName)}
        >
          {KIT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <button
          className="text-white/40 hover:text-white/80 text-sm px-1"
          onClick={() => closeEditor(null)}
          title="Close"
        >
          &times;
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Pad grid - 4x4 */}
        <div className="flex-1 p-3 flex items-center justify-center">
          <div
            className="grid grid-cols-4 gap-2 w-full max-w-[480px] aspect-square"
            style={{ maxHeight: editorHeight - 60 }}
          >
            {Array.from({ length: 16 }, (_, i) => {
              const pad = pads[i];
              const isActive = activePads.has(i);
              const isSelected = selectedPad === i;
              const color = pad?.color ?? PAD_COLORS[i];
              const keyLabel = BEAT_PAD_KEYS[i]?.toUpperCase() ?? '';
              const name = pad?.name ?? DRUM_PAD_NAMES[i] ?? `Pad ${i + 1}`;

              return (
                <button
                  key={i}
                  ref={(el) => { if (el) padRefs.current.set(i, el); }}
                  className={`relative rounded-lg border-2 transition-all duration-75 flex flex-col items-center justify-center select-none ${
                    isActive
                      ? 'scale-95 brightness-150'
                      : isSelected
                        ? 'ring-2 ring-white/40'
                        : 'hover:brightness-125 active:scale-95'
                  }`}
                  style={{
                    backgroundColor: isActive ? color : `${color}30`,
                    borderColor: isActive ? color : isSelected ? `${color}80` : `${color}50`,
                    boxShadow: isActive ? `0 0 16px ${color}80` : 'none',
                  }}
                  onMouseDown={(e) => handlePadMouseDown(i, e)}
                  data-pad-index={i}
                >
                  <span className="text-[10px] text-white/90 font-semibold leading-tight text-center px-1 truncate w-full">
                    {name}
                  </span>
                  <span className="text-[8px] text-white/30 absolute bottom-1 right-1.5 font-mono">
                    {keyLabel}
                  </span>
                  {pad && (
                    <span className="text-[7px] text-white/20 absolute top-1 right-1.5">
                      {Math.round(pad.volume * 100)}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Pad detail panel */}
        <div className="w-52 border-l border-white/10 bg-[#12122a] p-3 flex flex-col gap-3 overflow-y-auto">
          {selectedPadData ? (
            <>
              <div className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">
                Pad {(selectedPad ?? 0) + 1}
              </div>
              <div className="text-xs text-white/80 font-medium truncate">
                {selectedPadData.name}
              </div>

              {/* Volume */}
              <label className="flex flex-col gap-1">
                <span className="text-[9px] text-white/40 uppercase">Volume</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={selectedPadData.volume}
                  onChange={(e) => setDrumPadVolume(trackId, selectedPad!, parseFloat(e.target.value))}
                  className="w-full accent-blue-500 h-1"
                />
                <span className="text-[9px] text-white/30 text-right">
                  {Math.round(selectedPadData.volume * 100)}%
                </span>
              </label>

              {/* Sample key display */}
              <div className="flex flex-col gap-1">
                <span className="text-[9px] text-white/40 uppercase">Sample</span>
                <span className="text-[10px] text-white/60 bg-white/5 rounded px-2 py-1 truncate">
                  {selectedPadData.sampleKey}
                </span>
              </div>

              {/* Load custom sample */}
              <label className="flex items-center gap-1 cursor-pointer text-[10px] text-blue-400 hover:text-blue-300">
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !file.type.startsWith('audio/')) return;
                    
                    
                    const engine = getAudioEngine();
                    await engine.resume();
                    const arrayBuffer = await file.arrayBuffer();
                    const audioBuffer = await engine.ctx.decodeAudioData(arrayBuffer);
                    const key = `user-sample-${Date.now()}-${file.name}`;
                    cacheUserSample(key, audioBuffer);
                    setDrumPadSample(trackId, selectedPad!, key);
                  }}
                />
                Load Sample...
              </label>
            </>
          ) : (
            <div className="text-[10px] text-white/30 mt-4 text-center">
              Click a pad to see its details
            </div>
          )}

          {/* Velocity hint */}
          <div className="mt-auto text-[8px] text-white/20 leading-relaxed">
            Velocity: click higher on pad for louder hits.
            <br />
            Keys: 1-4, Q-R, A-F, Z-V
          </div>
        </div>
      </div>
    </div>
  );
}
