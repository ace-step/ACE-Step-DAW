import { useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { SessionMixerStrip } from './SessionMixerStrip';

interface SessionMixerProps {
  visible: boolean;
  onToggle: () => void;
}

export function SessionMixer({ visible, onToggle }: SessionMixerProps) {
  const project = useProjectStore((s) => s.project);
  const updateTrack = useProjectStore((s) => s.updateTrack);

  const handleVolumeChange = useCallback((trackId: string, volume: number) => {
    updateTrack(trackId, { volume });
  }, [updateTrack]);

  const handlePanChange = useCallback((trackId: string, pan: number) => {
    // updateTrackMixer handles pan updates
    useProjectStore.getState().updateTrackMixer(trackId, { pan });
  }, []);

  const handleMuteToggle = useCallback((trackId: string, currentMuted: boolean) => {
    updateTrack(trackId, { muted: !currentMuted });
  }, [updateTrack]);

  const handleSoloToggle = useCallback((trackId: string, currentSoloed: boolean) => {
    updateTrack(trackId, { soloed: !currentSoloed });
  }, [updateTrack]);

  if (!project) return null;

  const tracks = [...project.tracks].sort((a, b) => a.order - b.order);

  return (
    <div data-testid="session-mixer">
      {/* Toggle button */}
      <div className="flex items-center justify-center border-t border-[#333]">
        <button
          onClick={onToggle}
          className="w-full py-1 text-[10px] uppercase tracking-[0.16em] text-zinc-500 hover:text-zinc-300 hover:bg-[#252525] transition-colors"
          aria-label={visible ? 'Hide session mixer' : 'Show session mixer'}
          title={visible ? 'Hide Mixer' : 'Show Mixer'}
        >
          {visible ? 'Hide Mixer' : 'Show Mixer'}
        </button>
      </div>

      {/* Mixer strips container */}
      <div
        className="overflow-hidden transition-[height,opacity] duration-150 ease-out"
        style={{
          height: visible ? `${tracks.length * 40}px` : '0px',
          opacity: visible ? 1 : 0,
        }}
      >
        {tracks.map((track) => (
          <SessionMixerStrip
            key={track.id}
            trackId={track.id}
            trackName={track.displayName}
            trackColor={track.color}
            volume={track.volume}
            pan={track.pan ?? 0}
            muted={track.muted}
            soloed={track.soloed}
            onVolumeChange={(v) => handleVolumeChange(track.id, v)}
            onPanChange={(v) => handlePanChange(track.id, v)}
            onMuteToggle={() => handleMuteToggle(track.id, track.muted)}
            onSoloToggle={() => handleSoloToggle(track.id, track.soloed)}
          />
        ))}
      </div>
    </div>
  );
}
