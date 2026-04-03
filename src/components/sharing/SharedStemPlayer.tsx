import { useEffect, useMemo, useRef, useState } from 'react';
import type { SharedProjectRecord } from '../../services/cloudStorageService';

interface StemPlaybackState {
  trackId: string;
  muted: boolean;
  soloed: boolean;
  volume: number;
}

function formatTime(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function SharedStemPlayer({ sharedProject }: { sharedProject: SharedProjectRecord }) {
  const audioMapRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [trackStates, setTrackStates] = useState<StemPlaybackState[]>(
    () =>
      sharedProject.stems.map((stem) => ({
        trackId: stem.trackId,
        muted: false,
        soloed: false,
        volume: stem.volume,
      })),
  );

  const anySoloed = useMemo(
    () => trackStates.some((track) => track.soloed),
    [trackStates],
  );

  useEffect(() => {
    const audioMap = new Map<string, HTMLAudioElement>();
    for (const stem of sharedProject.stems) {
      const audio = document.createElement('audio');
      audio.src = stem.audioDataUrl;
      audio.preload = 'auto';
      audioMap.set(stem.trackId, audio);
    }

    const primaryAudio = audioMap.values().next().value as HTMLAudioElement | undefined;
    const handleTimeUpdate = () => {
      setCurrentTime(primaryAudio?.currentTime ?? 0);
    };

    primaryAudio?.addEventListener?.('timeupdate', handleTimeUpdate);
    audioMapRef.current = audioMap;

    return () => {
      primaryAudio?.removeEventListener?.('timeupdate', handleTimeUpdate);
      for (const audio of audioMap.values()) {
        audio.pause();
      }
      audioMapRef.current.clear();
    };
  }, [sharedProject]);

  useEffect(() => {
    for (const trackState of trackStates) {
      const audio = audioMapRef.current.get(trackState.trackId);
      if (!audio) {
        continue;
      }

      const shouldMute = trackState.muted || (anySoloed && !trackState.soloed);
      audio.muted = shouldMute;
      audio.volume = trackState.volume;
    }
  }, [anySoloed, trackStates]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
        return;
      }

      if (event.code === 'Space') {
        event.preventDefault();
        if (isPlaying) {
          void pauseAll();
        } else {
          void playAll();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying]);

  async function playAll() {
    const audios = Array.from(audioMapRef.current.values());
    const nextTime = audioMapRef.current.values().next().value?.currentTime ?? currentTime;

    for (const audio of audios) {
      audio.currentTime = nextTime;
    }

    await Promise.all(audios.map((audio) => audio.play()));
    setIsPlaying(true);
  }

  async function pauseAll() {
    for (const audio of audioMapRef.current.values()) {
      audio.pause();
    }
    setCurrentTime(audioMapRef.current.values().next().value?.currentTime ?? currentTime);
    setIsPlaying(false);
  }

  function updateTrack(trackId: string, updater: (track: StemPlaybackState) => StemPlaybackState) {
    setTrackStates((current) =>
      current.map((track) => (track.trackId === trackId ? updater(track) : track)),
    );
  }

  return (
    <div className="w-full max-w-5xl rounded-[28px] border border-white/10 bg-[#11161d]/95 p-6 text-white shadow-2xl shadow-black/30 backdrop-blur">
      <div className="flex flex-col gap-4 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Shared Project</p>
          <h1 className="text-3xl font-semibold">{sharedProject.project.name}</h1>
          <p className="text-sm text-zinc-300">
            {sharedProject.stems.length} stem{sharedProject.stems.length === 1 ? '' : 's'} by {sharedProject.owner}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (isPlaying) {
                void pauseAll();
              } else {
                void playAll();
              }
            }}
            aria-label={isPlaying ? 'Pause shared project' : 'Play shared project'}
            className="rounded-full bg-cyan-400 px-5 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-300"
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200 tabular-nums">
            {formatTime(currentTime)}
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {sharedProject.stems.map((stem) => {
          const trackState = trackStates.find((track) => track.trackId === stem.trackId);
          if (!trackState) {
            return null;
          }

          return (
            <section
              key={stem.trackId}
              className="rounded-2xl border border-white/8 bg-white/4 px-4 py-4"
              aria-label={`${stem.trackName} stem`}
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: stem.color }}
                      aria-hidden="true"
                    />
                    <h2 className="text-lg font-medium">{stem.trackName}</h2>
                  </div>
                  {stem.lyrics && (
                    <p className="max-w-2xl whitespace-pre-wrap text-sm leading-6 text-zinc-300">
                      {stem.lyrics}
                    </p>
                  )}
                </div>

                <div className="flex min-w-[260px] flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateTrack(stem.trackId, (track) => ({ ...track, muted: !track.muted }))
                      }
                      aria-label={`${trackState.muted ? 'Unmute' : 'Mute'} ${stem.trackName}`}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        trackState.muted
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-white/8 text-white hover:bg-white/12'
                      }`}
                    >
                      {trackState.muted ? 'Muted' : 'Mute'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateTrack(stem.trackId, (track) => ({ ...track, soloed: !track.soloed }))
                      }
                      aria-label={`${trackState.soloed ? 'Unsolo' : 'Solo'} ${stem.trackName}`}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        trackState.soloed
                          ? 'bg-emerald-400 text-slate-950'
                          : 'bg-white/8 text-white hover:bg-white/12'
                      }`}
                    >
                      {trackState.soloed ? 'Soloed' : 'Solo'}
                    </button>
                  </div>

                  <label className="flex items-center gap-3 text-xs font-medium text-zinc-300">
                    <span className="w-14 uppercase tracking-[0.18em] text-zinc-400">Level</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={trackState.volume}
                      onChange={(event) =>
                        updateTrack(stem.trackId, (track) => ({
                          ...track,
                          volume: Number(event.target.value),
                        }))
                      }
                      aria-label={`${stem.trackName} volume`}
                      className="w-full accent-cyan-300"
                    />
                    <span className="w-10 text-right text-zinc-200 tabular-nums">
                      {Math.round(trackState.volume * 100)}
                    </span>
                  </label>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
