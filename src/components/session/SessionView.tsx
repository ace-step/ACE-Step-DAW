import { useCallback, useEffect, useMemo, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useTransportStore } from '../../store/transportStore';
import { useUIStore } from '../../store/uiStore';
import { useTransport } from '../../hooks/useTransport';
import { getSessionSlotProgress } from '../../utils/sessionProgress';
import { getSessionClips } from '../../utils/sessionClips';
import { useSessionDragDrop, type SessionDragState, type SessionDropTarget } from '../../hooks/useSessionDragDrop';
import { ContextMenuWrapper, ContextMenuSeparator, ContextMenuItem } from '../ui/ContextMenu';
import { ColorSwatchPalette } from '../ui/ColorSwatchPalette';
import { SessionMixer } from './SessionMixer';
import { gatherAiFillContext } from '../../utils/sessionAiFill';
import { getSceneHeaderClass, getSceneButtonClass, getSceneButtonLabel, getSceneAriaPrefix, getProgressRingStroke, getLoopCountClass } from '../../utils/sessionVisualState';
import { generateSingleClip } from '../../services/generationPipeline';
import { toastError } from '../../hooks/useToast';
import { useSessionMidiController } from '../../hooks/useSessionMidiController';
import { useSessionRecording } from '../../hooks/useSessionRecording';
import { getMidiCaptureService } from '../../services/midiCaptureService';
import type { Clip, Track, SessionLaunchQuantization, SessionLaunchMode, SessionClipSlot, SessionPendingLaunch, SessionScene, SceneFollowActionType, SceneFollowActionConfig, FollowActionType, FollowActionConfig } from '../../types/project';

const LAUNCH_MODE_OPTIONS: SessionLaunchMode[] = ['trigger', 'gate', 'toggle', 'repeat'];

const LAUNCH_MODE_LABELS: Record<SessionLaunchMode, string> = {
  trigger: 'Trigger',
  gate: 'Gate',
  toggle: 'Toggle',
  repeat: 'Repeat',
};

/** Short badge letter for non-default launch modes. Trigger shows no badge. */
function getLaunchModeBadge(mode: SessionLaunchMode | undefined): string | null {
  if (!mode || mode === 'trigger') return null;
  return mode[0].toUpperCase(); // G, T, R
}

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

const FOLLOW_ACTION_OPTIONS: SceneFollowActionType[] = ['none', 'next', 'previous', 'first', 'last', 'random', 'again', 'any', 'stop'];
const FOLLOW_ACTION_LABELS: Record<SceneFollowActionType, string> = {
  none: 'None',
  next: 'Next',
  previous: 'Previous',
  first: 'First',
  last: 'Last',
  random: 'Random (other)',
  again: 'Again',
  any: 'Any',
  stop: 'Stop',
};

interface SceneContextMenuState {
  x: number;
  y: number;
  sceneId: string;
  sceneIndex: number;
}

interface SlotContextMenuState {
  x: number;
  y: number;
  slotId: string;
  currentColor: string | null;
  legato: boolean;
  currentLaunchMode: SessionLaunchMode;
  followAction?: FollowActionConfig;
  tempo?: number;
  timeSignature?: [number, number];
}

const CLIP_FOLLOW_ACTION_OPTIONS: { value: FollowActionType; label: string }[] = [
  { value: 'stop', label: 'Stop' },
  { value: 'again', label: 'Again' },
  { value: 'previous', label: 'Previous' },
  { value: 'next', label: 'Next' },
  { value: 'first', label: 'First' },
  { value: 'last', label: 'Last' },
  { value: 'any', label: 'Any' },
  { value: 'other', label: 'Other' },
];


const EMPTY_STRING_ARRAY: string[] = [];

