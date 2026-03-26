import { useProjectStore } from '../../store/projectStore';
import { useTransportStore } from '../../store/transportStore';
import { useUIStore } from '../../store/uiStore';
import { useTransport } from '../../hooks/useTransport';
import type { Clip, Track, SessionLaunchQuantization, SessionClipSlot } from '../../types/project';

const SESSION_QUANTIZATION_OPTIONS: SessionLaunchQuantization[] = [
  'none', '1/32', '1/16', '1/8', '1/4', '1/2', '1 bar', '2 bars', '4 bars', '8 bars',
];

const SLOT_QUANTIZATION_OPTIONS: Array<'global' | SessionLaunchQuantization> = [
  'global', ...SESSION_QUANTIZATION_OPTIONS,
];

function isPlayableClip(clip: Clip): boolean {
  return clip.generationStatus === 'ready' || (clip.midiData?.notes.length ?? 0) > 0;
}

function getSessionClips(track: Track): Clip[] {
  return [...track.clips]
    .filter(isPlayableClip)
    .sort((a, b) => a.startTime - b.startTime);
}

function getClipLabel(clip: Clip, index: number): string {
  if (clip.prompt.trim()) return clip.prompt.trim();
  if ((clip.midiData?.notes.length ?? 0) > 0) return `MIDI ${index + 1}`;
  return `Clip ${index + 1}`;
}

export function SessionView() {
  const project = useProjectStore((s) => s.project);
  const setSessionLaunchQuantization = useProjectStore((s) => s.setSessionLaunchQuantization);
  const setSessionSlotQuantization = useProjectStore((s) => s.setSessionSlotQuantization);
  const launchedSessionClips = useTransportStore((s) => s.launchedSessionClips);
  const sessionArrangementRecording = useTransportStore((s) => s.sessionArrangementRecording);
  const setMainView = useUIStore((s) => s.setMainView);
  const {
    launchSessionClip,
    stopSessionTrack,
    stopAllSessionClips,
    launchSessionScene,
    toggleSessionArrangementRecording,
  } = useTransport();

  if (!project) {
    return <div className="flex-1 min-w-0 bg-[#202020]" />;
  }

  const tracks = [...project.tracks].sort((a, b) => a.order - b.order);
  const sceneCount = Math.max(4, ...tracks.map((track) => getSessionClips(track).length));
  const sessionQuantization = project.session?.quantization ?? '1 bar';
  const sessionSlots = project.session?.slots ?? [];

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
              activeClipId={activeLaunch?.clipId ?? null}
              onLaunch={(clipId, sceneIndex) => launchSessionClip(track.id, clipId, sceneIndex)}
              onStop={() => stopSessionTrack(track.id)}
              onSlotQuantizationChange={(slotId, q) => setSessionSlotQuantization(slotId, q)}
            />
          );
        })}
      </div>
    </div>
  );
}

function FragmentRow({
  track,
  sessionClips,
  sessionSlots,
  sceneCount,
  activeClipId,
  onLaunch,
  onStop,
  onSlotQuantizationChange,
}: {
  track: Track;
  sessionClips: Clip[];
  sessionSlots: SessionClipSlot[];
  sceneCount: number;
  activeClipId: string | null;
  onLaunch: (clipId: string, sceneIndex: number) => void | Promise<void>;
  onStop: () => void | Promise<void>;
  onSlotQuantizationChange: (slotId: string, quantization: 'global' | SessionLaunchQuantization) => void;
}) {
  const trackSlots = sessionSlots.filter((s) => s.trackId === track.id);

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
        // Find matching slot to show per-clip quantization badge
        const matchingSlot = trackSlots.find((s) => s.clipId === clip?.id);
        const slotQuantization = matchingSlot?.quantization;
        const hasOverride = slotQuantization && slotQuantization !== 'global';

        return (
          <div key={`${track.id}-${sceneIndex}`} className="border-r border-b border-[#2e2e2e] bg-[#1b1b1b] p-2">
            {clip ? (
              <div className="relative">
                <button
                  onClick={() => void onLaunch(clip.id, sceneIndex)}
                  className={`flex h-24 w-full flex-col justify-between rounded-xl border px-3 py-2 text-left transition-all ${
                    isActive
                      ? 'border-emerald-400 bg-emerald-500/20 shadow-[0_0_0_1px_rgba(74,222,128,0.35)]'
                      : 'border-[#3a3a3a] bg-[#262626] hover:border-daw-accent hover:bg-[#2f2f2f]'
                  }`}
                  aria-label={`Launch ${getClipLabel(clip, sceneIndex)} on ${track.displayName} in scene ${sceneIndex + 1}`}
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
                    <span className={isActive ? 'text-emerald-300' : ''}>{isActive ? 'LIVE' : `Start ${clip.startTime.toFixed(1)}s`}</span>
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
            ) : (
              <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-[#343434] bg-[#202020] text-[11px] uppercase tracking-[0.16em] text-zinc-600">
                Empty
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
