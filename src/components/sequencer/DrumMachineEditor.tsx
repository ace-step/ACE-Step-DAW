import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { drumEngine, DRUM_PAD_NAMES, BEAT_PAD_KEYS } from '../../engine/DrumEngine';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import type { DrumKitName, DrumPadFilterType } from '../../types/project';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { cacheUserSample } from '../../services/sampleManager';
import { Knob } from '../ui/Knob';

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

const FILTER_OPTIONS: { value: DrumPadFilterType; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'lowpass', label: 'LP' },
  { value: 'highpass', label: 'HP' },
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
  const setDrumPadPan = useProjectStore((s) => s.setDrumPadPan);
  const setDrumPadTune = useProjectStore((s) => s.setDrumPadTune);
  const setDrumPadDecay = useProjectStore((s) => s.setDrumPadDecay);
  const setDrumPadFilter = useProjectStore((s) => s.setDrumPadFilter);
  const setDrumPadDrive = useProjectStore((s) => s.setDrumPadDrive);
  const setDrumPadSend = useProjectStore((s) => s.setDrumPadSend);
  const setDrumMachineKit = useProjectStore((s) => s.setDrumMachineKit);

  const [activePads, setActivePads] = useState<Set<number>>(new Set());
  const [selectedPad, setSelectedPad] = useState<number | null>(null);
  const timeoutRefs = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const padRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const resizeRef = useRef<HTMLDivElement>(null);

  const drumMachine = track?.drumMachine;
  const pads = drumMachine?.pads ?? [];

  // Track whether the drum engine has been initialized for this track.
  // useState (not ref) so Effect 2 re-runs when readiness changes.
  const [engineReady, setEngineReady] = useState(false);

  // Effect 1: Ensure drum engine is initialized, sync pads, then mark ready.
  // Pads are synced inside the promise so params are guaranteed applied
  // before any user-triggered hits.
  useEffect(() => {
    setEngineReady(false);
    if (!track || !trackId) return;
    let cancelled = false;
    drumEngine.ensureTrack(trackId, track.drumKit ?? '808').then(() => {
      if (cancelled) return;
      if (pads.length) drumEngine.syncTrackPadParams(trackId, pads);
      setEngineReady(true);
    });
    return () => { cancelled = true; };
  }, [trackId, track?.drumKit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Effect 2: Sync pad params when pads change OR engine becomes ready
  useEffect(() => {
    if (!trackId || !pads.length || !engineReady) return;
    drumEngine.syncTrackPadParams(trackId, pads);
  }, [trackId, pads, engineReady]);

  // Velocity-sensitive pad trigger: compute velocity from vertical position within pad
  const triggerPad = useCallback(
    (padIndex: number, velocity?: number) => {
      if (!trackId) return;
      const kit = track?.drumKit ?? '808';
      const vel = Math.round((velocity ?? 0.8) * 127);
      // Pass pads when engine not yet ready so params are synced at trigger time
      drumEngine.triggerPad(trackId, padIndex, vel, kit, engineReady ? undefined : pads);

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
    [trackId, track?.drumKit, engineReady, pads],
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

  // Keyboard mapping — only process pad keys when drum machine has keyboard focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const scope = useUIStore.getState().keyboardContext.scope;
      if (scope !== 'drumMachine') return;
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

  // Set keyboard context to drumMachine when clicking inside the editor
  const handleEditorFocus = useCallback(() => {
    if (trackId) {
      useUIStore.getState().setKeyboardContext('drumMachine', trackId);
    }
  }, [trackId]);

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
      onMouseDownCapture={() => { setHistoryFocusScope('track'); handleEditorFocus(); }}
      onFocusCapture={() => { setHistoryFocusScope('track'); handleEditorFocus(); }}
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
        <div className="w-64 border-l border-white/10 bg-[#12122a] p-3 flex flex-col gap-2 overflow-y-auto">
          {selectedPadData && selectedPad !== null ? (
            <>
              <div className="flex items-center justify-between">
                <div className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">
                  Pad {selectedPad + 1}
                </div>
                <div className="text-xs text-white/80 font-medium truncate max-w-[120px]">
                  {selectedPadData.name}
                </div>
              </div>

              {/* ── Row 1: Volume + Pan ── */}
              <div className="flex items-center gap-3 py-1">
                <Knob
                  value={selectedPadData.volume}
                  min={0} max={1} defaultValue={0.8} step={0.01}
                  onChange={(v) => setDrumPadVolume(trackId, selectedPad, v)}
                  label="Vol" variant="sm"
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                />
                <Knob
                  value={selectedPadData.pan}
                  min={-1} max={1} defaultValue={0} step={0.01}
                  onChange={(v) => setDrumPadPan(trackId, selectedPad, v)}
                  label="Pan" variant="sm"
                  formatValue={(v) => v === 0 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`}
                />
              </div>

              {/* ── Row 2: Tune + Decay ── */}
              <div className="flex items-center gap-3 py-1">
                <Knob
                  value={selectedPadData.tune}
                  min={-24} max={24} defaultValue={0} step={1}
                  onChange={(v) => setDrumPadTune(trackId, selectedPad, v)}
                  label="Tune" variant="sm" unit="st"
                  formatValue={(v) => `${v > 0 ? '+' : ''}${v}`}
                />
                <Knob
                  value={selectedPadData.decay}
                  min={0} max={1} defaultValue={1} step={0.01}
                  onChange={(v) => setDrumPadDecay(trackId, selectedPad, v)}
                  label="Decay" variant="sm"
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                />
              </div>

              {/* ── Filter section ── */}
              <div className="flex flex-col gap-1 py-1">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-white/40 uppercase w-8">Filter</span>
                  <select
                    className="text-[10px] bg-white/5 border border-white/10 rounded px-1 py-0.5 text-white/70 focus:outline-none flex-1"
                    value={selectedPadData.filter.type}
                    onChange={(e) => setDrumPadFilter(trackId, selectedPad, { type: e.target.value as DrumPadFilterType })}
                  >
                    {FILTER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                {selectedPadData.filter.type !== 'off' && (
                  <Knob
                    value={selectedPadData.filter.cutoff}
                    min={20} max={20000} defaultValue={20000} step={10}
                    onChange={(v) => setDrumPadFilter(trackId, selectedPad, { cutoff: v })}
                    label="Cutoff" variant="sm" unit="Hz"
                    formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`}
                  />
                )}
              </div>

              {/* ── Drive ── */}
              <div className="py-1">
                <Knob
                  value={selectedPadData.drive}
                  min={0} max={1} defaultValue={0} step={0.01}
                  onChange={(v) => setDrumPadDrive(trackId, selectedPad, v)}
                  label="Drive" variant="sm"
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                />
              </div>

              {/* ── Sends (disabled until return track routing is wired) ── */}
              <div className="flex items-center gap-3 py-1 opacity-40" title="Sends will be enabled when return track routing is implemented">
                <Knob
                  value={selectedPadData.send.reverb}
                  min={0} max={1} defaultValue={0} step={0.01}
                  onChange={(v) => setDrumPadSend(trackId, selectedPad, { reverb: v })}
                  label="Reverb" variant="sm" color="#22c55e" disabled
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                />
                <Knob
                  value={selectedPadData.send.delay}
                  min={0} max={1} defaultValue={0} step={0.01}
                  onChange={(v) => setDrumPadSend(trackId, selectedPad, { delay: v })}
                  label="Delay" variant="sm" color="#f59e0b" disabled
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                />
              </div>

              {/* ── Sample key display ── */}
              <div className="flex flex-col gap-1 pt-1 border-t border-white/5">
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
                    setDrumPadSample(trackId, selectedPad, key);
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
            Keys: Z-V, A-F, Q-R, 1-4
          </div>
        </div>
      </div>
    </div>
  );
}