export function SessionView() {
  const project = useProjectStore((s) => s.project);
  const setSessionLaunchQuantization = useProjectStore((s) => s.setSessionLaunchQuantization);
  const setSessionSlotQuantization = useProjectStore((s) => s.setSessionSlotQuantization);
  const launchedSessionClips = useTransportStore((s) => s.launchedSessionClips);
  const currentTime = useTransportStore((s) => s.currentTime);
  const sessionArrangementRecording = useTransportStore((s) => s.sessionArrangementRecording);
  const armedTrackIds = useTransportStore((s) => s.armedTrackIds);
  const captureMidi = useProjectStore((s) => s.captureMidi);
  const setMainView = useUIStore((s) => s.setMainView);
  const setSessionSlotColor = useProjectStore((s) => s.setSessionSlotColor);
  const setSessionSlotLegato = useProjectStore((s) => s.setSessionSlotLegato);
  const setSessionSlotLaunchMode = useProjectStore((s) => s.setSessionSlotLaunchMode);
  const setSessionSlotFollowAction = useProjectStore((s) => s.setSessionSlotFollowAction);
  const setSessionFollowActionsEnabled = useProjectStore((s) => s.setSessionFollowActionsEnabled);
  const setSessionSlotTempo = useProjectStore((s) => s.setSessionSlotTempo);
  const setSessionSlotTimeSignature = useProjectStore((s) => s.setSessionSlotTimeSignature);
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

  const updateSessionSceneProperties = useProjectStore((s) => s.updateSessionSceneProperties);
  const setSessionSceneFollowAction = useProjectStore((s) => s.setSessionSceneFollowAction);
  const setSessionSceneFollowActionConfig = useProjectStore((s) => s.setSessionSceneFollowActionConfig);
  const clearSessionSceneFollowActionConfig = useProjectStore((s) => s.clearSessionSceneFollowActionConfig);
  const [colorMenu, setColorMenu] = useState<SlotContextMenuState | null>(null);
  const [sceneMenu, setSceneMenu] = useState<SceneContextMenuState | null>(null);
  const { dragState, dropTarget, handlePointerDown, handlePointerMove, handlePointerUp, cancelDrag } = useSessionDragDrop();
  const [showSessionMixer, setShowSessionMixer] = useState(false);
  const [captureBarCount, setCaptureBarCount] = useState(8);

  const hasArmedTrack = armedTrackIds.length > 0;
  const captureService = useMemo(() => getMidiCaptureService(), []);

  const handleCaptureMidi = useCallback(() => {
    if (!hasArmedTrack) return;
    const targetTrackId = armedTrackIds[0];
    captureMidi(targetTrackId, currentTime, captureService, { bars: captureBarCount, quantize: '1/16' });
  }, [hasArmedTrack, armedTrackIds, currentTime, captureMidi, captureService, captureBarCount]);
  const [midiEnabled, setMidiEnabled] = useState(false);
  const midiState = useSessionMidiController(midiEnabled);
  const { startSlotRecording, stopSlotRecording, countInEnabled, setCountInEnabled, countInRemaining } = useSessionRecording();
  const recordingSlotIds = useProjectStore((s) => s.project?.session?.recordingSlotIds ?? EMPTY_STRING_ARRAY);
  const fixedLengthBars = useProjectStore((s) => s.project?.session?.fixedLengthBars ?? null);
  const setSessionFixedLengthBars = useProjectStore((s) => s.setSessionFixedLengthBars);
  const toggleArmTrack = useTransportStore((s) => s.toggleArmTrack);

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

  const handleSetLaunchMode = useCallback((mode: SessionLaunchMode) => {
    if (colorMenu) {
      setSessionSlotLaunchMode(colorMenu.slotId, mode);
      setColorMenu(null);
    }
  }, [colorMenu, setSessionSlotLaunchMode]);

  const handleFollowActionChange = useCallback((field: string, value: string | number | boolean) => {
    if (!colorMenu) return;
    setSessionSlotFollowAction(colorMenu.slotId, { [field]: value });
    // Update local state to reflect change immediately
    setColorMenu((prev) => {
      if (!prev) return null;
      const defaultFA: FollowActionConfig = { actionA: 'next', actionB: 'stop', chanceA: 1, time: 4, enabled: true };
      return {
        ...prev,
        followAction: { ...(prev.followAction ?? defaultFA), [field]: value },
      };
    });
  }, [colorMenu, setSessionSlotFollowAction]);

  const addClip = useProjectStore((s) => s.addClip);
  const assignClipToSessionSlot = useProjectStore((s) => s.assignClipToSessionSlot);

  // Set keyboard context to 'session' on mount, restore previous on unmount
  useEffect(() => {
    const previousScope = useUIStore.getState().keyboardContext.scope;
    const previousTrackId = useUIStore.getState().keyboardContext.trackId;
    setKeyboardContext('session');
    return () => {
      setKeyboardContext(previousScope, previousTrackId);
    };
  }, [setKeyboardContext]);

  // Cancel drag on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dragState) {
        cancelDrag();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [dragState, cancelDrag]);

  if (!project) {
    return <div className="flex-1 min-w-0 bg-[#202020]" />;
  }

  const tracks = [...project.tracks].sort((a, b) => a.order - b.order);
  const sceneCount = Math.max(4, ...tracks.map((track) => getSessionClips(track).length));
  const sessionQuantization = project.session?.quantization ?? '1 bar';
  const sessionSlots = project.session?.slots ?? [];
  const pendingLaunches = project.session?.pendingLaunches ?? [];
  const scenes = project.session?.scenes ?? [];
  const followActionsEnabled = project.session?.followActionsEnabled !== false;

  // Compute active scene indices (scenes that have at least one playing clip)
  const activeSceneIndices = useMemo(() => {
    const activeIndices = new Set<number>();
    for (const track of tracks) {
      const launch = launchedSessionClips[track.id];
      if (!launch?.clipId) continue;
      const sessionClips = getSessionClips(track);
      const clipIndex = sessionClips.findIndex((c) => c?.id === launch.clipId);
      if (clipIndex >= 0) activeIndices.add(clipIndex);
    }
    return activeIndices;
  }, [tracks, launchedSessionClips]);

  // Compute queued scene indices (scenes with pending scene launches)
  const queuedSceneIndices = useMemo(() => {
    const queued = new Set<number>();
    for (const launch of pendingLaunches) {
      if (launch.type === 'scene' && launch.sceneId) {
        const sceneIdx = scenes.findIndex((s) => s.id === launch.sceneId);
        if (sceneIdx >= 0) queued.add(sceneIdx);
      }
    }
    return queued;
  }, [pendingLaunches, scenes]);

  const handleAiFill = useCallback((trackId: string, sceneIndex: number) => {
    if (!project) return;
    const track = tracks.find((t) => t.id === trackId);
    if (!track) return;
    const { prompt } = gatherAiFillContext(track, sceneIndex, scenes, sessionSlots, tracks);
    const sceneId = scenes[sceneIndex]?.id;
    if (!sceneId) return;

    const measures = project.measures ?? 4;
    const timeSignatureDenominator = project.timeSignatureDenominator ?? 4;
    const barDurationSec = (project.timeSignature * 60 * 4) / (project.bpm * timeSignatureDenominator);
    const newClip = addClip(trackId, {
      startTime: 0,
      duration: measures * barDurationSec,
      prompt,
      lyrics: '',
      source: 'generated',
      keyScale: project.keyScale,
    });

    assignClipToSessionSlot(trackId, sceneId, newClip.id);

    // Trigger AI generation for the newly created clip
    void generateSingleClip(newClip.id).catch((error) => {
      toastError(error instanceof Error ? error.message : 'Failed to generate AI-filled clip');
    });
  }, [project, tracks, scenes, sessionSlots, addClip, assignClipToSessionSlot]);

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
              onClick={() => setSessionFollowActionsEnabled(!followActionsEnabled)}
              className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                followActionsEnabled
                  ? 'bg-purple-600/30 text-purple-300 border border-purple-500/50'
                  : 'bg-[#2a2a2a] text-zinc-500 hover:bg-[#343434]'
              }`}
              aria-label={followActionsEnabled ? 'Disable follow actions' : 'Enable follow actions'}
            >
              Follow Actions {followActionsEnabled ? 'ON' : 'OFF'}
            </button>
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
            <select
              value={captureBarCount}
              onChange={(e) => setCaptureBarCount(Number(e.target.value))}
              className="rounded bg-[#2a2a2a] border border-[#444] px-1.5 py-1 text-[11px] text-zinc-200 outline-none"
              aria-label="Capture buffer length in bars"
            >
              {[2, 4, 8, 16, 32].map((n) => (
                <option key={n} value={n}>{n} bars</option>
              ))}
            </select>
            <button
              onClick={handleCaptureMidi}
              disabled={!hasArmedTrack}
              className="px-3 py-1.5 rounded-md bg-[#2a2a2a] text-[11px] font-medium text-zinc-300 hover:bg-[#343434] transition-colors disabled:opacity-30"
              aria-label="Capture MIDI from rolling buffer"
            >
              Capture MIDI
            </button>
            <label className="flex items-center gap-1.5 text-[11px] text-zinc-400">
              <span>Rec:</span>
              <select
                value={fixedLengthBars ?? 'free'}
                onChange={(e) => setSessionFixedLengthBars(e.target.value === 'free' ? null : Number(e.target.value))}
                className="rounded bg-[#2a2a2a] border border-[#444] px-1.5 py-1 text-[11px] text-zinc-200 outline-none"
                aria-label="Fixed-length recording in bars"
              >
                <option value="free">Free</option>
                {[1, 2, 4, 8, 16].map((n) => (
                  <option key={n} value={n}>{n} bar{n > 1 ? 's' : ''}</option>
                ))}
              </select>
            </label>
            <button
              onClick={() => setCountInEnabled(!countInEnabled)}
              className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                countInEnabled
                  ? 'bg-orange-600/30 text-orange-300 border border-orange-500/50'
                  : 'bg-[#2a2a2a] text-zinc-500 hover:bg-[#343434]'
              }`}
              aria-label={countInEnabled ? 'Disable count-in' : 'Enable count-in before recording'}
            >
              {countInRemaining != null ? `Count: ${countInRemaining}` : countInEnabled ? 'Count-In ON' : 'Count-In'}
            </button>
            <button
              onClick={() => setMidiEnabled((v) => !v)}
              className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                midiEnabled
                  ? midiState.isConnected
                    ? 'bg-purple-600 text-white'
                    : 'bg-purple-600/50 text-purple-200'
                  : 'bg-[#2a2a2a] text-zinc-300 hover:bg-[#343434]'
              }`}
              aria-label={midiEnabled ? `MIDI ${midiState.isConnected ? 'connected' : 'waiting'}` : 'Enable MIDI controller'}
              title={midiState.deviceName ? `Connected: ${midiState.deviceName}` : 'Click to enable MIDI controller'}
            >
              MIDI {midiEnabled ? (midiState.isConnected ? '●' : '○') : 'OFF'}
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

      <div
        className="grid min-w-[980px]"
        style={{ gridTemplateColumns: `220px repeat(${sceneCount}, minmax(150px, 1fr))` }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="sticky top-[72px] z-10 border-b border-r border-[#333] bg-[#242424] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
          Tracks
        </div>
        {Array.from({ length: sceneCount }, (_, sceneIndex) => {
          const sceneLaunches = tracks.flatMap((track) => {
            const clip = getSessionClips(track)[sceneIndex];
            return clip ? [{ trackId: track.id, clipId: clip.id }] : [];
          });
          const isSceneDragTarget = dragState?.type === 'scene' && dropTarget?.sceneIndex === sceneIndex && dropTarget?.valid;
          const isSceneDragSource = dragState?.type === 'scene' && dragState?.sourceSceneIndex === sceneIndex;
          const isSceneActive = activeSceneIndices.has(sceneIndex);
          const isSceneQueued = queuedSceneIndices.has(sceneIndex);

          return (
            <div
              key={`scene-${sceneIndex}`}
              className={`sticky top-[72px] z-10 border-b border-r px-3 py-2 transition-colors ${
                getSceneHeaderClass({ isDragTarget: isSceneDragTarget, isDragSource: isSceneDragSource, isActive: isSceneActive, isRecording: sessionArrangementRecording, isQueued: isSceneQueued })
              }`}
              style={isSceneQueued && !isSceneActive ? { animation: 'session-blink 500ms ease-in-out infinite' } : undefined}
              data-scene-index={sceneIndex}
              data-scene-header=""
              onPointerDown={(e) => {
                handlePointerDown(e, 'scene', {
                  sourceSceneIndex: sceneIndex,
                  label: `Scene ${sceneIndex + 1}`,
                  color: '#6366f1',
                });
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                const sceneId = scenes[sceneIndex]?.id;
                if (sceneId) {
                  setSceneMenu({ x: e.clientX, y: e.clientY, sceneId, sceneIndex });
                }
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="cursor-grab active:cursor-grabbing">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">Scene</div>
                  <div className="text-sm font-semibold text-zinc-100">{sceneIndex + 1}</div>
                </div>
                <button
                  onClick={() => void launchSessionScene(sceneIndex, sceneLaunches)}
                  disabled={sceneLaunches.length === 0}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-30 ${
                    getSceneButtonClass({ isActive: isSceneActive, isRecording: sessionArrangementRecording, isQueued: isSceneQueued })
                  }`}
                  aria-label={`${getSceneAriaPrefix({ isActive: isSceneActive, isRecording: sessionArrangementRecording, isQueued: isSceneQueued })} scene ${sceneIndex + 1}`}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {getSceneButtonLabel({ isActive: isSceneActive, isRecording: sessionArrangementRecording, isQueued: isSceneQueued })}
                </button>
              </div>
              {scenes[sceneIndex]?.followActionConfig ? (
                <div className="text-[9px] text-zinc-500 mt-0.5">
                  {FOLLOW_ACTION_LABELS[scenes[sceneIndex].followActionConfig!.actionA]}
                  {scenes[sceneIndex].followActionConfig!.chanceA < 1 && (
                    <> / {FOLLOW_ACTION_LABELS[scenes[sceneIndex].followActionConfig!.actionB]}
                    {' '}({Math.round(scenes[sceneIndex].followActionConfig!.chanceA * 100)}%)</>
                  )}
                  {scenes[sceneIndex].followActionTime ? ` · ${scenes[sceneIndex].followActionTime}b` : ''}
                </div>
              ) : scenes[sceneIndex]?.followAction && scenes[sceneIndex].followAction !== 'none' ? (
                <div className="text-[9px] text-zinc-500 mt-0.5">
                  Follow: {FOLLOW_ACTION_LABELS[scenes[sceneIndex].followAction!]}
                  {scenes[sceneIndex].followActionTime ? ` (${scenes[sceneIndex].followActionTime} bars)` : ''}
                </div>
              ) : null}
              {scenes[sceneIndex]?.tempo && (
                <div className="text-[9px] text-zinc-500">
                  {scenes[sceneIndex].tempo} BPM
                </div>
              )}
              {scenes[sceneIndex]?.timeSignature && (
                <div className="text-[9px] text-zinc-500">
                  {scenes[sceneIndex].timeSignature![0]}/{scenes[sceneIndex].timeSignature![1]}
                </div>
              )}
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
              dragState={dragState}
              dropTarget={dropTarget}
              onDragStart={handlePointerDown}
              onAiFill={handleAiFill}
              isArmed={armedTrackIds.includes(track.id)}
              recordingSlotIds={recordingSlotIds}
              onArmTrack={() => toggleArmTrack(track.id)}
              onStartRecording={(sceneId, slotId) => startSlotRecording(track.id, sceneId, slotId)}
              onStopRecording={(slotId, sceneId, recordingType) => stopSlotRecording(slotId, track.id, sceneId, recordingType)}
              isArrangementRecording={sessionArrangementRecording}
            />
          );
        })}
      </div>

      <SessionMixer
        visible={showSessionMixer}
        onToggle={() => setShowSessionMixer((v) => !v)}
      />

      {colorMenu && (
        <ContextMenuWrapper
          x={colorMenu.x}
          y={colorMenu.y}
          onClose={handleCloseColorMenu}
          testId="session-slot-context-menu"
          minWidth={180}
        >
          <div className="px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-zinc-400">
            Launch Mode
          </div>
          <ContextMenuSeparator />
          {LAUNCH_MODE_OPTIONS.map((mode) => (
            <ContextMenuItem
              key={mode}
              label={`${LAUNCH_MODE_LABELS[mode]}${colorMenu.currentLaunchMode === mode ? ' (active)' : ''}`}
              onClick={() => handleSetLaunchMode(mode)}
            />
          ))}
          <ContextMenuSeparator />
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
          <ContextMenuSeparator />
          <ContextMenuItem
            label={`${colorMenu.legato ? '\u2713 ' : ''}Legato`}
            onClick={() => {
              setSessionSlotLegato(colorMenu.slotId, !colorMenu.legato);
              setColorMenu(null);
            }}
          />
          <ContextMenuSeparator />
          <div className="px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-zinc-400">
            Tempo Override
          </div>
          <div className="px-2 py-1.5 flex items-center gap-2">
            <input
              type="number"
              min={20}
              max={999}
              step={1}
              defaultValue={colorMenu.tempo ?? ''}
              placeholder="Global"
              className="w-16 rounded bg-[#2a2a2a] border border-[#444] px-1.5 py-0.5 text-[11px] text-zinc-200 outline-none focus:border-daw-accent"
              onBlur={(e) => {
                const rawValue = e.target.value.trim();
                if (rawValue === '') {
                  setSessionSlotTempo(colorMenu.slotId, undefined);
                  return;
                }
                const val = Number(rawValue);
                if (!Number.isFinite(val) || val < 20 || val > 999) return;
                setSessionSlotTempo(colorMenu.slotId, val);
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              aria-label="Clip tempo override"
              data-testid="slot-tempo-input"
            />
            <span className="text-[10px] text-zinc-400">BPM</span>
            {colorMenu.tempo && (
              <button
                className="text-[10px] text-zinc-500 hover:text-zinc-300"
                onClick={() => setSessionSlotTempo(colorMenu.slotId, undefined)}
              >
                Clear
              </button>
            )}
          </div>
          <div className="px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-zinc-400">
            Time Sig Override
          </div>
          <div className="px-2 py-1.5 flex items-center gap-1">
            <select
              defaultValue={colorMenu.timeSignature?.[0] ?? ''}
              className="w-10 rounded bg-[#2a2a2a] border border-[#444] px-1 py-0.5 text-[11px] text-zinc-200 outline-none"
              onChange={(e) => {
                const num = Number(e.target.value);
                if (!num) {
                  setSessionSlotTimeSignature(colorMenu.slotId, undefined);
                  setColorMenu((prev) => prev ? { ...prev, timeSignature: undefined } : null);
                  return;
                }
                const den = colorMenu.timeSignature?.[1] ?? 4;
                const ts: [number, number] = [num, den];
                setSessionSlotTimeSignature(colorMenu.slotId, ts);
                setColorMenu((prev) => prev ? { ...prev, timeSignature: ts } : null);
              }}
              aria-label="Time signature numerator"
              data-testid="slot-timesig-num"
            >
              <option value="">—</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 16].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span className="text-[10px] text-zinc-400">/</span>
            <select
              defaultValue={colorMenu.timeSignature?.[1] ?? ''}
              className="w-10 rounded bg-[#2a2a2a] border border-[#444] px-1 py-0.5 text-[11px] text-zinc-200 outline-none"
              onChange={(e) => {
                const den = Number(e.target.value);
                if (!den) {
                  setSessionSlotTimeSignature(colorMenu.slotId, undefined);
                  setColorMenu((prev) => prev ? { ...prev, timeSignature: undefined } : null);
                  return;
                }
                const num = colorMenu.timeSignature?.[0] ?? 4;
                const ts: [number, number] = [num, den];
                setSessionSlotTimeSignature(colorMenu.slotId, ts);
                setColorMenu((prev) => prev ? { ...prev, timeSignature: ts } : null);
              }}
              aria-label="Time signature denominator"
              data-testid="slot-timesig-den"
            >
              <option value="">—</option>
              {[2, 4, 8, 16].map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <ContextMenuSeparator />
          <div className="px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-zinc-400">
            Follow Action
          </div>
          <div className="px-3 py-1 flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={colorMenu.followAction?.enabled ?? false}
                onChange={(e) => handleFollowActionChange('enabled', e.target.checked)}
                className="accent-purple-500"
                aria-label="Enable follow action for this slot"
              />
              Enabled
            </label>
          </div>
          {(colorMenu.followAction?.enabled) && (
            <>
              <div className="px-3 py-1 flex items-center gap-2">
                <label className="text-[11px] text-zinc-400 w-10">A:</label>
                <select
                  value={colorMenu.followAction?.actionA ?? 'next'}
                  onChange={(e) => handleFollowActionChange('actionA', e.target.value)}
                  className="flex-1 rounded bg-[#2a2a2a] border border-[#444] px-1.5 py-0.5 text-[11px] text-zinc-200 outline-none"
                  aria-label="Follow action A"
                >
                  {CLIP_FOLLOW_ACTION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="px-3 py-1 flex items-center gap-2">
                <label className="text-[11px] text-zinc-400 w-10">B:</label>
                <select
                  value={colorMenu.followAction?.actionB ?? 'stop'}
                  onChange={(e) => handleFollowActionChange('actionB', e.target.value)}
                  className="flex-1 rounded bg-[#2a2a2a] border border-[#444] px-1.5 py-0.5 text-[11px] text-zinc-200 outline-none"
                  aria-label="Follow action B"
                >
                  {CLIP_FOLLOW_ACTION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="px-3 py-1 flex items-center gap-2">
                <label className="text-[11px] text-zinc-400 w-10">A%:</label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round((colorMenu.followAction?.chanceA ?? 1) * 100)}
                  onChange={(e) => handleFollowActionChange('chanceA', Number(e.target.value) / 100)}
                  className="flex-1 accent-purple-500"
                  aria-label="Follow action A probability"
                />
                <span className="text-[10px] text-zinc-400 w-8 text-right">
                  {Math.round((colorMenu.followAction?.chanceA ?? 1) * 100)}%
                </span>
              </div>
              <div className="px-3 py-1 flex items-center gap-2">
                <label className="text-[11px] text-zinc-400 w-10">Time:</label>
                <input
                  type="number"
                  min={0.25}
                  max={64}
                  step={0.25}
                  value={colorMenu.followAction?.time ?? 4}
                  onChange={(e) => handleFollowActionChange('time', Number(e.target.value))}
                  className="w-16 rounded bg-[#2a2a2a] border border-[#444] px-1.5 py-0.5 text-[11px] text-zinc-200 outline-none"
                  aria-label="Follow action time in beats"
                />
                <span className="text-[10px] text-zinc-400">beats</span>
              </div>
            </>
          )}
        </ContextMenuWrapper>
      )}

      {sceneMenu && (() => {
        const scene = scenes.find((s) => s.id === sceneMenu.sceneId);
        return (
          <ContextMenuWrapper
            x={sceneMenu.x}
            y={sceneMenu.y}
            onClose={() => setSceneMenu(null)}
            testId="session-scene-context-menu"
            minWidth={200}
          >
            <div className="px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-zinc-400">
              Tempo Override
            </div>
            <div className="px-2 py-1.5 flex items-center gap-1.5">
              <input
                type="number"
                min={20}
                max={300}
                step={1}
                placeholder={`${project.bpm}`}
                defaultValue={scene?.tempo ?? ''}
                className="w-16 rounded bg-[#2a2a2a] border border-[#444] px-1.5 py-0.5 text-[11px] text-zinc-200 outline-none focus:border-daw-accent"
                onBlur={(e) => {
                  const val = e.target.value.trim();
                  updateSessionSceneProperties(sceneMenu.sceneId, {
                    tempo: val ? Math.max(20, Math.min(300, Number(val))) : undefined,
                  });
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                data-testid="scene-tempo-input"
              />
              <span className="text-[10px] text-zinc-400">BPM</span>
            </div>
            <ContextMenuSeparator />
            <div className="px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-zinc-400">
              Time Signature Override
            </div>
            <div className="px-2 py-1.5 flex items-center gap-1">
              <input
                type="number"
                min={1}
                max={32}
                step={1}
                placeholder={`${project.timeSignature}`}
                defaultValue={scene?.timeSignature?.[0] ?? ''}
                className="w-10 rounded bg-[#2a2a2a] border border-[#444] px-1.5 py-0.5 text-[11px] text-zinc-200 outline-none focus:border-daw-accent"
                onBlur={(e) => {
                  const num = e.target.value.trim();
                  if (!num) {
                    updateSessionSceneProperties(sceneMenu.sceneId, { timeSignature: undefined });
                  } else {
                    const denom = scene?.timeSignature?.[1] ?? project.timeSignatureDenominator ?? 4;
                    updateSessionSceneProperties(sceneMenu.sceneId, {
                      timeSignature: [Math.max(1, Math.min(32, Number(num))), denom],
                    });
                  }
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                data-testid="scene-timesig-num-input"
              />
              <span className="text-[10px] text-zinc-400">/</span>
              <select
                defaultValue={scene?.timeSignature?.[1] ?? project.timeSignatureDenominator ?? 4}
                className="w-12 rounded bg-[#2a2a2a] border border-[#444] px-1 py-0.5 text-[11px] text-zinc-200 outline-none focus:border-daw-accent"
                onChange={(e) => {
                  const num = scene?.timeSignature?.[0] ?? project.timeSignature;
                  updateSessionSceneProperties(sceneMenu.sceneId, {
                    timeSignature: [num, Number(e.target.value)],
                  });
                }}
                data-testid="scene-timesig-denom-select"
              >
                {[2, 4, 8, 16].map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <ContextMenuSeparator />
            <div className="px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-zinc-400">
              Follow Action
            </div>
            {FOLLOW_ACTION_OPTIONS.map((action) => (
              <ContextMenuItem
                key={action}
                label={`${FOLLOW_ACTION_LABELS[action]}${scene?.followAction === action || (!scene?.followAction && action === 'none') ? ' \u2713' : ''}`}
                onClick={() => {
                  setSessionSceneFollowAction(sceneMenu.sceneId, action, action === 'none' ? undefined : (scene?.followActionTime ?? 4));
                }}
              />
            ))}
            {scene?.followAction && scene.followAction !== 'none' && (
              <>
                <ContextMenuSeparator />
                <div className="px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-zinc-400">
                  Follow After (bars)
                </div>
                <div className="px-2 py-1.5">
                  <input
                    type="number"
                    min={1}
                    max={64}
                    step={1}
                    defaultValue={scene.followActionTime ?? 4}
                    className="w-14 rounded bg-[#2a2a2a] border border-[#444] px-1.5 py-0.5 text-[11px] text-zinc-200 outline-none focus:border-daw-accent"
                    onBlur={(e) => {
                      const val = Number(e.target.value);
                      if (val >= 1 && val <= 64) {
                        setSessionSceneFollowAction(sceneMenu.sceneId, scene.followAction!, val);
                      }
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    data-testid="scene-follow-bars-input"
                  />
                </div>
              </>
            )}
            <ContextMenuSeparator />
            <div className="px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-zinc-400">
              A/B Follow (probability)
            </div>
            <div className="px-2 py-1.5 flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-zinc-400 w-3">A</span>
                <select
                  value={scene?.followActionConfig?.actionA ?? 'next'}
                  onChange={(e) => {
                    const cfg = scene?.followActionConfig ?? { actionA: 'next', actionB: 'stop', chanceA: 1 };
                    setSessionSceneFollowActionConfig(sceneMenu.sceneId, {
                      ...cfg,
                      actionA: e.target.value as SceneFollowActionType,
                    });
                  }}
                  className="flex-1 rounded bg-[#2a2a2a] border border-[#444] px-1.5 py-0.5 text-[11px] text-zinc-200 outline-none"
                  aria-label="Scene follow action A"
                  data-testid="scene-follow-action-a"
                >
                  {FOLLOW_ACTION_OPTIONS.filter((a) => a !== 'none').map((action) => (
                    <option key={action} value={action}>{FOLLOW_ACTION_LABELS[action]}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-zinc-400 w-3">B</span>
                <select
                  value={scene?.followActionConfig?.actionB ?? 'stop'}
                  onChange={(e) => {
                    const cfg = scene?.followActionConfig ?? { actionA: 'next', actionB: 'stop', chanceA: 1 };
                    setSessionSceneFollowActionConfig(sceneMenu.sceneId, {
                      ...cfg,
                      actionB: e.target.value as SceneFollowActionType,
                    });
                  }}
                  className="flex-1 rounded bg-[#2a2a2a] border border-[#444] px-1.5 py-0.5 text-[11px] text-zinc-200 outline-none"
                  aria-label="Scene follow action B"
                  data-testid="scene-follow-action-b"
                >
                  {FOLLOW_ACTION_OPTIONS.filter((a) => a !== 'none').map((action) => (
                    <option key={action} value={action}>{FOLLOW_ACTION_LABELS[action]}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[10px] text-zinc-400 w-3">%</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round((scene?.followActionConfig?.chanceA ?? 1) * 100)}
                  onChange={(e) => {
                    const cfg = scene?.followActionConfig ?? { actionA: 'next', actionB: 'stop', chanceA: 1 };
                    setSessionSceneFollowActionConfig(sceneMenu.sceneId, {
                      ...cfg,
                      chanceA: Number(e.target.value) / 100,
                    });
                  }}
                  className="flex-1 h-1 accent-daw-accent"
                  aria-label="A/B probability"
                  data-testid="scene-follow-chance-slider"
                />
                <span className="text-[10px] text-zinc-400 w-8 text-right">
                  {Math.round((scene?.followActionConfig?.chanceA ?? 1) * 100)}%
                </span>
              </div>
              {scene?.followActionConfig && (
                <button
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 mt-0.5 text-left"
                  onClick={() => clearSessionSceneFollowActionConfig(sceneMenu.sceneId)}
                  data-testid="scene-follow-clear-config"
                >
                  Clear A/B config
                </button>
              )}
            </div>
          </ContextMenuWrapper>
        );
      })()}

      {/* Drag ghost overlay */}
      {dragState && (
        <div
          className="pointer-events-none fixed z-50 flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 shadow-xl backdrop-blur-sm"
          style={{
            left: dragState.ghostX + 12,
            top: dragState.ghostY - 16,
            backgroundColor: `${dragState.color}cc`,
          }}
          data-testid="session-drag-ghost"
        >
          <span className="text-xs font-medium text-white truncate max-w-[140px]">{dragState.label}</span>
        </div>
      )}
    </div>
  );
}

interface StopButtonContextMenuState {
  x: number;
  y: number;
  slotId: string;
  hasStopButton: boolean;
  sceneIndex: number;
  trackId: string;
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
  dragState,
  dropTarget,
  onDragStart,
  onAiFill,
  isArmed,
  recordingSlotIds,
  onArmTrack,
  onStartRecording,
  onStopRecording,
  isArrangementRecording,
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
  onContextMenuSlot: (state: SlotContextMenuState) => void;
  onSlotClick: (sceneIndex: number) => void;
  dragState: SessionDragState | null;
  dropTarget: SessionDropTarget | null;
  onDragStart: (e: React.PointerEvent, type: 'clip' | 'scene', opts: { sourceSlotId?: string; sourceSceneIndex?: number; label: string; color: string }) => void;
  onAiFill: (trackId: string, sceneIndex: number) => void;
  isArmed: boolean;
  recordingSlotIds: string[];
  onArmTrack: () => void;
  onStartRecording: (sceneId: string, slotId: string) => void;
  onStopRecording: (slotId: string, sceneId: string, recordingType: 'audio' | 'midi') => void;
  isArrangementRecording: boolean;
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
      sceneIndex,
      trackId: track.id,
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
          <div className="min-w-0 flex items-center gap-2">
            <button
              onClick={onArmTrack}
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                isArmed
                  ? 'border-red-500 bg-red-500/30'
                  : 'border-zinc-600 bg-transparent hover:border-zinc-400'
              }`}
              aria-label={`${isArmed ? 'Disarm' : 'Arm'} ${track.displayName} for recording`}
              data-testid={`arm-track-${track.id}`}
            >
              {isArmed && <span className="w-2 h-2 rounded-full bg-red-500" />}
            </button>
            <div>
              <div className="truncate text-sm font-medium text-zinc-100">{track.displayName}</div>
              <div className="text-[11px] text-zinc-400">{track.trackType ?? 'stems'}</div>
            </div>
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

        const slotLaunchMode: SessionLaunchMode = slot?.launchMode ?? 'trigger';
        const launchModeBadge = getLaunchModeBadge(slotLaunchMode);

        const handleContextMenu = (e: React.MouseEvent) => {
          if (!clip || !slot) return;
          e.preventDefault();
          onContextMenuSlot({
            x: e.clientX,
            y: e.clientY,
            slotId: slot.id,
            currentColor: slotColor,
            legato: slot.legato ?? false,
            currentLaunchMode: slotLaunchMode,
            followAction: slot.followAction,
            tempo: slot.tempo,
            timeSignature: slot.timeSignature,
          });
        };

        // Drag visual feedback
        const isDragSource = dragState?.type === 'clip' && dragState?.sourceSlotId === slot?.id;
        const isDropTarget = dragState?.type === 'clip' && dropTarget?.slotId === slot?.id && dropTarget?.valid && !isDragSource;

        return (
          <div key={`${track.id}-${sceneIndex}`} className="border-r border-b border-[#2e2e2e] bg-[#1b1b1b] p-2">
            {clip ? (
              <div className="relative">
                <button
                  onClick={() => {
                    if (dragState) return; // Don't launch during drag
                    onSlotClick(sceneIndex);
                    // Gate and Repeat modes use pointer events, not click
                    if (slotLaunchMode === 'gate' || slotLaunchMode === 'repeat') return;
                    void onLaunch(clip.id, sceneIndex);
                  }}
                  onPointerDown={(e) => {
                    // Drag-and-drop initiation
                    if (slot) {
                      onDragStart(e, 'clip', {
                        sourceSlotId: slot.id,
                        label: getClipLabel(clip, sceneIndex),
                        color: slotColor ?? track.color ?? '#6366f1',
                      });
                    }
                    if (slotLaunchMode !== 'gate' && slotLaunchMode !== 'repeat') return;
                    // Prevent default to avoid focus issues; capture pointer for reliable up events
                    e.currentTarget.setPointerCapture(e.pointerId);
                    void onLaunch(clip.id, sceneIndex);
                  }}
                  onPointerUp={(e) => {
                    if (slotLaunchMode !== 'gate' && slotLaunchMode !== 'repeat') return;
                    e.currentTarget.releasePointerCapture(e.pointerId);
                    // Gate: stop the track on release; Repeat: last trigger continues (no stop)
                    if (slotLaunchMode === 'gate') {
                      void onStop();
                    }
                  }}
                  onContextMenu={handleContextMenu}
                  className={`relative flex h-24 w-full flex-col justify-between rounded-xl border px-3 py-2 text-left transition-all ${
                    isDragSource
                      ? 'opacity-40 border-dashed border-zinc-500'
                      : isDropTarget
                        ? 'border-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.5)]'
                        : isActive
                          ? 'border-emerald-400 shadow-[0_0_0_1px_rgba(74,222,128,0.35)]'
                          : isQueued
                            ? 'border-amber-400'
                            : 'border-[#3a3a3a] hover:border-daw-accent'
                  } ${isSelected && !isDragSource ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-[#1b1b1b]' : ''}`}
                  style={{
                    ...((slotColor ?? track.color)
                      ? { backgroundColor: `${slotColor ?? track.color}33`, borderColor: isDragSource ? undefined : isDropTarget ? undefined : isActive ? undefined : isQueued ? undefined : `${slotColor ?? track.color}88` }
                      : isActive
                        ? { backgroundColor: 'rgba(16, 185, 129, 0.2)' }
                        : isQueued
                          ? { backgroundColor: 'rgba(245, 158, 11, 0.1)' }
                          : { backgroundColor: '#262626' }),
                    ...(isQueued && !isActive ? { animation: 'session-blink 500ms ease-in-out infinite' } : {}),
                  }}
                  aria-label={`Launch ${getClipLabel(clip, sceneIndex)} on ${track.displayName} in scene ${sceneIndex + 1}${slotLaunchMode !== 'trigger' ? ` (${slotLaunchMode} mode)` : ''}`}
                  data-slot-id={slot?.id}
                  data-track-id={track.id}
                  data-scene-index={sceneIndex}
                  data-launch-mode={slotLaunchMode}
                >
                  <div>
                    <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-zinc-400">
                      <span>{clip.midiData ? 'MIDI' : clip.source === 'uploaded' ? 'Audio' : 'Generated'}</span>
                      {isActive && isArrangementRecording && (
                        <span
                          className="inline-block w-2 h-2 rounded-full bg-red-500"
                          style={{ animation: 'session-blink 1s ease-in-out infinite' }}
                          title="Recording to arrangement"
                          data-testid="recording-indicator"
                        />
                      )}
                    </div>
                    <div className="mt-1 line-clamp-2 text-sm font-medium text-zinc-100">
                      {getClipLabel(clip, sceneIndex)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-zinc-400 tabular-nums">
                    <span>{clip.duration.toFixed(1)}s</span>
                    {isActive ? (
                      <span className="flex items-center gap-1">
                        <svg width="24" height="24" className="shrink-0" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" fill="none" stroke="#444" strokeWidth="2" />
                          <circle
                            cx="12" cy="12" r="10"
                            fill="none"
                            stroke={getProgressRingStroke(isArrangementRecording)}
                            strokeWidth="2"
                            strokeDasharray={`${progress * PROGRESS_RING_CIRCUMFERENCE} ${PROGRESS_RING_CIRCUMFERENCE}`}
                            strokeLinecap="round"
                            transform="rotate(-90 12 12)"
                          />
                        </svg>
                        <span className={getLoopCountClass(isArrangementRecording)}>{loopCount}</span>
                      </span>
                    ) : (
                      <span>{isQueued ? 'QUEUED' : `Start ${clip.startTime.toFixed(1)}s`}</span>
                    )}
                  </div>
                </button>
                {launchModeBadge && (
                  <span
                    className="absolute top-1 left-1 rounded bg-violet-600/80 px-1 py-0.5 text-[9px] font-bold text-white leading-none pointer-events-none"
                    title={`Launch mode: ${LAUNCH_MODE_LABELS[slotLaunchMode]}`}
                    data-testid={`launch-mode-badge-${slot?.id}`}
                  >
                    {launchModeBadge}
                  </span>
                )}
                {slot?.followAction?.enabled && (
                  <span
                    className="absolute top-1 left-6 rounded bg-purple-600/80 px-1 py-0.5 text-[9px] font-semibold text-white leading-none pointer-events-none"
                    title={`Follow: ${slot.followAction.actionA} / ${slot.followAction.actionB}`}
                    data-testid={`follow-badge-${slot.id}`}
                  >
                    &#x2192;
                  </span>
                )}
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
                {isArmed && clip.midiData && slot && sceneId && !recordingSlotIds.includes(slot.id) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void onStartRecording(sceneId, slot.id);
                    }}
                    className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-red-600/80 px-1.5 py-0.5 text-[9px] font-medium text-white leading-none hover:bg-red-500 transition-colors"
                    title="MIDI Overdub — record additional notes on top"
                    aria-label={`MIDI overdub on ${getClipLabel(clip, sceneIndex)}`}
                    data-testid={`overdub-btn-${slot.id}`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                    OVR
                  </button>
                )}
                {isArmed && slot && recordingSlotIds.includes(slot.id) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const recordingType = track.trackType === 'pianoRoll' ? 'midi' as const : 'audio' as const;
                      void onStopRecording(slot.id, sceneId!, recordingType);
                    }}
                    className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold text-white leading-none animate-pulse"
                    title="Stop overdub recording"
                    aria-label={`Stop overdub on ${getClipLabel(clip, sceneIndex)}`}
                    data-testid={`overdub-stop-${slot.id}`}
                  >
                    <span className="w-1.5 h-1.5 rounded-sm bg-white" />
                    REC
                  </button>
                )}
              </div>
            ) : (() => {
              const isSlotRecording = slot ? recordingSlotIds.includes(slot.id) : false;
              const canRecord = isArmed && slot && sceneId;
              const recordingType = track.trackType === 'pianoRoll' ? 'midi' as const : 'audio' as const;

              if (isSlotRecording && slot && sceneId) {
                // Recording state — show red animated indicator
                return (
                  <button
                    onClick={() => {
                      onSlotClick(sceneIndex);
                      void onStopRecording(slot.id, sceneId, recordingType);
                    }}
                    className={`flex h-24 w-full flex-col items-center justify-center gap-2 rounded-xl border border-red-500 bg-red-500/10 transition-colors ${
                      isSelected ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-[#1b1b1b]' : ''
                    }`}
                    style={{ animation: 'session-blink 800ms ease-in-out infinite' }}
                    aria-label={`Stop recording on ${track.displayName} scene ${sceneIndex + 1}`}
                    data-testid={`recording-slot-${track.id}-${sceneIndex}`}
                    data-slot-id={slot.id}
                    data-track-id={track.id}
                    data-scene-index={sceneIndex}
                  >
                    <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-[10px] uppercase tracking-[0.16em] text-red-300 font-medium">
                      Recording
                    </span>
                    <span className="text-[9px] text-red-400/70">{recordingType === 'midi' ? 'MIDI' : 'Audio'}</span>
                  </button>
                );
              }

              if (canRecord && sceneId) {
                // Armed track + empty slot — show record button
                return (
                  <button
                    onClick={() => {
                      if (dragState) return;
                      onSlotClick(sceneIndex);
                      void onStartRecording(sceneId, slot.id);
                    }}
                    onContextMenu={(e) => handleEmptySlotContextMenu(e, sceneIndex)}
                    className={`flex h-24 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed transition-colors ${
                      isDropTarget
                        ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_0_2px_rgba(59,130,246,0.5)]'
                        : 'border-red-500/50 bg-red-500/5 hover:border-red-500 hover:bg-red-500/10'
                    } ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-[#1b1b1b]' : ''}`}
                    aria-label={`Record ${recordingType} into ${track.displayName} scene ${sceneIndex + 1}`}
                    data-testid={`record-slot-${track.id}-${sceneIndex}`}
                    data-slot-id={slot.id}
                    data-track-id={track.id}
                    data-scene-index={sceneIndex}
                  >
                    <span className="w-4 h-4 rounded-full border-2 border-red-500 flex items-center justify-center">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.16em] text-red-400/80">
                      {recordingType === 'midi' ? 'Rec MIDI' : 'Rec Audio'}
                    </span>
                  </button>
                );
              }

              // Default: stop button or empty slot
              return hasStopButton ? (
                <button
                  onClick={() => {
                    if (dragState) return;
                    onSlotClick(sceneIndex);
                    void onStop();
                  }}
                  onContextMenu={(e) => handleEmptySlotContextMenu(e, sceneIndex)}
                  className={`flex h-24 w-full items-center justify-center rounded-xl border border-dashed transition-colors ${
                    isDropTarget
                      ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_0_2px_rgba(59,130,246,0.5)]'
                      : 'border-[#343434] bg-[#202020] hover:border-[#555] hover:bg-[#272727]'
                  } ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-[#1b1b1b]' : ''}`}
                  aria-label={`Stop ${track.displayName} in scene ${sceneIndex + 1}`}
                  data-testid={`stop-slot-${track.id}-${sceneIndex}`}
                  data-slot-id={slot?.id}
                  data-track-id={track.id}
                  data-scene-index={sceneIndex}
                >
                  <span className="text-zinc-500 text-base leading-none" aria-hidden="true">&#9632;</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (dragState) return;
                    onSlotClick(sceneIndex);
                  }}
                  onContextMenu={(e) => handleEmptySlotContextMenu(e, sceneIndex)}
                  className={`flex h-24 w-full items-center justify-center rounded-xl border border-dashed text-[11px] uppercase tracking-[0.16em] text-zinc-600 cursor-pointer ${
                    isDropTarget
                      ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_0_2px_rgba(59,130,246,0.5)]'
                      : 'border-[#2a2a2a] bg-[#1d1d1d]'
                  } ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-[#1b1b1b]' : ''}`}
                  data-testid={`empty-slot-${track.id}-${sceneIndex}`}
                  data-slot-id={slot?.id}
                  data-track-id={track.id}
                  data-scene-index={sceneIndex}
                  aria-label={`Empty slot, ${track.displayName} scene ${sceneIndex + 1}`}
                >
                  Empty
                </button>
              );
            })()}
          </div>
        );
      })}

      {contextMenu && (
        <ContextMenuWrapper x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)}>
          <ContextMenuItem
            label="AI Fill — Generate Clip"
            onClick={() => {
              onAiFill(contextMenu.trackId, contextMenu.sceneIndex);
              setContextMenu(null);
            }}
          />
          <ContextMenuSeparator />
          <ContextMenuItem
            label={contextMenu.hasStopButton ? 'Remove Stop Button' : 'Add Stop Button'}
            onClick={handleToggleStopButton}
          />
        </ContextMenuWrapper>
      )}
    </>
  );
}
