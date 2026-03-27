import { useCallback, useEffect, useMemo, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useTransportStore } from '../../store/transportStore';
import { useUIStore } from '../../store/uiStore';
import { useTransport } from '../../hooks/useTransport';
import { getSessionSlotProgress } from '../../utils/sessionProgress';
import { getSessionClips } from '../../utils/sessionClips';
import { ContextMenuWrapper, ContextMenuSeparator, ContextMenuItem } from '../ui/ContextMenu';
import { ColorSwatchPalette } from '../ui/ColorSwatchPalette';
import type { Clip, Track, SessionLaunchQuantization, SessionClipSlot, SessionPendingLaunch, SessionScene } from '../../types/project';

const SESSION_QUANTIZATION_OPTIONS: SessionLaunchQuantization[] = [
  'none', '1/32', '1/16', '1/8', '1/4', '1/2', '1 bar', '2 bars', '4 bars', '8 bars',
];

const SLOT_QUANTIZATION_OPTIONS: Array<'global' | SessionLaunchQuantization> = [
  'global', ...SESSION_QUANTIZATION_OPTIONS,
];

function getClipLabel(clip: Clip, index: number): string {
  if (clip.prompt.trim()) return clip.prompt.trim();
  if ((clip.midiData?.notes.length ?? 0) > 0) return `MIDI ${index + 1}`;
  return `Clip ${index + 1}`;
}

/** Check if a clip slot has a matching pending launch (clip-level or scene-level). */
function isClipQueued(
  pendingLaunches: SessionPendingLaunch[],
  trackId: string,
  clipId: string,
  sceneId?: string,
): boolean {
  return pendingLaunches.some((launch) => {
    if (launch.type === 'clip') return launch.trackId === trackId && launch.clipId === clipId;
    // Scene launches only queue clips belonging to the launched scene
    if (launch.type === 'scene') return sceneId != null && launch.sceneId === sceneId;
    return false;
  });
}

const PROGRESS_RING_CIRCUMFERENCE = 2 * Math.PI * 10; // r=10

interface SlotColorMenuState {
  x: number;
  y: number;
  slotId: string;
  currentColor: string | null;
}


export function SessionView() {
  const project = useProjectStore((s) => s.project);
  const setSessionLaunchQuantization = useProjectStore((s) => s.setSessionLaunchQuantization);
  const setSessionSlotQuantization = useProjectStore((s) => s.setSessionSlotQuantization);
  const launchedSessionClips = useTransportStore((s) => s.launchedSessionClips);
  const currentTime = useTransportStore((s) => s.currentTime);
  const sessionArrangementRecording = useTransportStore((s) => s.sessionArrangementRecording);
  const setMainView = useUIStore((s) => s.setMainView);
  const setSessionSlotColor = useProjectStore((s) => s.setSessionSlotColor);
  const selectedSessionSlot = useUIStore((s) => s.selectedSessionSlot);
  const setSelectedSessionSlot = useUIStore((s) => s.setSelectedSessionSlot);
  const setKeyboardContext = useUIStore((s) => s.setKeyboardContext);
  const {
    launchSessionClip,
    stopSessionTrack,
    stopAllSessionClips,
    launchSessionScene,
    toggleSessionArrangementRecording,
  } = useTransport();

  const [colorMenu, setColorMenu] = useState<SlotColorMenuState | null>(null);

  const handleCloseColorMenu = useCallback(() => setColorMenu(null), []);

  const handleAssignColor = useCallback((color: string) => {
    if (colorMenu) {
      setSessionSlotColor(colorMenu.slotId, color);
      setColorMenu(null);
    }
  }, [colorMenu, setSessionSlotColor]);

  const handleResetColor = useCallback(() => {
    if (colorMenu) {
      setSessionSlotColor(colorMenu.slotId, null);
      setColorMenu(null);
    }
  }, [colorMenu, setSessionSlotColor]);

  // Set keyboard context to 'session' on mount, restore previous on unmount
  useEffect(() => {
    const previousScope = useUIStore.getState().keyboardContext.scope;
    const previousTrackId = useUIStore.getState().keyboardContext.trackId;
    setKeyboardContext('session');
    return () => {
      setKeyboardContext(previousScope, previousTrackId);
    };
  }, [setKeyboardContext]);

  if (!project) {
    return <div className="flex-1 min-w-0 bg-[#202020]" />;
  }

  const tracks = [...project.tracks].sort((a, b) => a.order - b.order);
  const sceneCount = Math.max(4, ...tracks.map((track) => getSessionClips(track).length));
  const sessionQuantization = project.session?.quantization ?? '1 bar';
  const sessionSlots = project.session?.slots ?? [];
  const pendingLaunches = project.session?.pendingLaunches ?? [];
  const scenes = project.session?.scenes ?? [];

  return (
    <div className="flex-1 min-w-0 bg-[radial-gradient(circle_at_top,#313131_0%,#202020_55%,#171717_100%)] border-l border-[#111] overflow-auto">
      <div className="sticky top-0 z-20 border-b border-[#303030] bg-[#1c1c1c]/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">Performance Grid</div>
            <div className="text-sm font-semibold text-zinc-100">Session View clip launcher</div>
            <div className="text-[11px] text-zinc-400">Launch clips by track or scene, then record the performance into Arrangement.</div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-zinc-400">
              <span>Q:</span>
              <select
                value={sessionQuantization}
                onChange={(e) => setSessionLaunchQuantization(e.target.value as SessionLaunchQuantization)}
                className="rounded-md bg-[#2a2a2a] border border-[#444] px-2 py-1 text-[11px] text-zinc-200 outline-none focus:border-daw-accent"
                aria-label="Session launch quantization"
              >
                {SESSION_QUANTIZATION_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </label>
            <button
              onClick={() => void toggleSessionArrangementRecording()}
              className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                sessionArrangementRecording
                  ? 'bg-red-600 text-white'
                  : 'bg-[#2a2a2a] text-zinc-300 hover:bg-[#343434]'
              }`}
              aria-label={sessionArrangementRecording ? 'Stop recording Session performance to Arrangement' : 'Record Session performance to Arrangement'}
            >
              {sessionArrangementRecording ? 'Stop Arrangement Record' : 'Record to Arrangement'}
            </button>
            <button
              onClick={() => void stopAllSessionClips()}
              className="px-3 py-1.5 rounded-md bg-[#2a2a2a] text-[11px] font-medium text-zinc-300 hover:bg-[#343434] transition-colors"
              aria-label="Stop all Session clips"
            >
              Stop All
            </button>
            <button
              onClick={() => setMainView('arrangement')}
              className="px-3 py-1.5 rounded-md bg-daw-accent/20 text-[11px] font-medium text-daw-accent hover:bg-daw-accent/30 transition-colors"
              aria-label="Return to Arrangement View"
            >
              Back to Arrangement
            </button>
          </div>
        </div>
      </div>

      <div className="grid min-w-[980px]" style={{ gridTemplateColumns: `220px repeat(${sceneCount}, minmax(150px, 1fr))` }}>
        <div className="sticky top-[72px] z-10 border-b border-r border-[#333] bg-[#242424] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
          Tracks
        </div>
        {Array.from({ length: sceneCount }, (_, sceneIndex) => {
          const sceneLaunches = tracks.flatMap((track) => {
            const clip = getSessionClips(track)[sceneIndex];
            return clip ? [{ trackId: track.id, clipId: clip.id }] : [];
          });

          return (
            <div key={`scene-${sceneIndex}`} className="sticky top-[72px] z-10 border-b border-r border-[#333] bg-[#242424] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">Scene</div>
                  <div className="text-sm font-semibold text-zinc-100">{sceneIndex + 1}</div>
                </div>
                <button
                  onClick={() => void launchSessionScene(sceneIndex, sceneLaunches)}
                  disabled={sceneLaunches.length === 0}
                  className="rounded-md bg-[#303030] px-2.5 py-1 text-[11px] font-medium text-zinc-200 transition-colors hover:bg-daw-accent disabled:opacity-30"
                  aria-label={`Launch scene ${sceneIndex + 1}`}
                >
                  Launch
                </button>
              </div>
            </div>
          );
        })}

        {tracks.map((track) => {
          const sessionClips = getSessionClips(track);
          const activeLaunch = launchedSessionClips[track.id];

          return (
            <FragmentRow
              key={track.id}
              track={track}
              sessionClips={sessionClips}
              sessionSlots={sessionSlots}
              sceneCount={sceneCount}
              scenes={scenes}
              activeClipId={activeLaunch?.clipId ?? null}
              activeLaunchedAt={activeLaunch?.launchedAt ?? null}
              currentTime={currentTime}
              pendingLaunches={pendingLaunches}
              selectedSceneIndex={selectedSessionSlot?.trackId === track.id ? selectedSessionSlot.sceneIndex : null}
              onLaunch={(clipId, sceneIndex) => launchSessionClip(track.id, clipId, sceneIndex)}
              onStop={() => stopSessionTrack(track.id)}
              onSlotQuantizationChange={(slotId, q) => setSessionSlotQuantization(slotId, q)}
              onContextMenuSlot={setColorMenu}
              onSlotClick={(sceneIndex) => setSelectedSessionSlot({ trackId: track.id, sceneIndex })}
            />
          );
        })}
      </div>

      {colorMenu && (
        <ContextMenuWrapper
          x={colorMenu.x}
          y={colorMenu.y}
          onClose={handleCloseColorMenu}
          testId="session-slot-color-menu"
          minWidth={180}
        >
          <div className="px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-zinc-400">
            Slot Color
          </div>
          <ContextMenuSeparator />
          <ColorSwatchPalette
            hasCustomColor={colorMenu.currentColor != null}
            onAssignColor={handleAssignColor}
            onResetColor={handleResetColor}
            labelPrefix="Assign slot color"
            testId="session-color-swatch-palette"
          />
          <ContextMenuSeparator />
          <ContextMenuItem
            label="Reset Color"
            onClick={handleResetColor}
          />
        </ContextMenuWrapper>
      )}
    </div>
  );
}

interface StopButtonContextMenuState {
  x: number;
  y: number;
  slotId: string;
  hasStopButton: boolean;
}

function FragmentRow({
  track,
  sessionClips,
  sessionSlots,
  sceneCount,
  scenes,
  activeClipId,
  activeLaunchedAt,
  currentTime,
  pendingLaunches,
  selectedSceneIndex,
  onLaunch,
  onStop,
  onSlotQuantizationChange,
  onContextMenuSlot,
  onSlotClick,
}: {
  track: Track;
  sessionClips: Clip[];
  sessionSlots: SessionClipSlot[];
  sceneCount: number;
  scenes: SessionScene[];
  activeClipId: string | null;
  activeLaunchedAt: number | null;
  currentTime: number;
  pendingLaunches: SessionPendingLaunch[];
  selectedSceneIndex: number | null;
  onLaunch: (clipId: string, sceneIndex: number) => void | Promise<void>;
  onStop: () => void | Promise<void>;
  onSlotQuantizationChange: (slotId: string, quantization: 'global' | SessionLaunchQuantization) => void;
  onContextMenuSlot: (state: SlotColorMenuState) => void;
  onSlotClick: (sceneIndex: number) => void;
}) {
  const trackSlots = sessionSlots.filter((s) => s.trackId === track.id);

  const [contextMenu, setContextMenu] = useState<StopButtonContextMenuState | null>(null);
  const setSessionSlotStopButton = useProjectStore((s) => s.setSessionSlotStopButton);

  // Build a sceneIndex -> slot lookup map to avoid repeated .find() in the render loop
  const slotBySceneIndex = useMemo(() => {
    const sceneIdToIndex = new Map(scenes.map((s) => [s.id, s.index]));
    const map = new Map<number, SessionClipSlot>();
    for (const slot of sessionSlots) {
      if (slot.trackId !== track.id) continue;
      const idx = sceneIdToIndex.get(slot.sceneId);
      if (idx !== undefined) map.set(idx, slot);
    }
    return map;
  }, [scenes, sessionSlots, track.id]);

  const handleEmptySlotContextMenu = useCallback((e: React.MouseEvent, sceneIndex: number) => {
    e.preventDefault();
    const slot = slotBySceneIndex.get(sceneIndex);
    if (!slot) return;
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      slotId: slot.id,
      hasStopButton: slot.hasStopButton !== false,
    });
  }, [slotBySceneIndex]);

  const handleToggleStopButton = useCallback(() => {
    if (!contextMenu) return;
    setSessionSlotStopButton(contextMenu.slotId, !contextMenu.hasStopButton);
    setContextMenu(null);
  }, [contextMenu, setSessionSlotStopButton]);

  return (
    <>
      <div className="border-r border-b border-[#2e2e2e] bg-[#212121] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-zinc-100">{track.displayName}</div>
            <div className="text-[11px] text-zinc-400">{track.trackType ?? 'stems'}</div>
          </div>
          <button
            onClick={() => void onStop()}
            className="rounded-md border border-[#444] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-zinc-400 transition-colors hover:border-red-500 hover:text-red-300"
            aria-label={`Stop Session clip on ${track.displayName}`}
          >
            Stop
          </button>
        </div>
      </div>

      {Array.from({ length: sceneCount }, (_, sceneIndex) => {
        const clip = sessionClips[sceneIndex];
        const isActive = clip?.id === activeClipId;
        // Per-slot quantization badge (from #935)
        const matchingSlot = trackSlots.find((s) => s.clipId === clip?.id);
        const slotQuantization = matchingSlot?.quantization;
        const hasOverride = slotQuantization && slotQuantization !== 'global';
        // Queued blinking & progress ring (from #936)
        const sceneId = scenes[sceneIndex]?.id;
        const isQueued = clip ? isClipQueued(pendingLaunches, track.id, clip.id, sceneId) : false;
        // Selection focus ring (from #924)
        const isSelected = selectedSceneIndex === sceneIndex;

        let progress = 0;
        let loopCount = 1;
        if (isActive && activeLaunchedAt !== null && clip) {
          const result = getSessionSlotProgress(currentTime, activeLaunchedAt, clip.duration);
          progress = result.progress;
          loopCount = result.loopCount;
        }

        // Look up the session slot for this track+scene to get the custom color and stop button state
        const slot = slotBySceneIndex.get(sceneIndex);
        const slotColor = slot?.color ?? null;
        const hasStopButton = slot ? slot.hasStopButton !== false : true;

        const handleContextMenu = (e: React.MouseEvent) => {
          if (!clip || !slot) return;
          e.preventDefault();
          onContextMenuSlot({
            x: e.clientX,
            y: e.clientY,
            slotId: slot.id,
            currentColor: slotColor,
          });
        };

        return (
          <div key={`${track.id}-${sceneIndex}`} className="border-r border-b border-[#2e2e2e] bg-[#1b1b1b] p-2">
            {clip ? (
              <div className="relative">
                <button
                  onClick={() => {
                    onSlotClick(sceneIndex);
                    void onLaunch(clip.id, sceneIndex);
                  }}
                  onContextMenu={handleContextMenu}
                  className={`relative flex h-24 w-full flex-col justify-between rounded-xl border px-3 py-2 text-left transition-all ${
                    isActive
                      ? 'border-emerald-400 shadow-[0_0_0_1px_rgba(74,222,128,0.35)]'
                      : isQueued
                        ? 'border-amber-400'
                        : 'border-[#3a3a3a] hover:border-daw-accent'
                  } ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-[#1b1b1b]' : ''}`}
                  style={{
                    ...((slotColor ?? track.color)
                      ? { backgroundColor: `${slotColor ?? track.color}33`, borderColor: isActive ? undefined : isQueued ? undefined : `${slotColor ?? track.color}88` }
                      : isActive
                        ? { backgroundColor: 'rgba(16, 185, 129, 0.2)' }
                        : isQueued
                          ? { backgroundColor: 'rgba(245, 158, 11, 0.1)' }
                          : { backgroundColor: '#262626' }),
                    ...(isQueued && !isActive ? { animation: 'session-blink 500ms ease-in-out infinite' } : {}),
                  }}
                  aria-label={`Launch ${getClipLabel(clip, sceneIndex)} on ${track.displayName} in scene ${sceneIndex + 1}`}
                  data-slot-id={slot?.id}
                  data-track-id={track.id}
                  data-scene-index={sceneIndex}
                >
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-400">
                      {clip.midiData ? 'MIDI' : clip.source === 'uploaded' ? 'Audio' : 'Generated'}
                    </div>
                    <div className="mt-1 line-clamp-2 text-sm font-medium text-zinc-100">
                      {getClipLabel(clip, sceneIndex)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span>{clip.duration.toFixed(1)}s</span>
                    {isActive ? (
                      <span className="flex items-center gap-1">
                        <svg width="24" height="24" className="shrink-0" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" fill="none" stroke="#444" strokeWidth="2" />
                          <circle
                            cx="12" cy="12" r="10"
                            fill="none"
                            stroke="#4ade80"
                            strokeWidth="2"
                            strokeDasharray={`${progress * PROGRESS_RING_CIRCUMFERENCE} ${PROGRESS_RING_CIRCUMFERENCE}`}
                            strokeLinecap="round"
                            transform="rotate(-90 12 12)"
                          />
                        </svg>
                        <span className="text-xs text-emerald-400">{loopCount}</span>
                      </span>
                    ) : (
                      <span>{isQueued ? 'QUEUED' : `Start ${clip.startTime.toFixed(1)}s`}</span>
                    )}
                  </div>
                </button>
                {hasOverride && (
                  <span
                    className="absolute top-1 right-1 rounded bg-daw-accent/80 px-1 py-0.5 text-[9px] font-semibold text-white leading-none pointer-events-none"
                    title={`Slot quantization: ${slotQuantization}`}
                  >
                    {slotQuantization}
                  </span>
                )}
                {matchingSlot && (
                  <select
                    value={slotQuantization ?? 'global'}
                    onChange={(e) => onSlotQuantizationChange(matchingSlot.id, e.target.value as 'global' | SessionLaunchQuantization)}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute bottom-1 right-1 rounded bg-[#2a2a2a]/90 border border-[#444] px-1 py-0.5 text-[9px] text-zinc-400 outline-none focus:border-daw-accent cursor-pointer"
                    aria-label={`Quantization override for ${getClipLabel(clip, sceneIndex)}`}
                  >
                    {SLOT_QUANTIZATION_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt === 'global' ? 'Global' : opt}</option>
                    ))}
                  </select>
                )}
              </div>
            ) : hasStopButton ? (
              <button
                onClick={() => {
                  onSlotClick(sceneIndex);
                  void onStop();
                }}
                onContextMenu={(e) => handleEmptySlotContextMenu(e, sceneIndex)}
                className={`flex h-24 w-full items-center justify-center rounded-xl border border-dashed border-[#343434] bg-[#202020] transition-colors hover:border-[#555] hover:bg-[#272727] ${
                  isSelected ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-[#1b1b1b]' : ''
                }`}
                aria-label={`Stop ${track.displayName} in scene ${sceneIndex + 1}`}
                data-testid={`stop-slot-${track.id}-${sceneIndex}`}
                data-track-id={track.id}
                data-scene-index={sceneIndex}
              >
                <span className="text-zinc-500 text-base leading-none" aria-hidden="true">&#9632;</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onSlotClick(sceneIndex)}
                onContextMenu={(e) => handleEmptySlotContextMenu(e, sceneIndex)}
                className={`flex h-24 w-full items-center justify-center rounded-xl border border-dashed border-[#2a2a2a] bg-[#1d1d1d] text-[11px] uppercase tracking-[0.16em] text-zinc-600 cursor-pointer ${
                  isSelected ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-[#1b1b1b]' : ''
                }`}
                data-testid={`empty-slot-${track.id}-${sceneIndex}`}
                data-track-id={track.id}
                data-scene-index={sceneIndex}
                aria-label={`Empty slot, ${track.displayName} scene ${sceneIndex + 1}`}
              >
                Empty
              </button>
            )}
          </div>
        );
      })}

      {contextMenu && (
        <ContextMenuWrapper x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)}>
          <ContextMenuItem
            label={contextMenu.hasStopButton ? 'Remove Stop Button' : 'Add Stop Button'}
            onClick={handleToggleStopButton}
          />
        </ContextMenuWrapper>
      )}
    </>
  );
}
