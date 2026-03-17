import { useState, useCallback, useRef, useEffect } from 'react';
import type { Track, TrackType } from '../../types/project';
import { useProjectStore } from '../../store/projectStore';
import { TRACK_CATALOG, TRACK_TYPE_CATALOG } from '../../constants/tracks';
import { Knob } from '../ui/Knob';

interface TrackEditModalProps {
  track: Track;
  onClose: () => void;
}

export function TrackEditModal({ track, onClose }: TrackEditModalProps) {
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const renameTrack = useProjectStore((s) => s.renameTrack);
  const removeTrack = useProjectStore((s) => s.removeTrack);
  const updateTrackMixer = useProjectStore((s) => s.updateTrackMixer);
  const setTrackLocalCaption = useProjectStore((s) => s.setTrackLocalCaption);
  const setTrackReverb = useProjectStore((s) => s.setTrackReverb);

  const [name, setName] = useState(track.displayName);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const commitName = useCallback(() => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== track.displayName) {
      renameTrack(track.id, trimmed);
    }
  }, [name, track.displayName, track.id, renameTrack]);

  const handleDelete = useCallback(() => {
    removeTrack(track.id);
    onClose();
  }, [track.id, removeTrack, onClose]);

  const info = TRACK_CATALOG[track.trackName];
  const typeInfo = TRACK_TYPE_CATALOG[track.trackType ?? 'stems'];

  const eqLow = track.eqLowGain ?? 0;
  const eqMid = track.eqMidGain ?? 0;
  const eqHigh = track.eqHighGain ?? 0;
  const compEnabled = track.compressorEnabled ?? false;
  const compThreshold = track.compressorThreshold ?? -24;
  const compRatio = track.compressorRatio ?? 4;
  const reverbMix = track.reverbMix ?? 0;
  const reverbRoom = track.reverbRoomSize ?? 0.5;
  const pan = track.pan ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-[420px] max-h-[85vh] bg-daw-surface rounded-lg border border-daw-border shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">{info.emoji}</span>
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded"
              style={{ backgroundColor: typeInfo.color + '25', color: typeInfo.color }}
            >
              {typeInfo.label}
            </span>
            <h2 className="text-sm font-medium text-zinc-200">Edit Track</h2>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg leading-none">×</button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {/* Track Name */}
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wide text-zinc-500 mb-1">Track Name</label>
            <input
              ref={nameInputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => { if (e.key === 'Enter') { commitName(); (e.target as HTMLInputElement).blur(); } }}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500/60"
            />
          </div>

          {/* Track Type */}
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wide text-zinc-500 mb-1">Track Type</label>
            <div className="flex gap-1.5">
              {(['stems', 'sample', 'sequencer', 'pianoRoll'] as TrackType[]).map((tt) => {
                const tti = TRACK_TYPE_CATALOG[tt];
                const isActive = (track.trackType ?? 'stems') === tt;
                const comingSoon = tt === 'pianoRoll';
                return (
                  <button
                    key={tt}
                    onClick={() => {
                      if (!comingSoon) updateTrack(track.id, { trackType: tt });
                    }}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                      isActive
                        ? 'ring-1 ring-offset-1 ring-offset-transparent'
                        : comingSoon
                          ? 'opacity-40 cursor-not-allowed'
                          : 'hover:bg-zinc-700'
                    }`}
                    style={{
                      backgroundColor: isActive ? tti.color + '25' : undefined,
                      color: isActive ? tti.color : undefined,
                      ...(isActive ? { '--tw-ring-color': tti.color } as React.CSSProperties : {}),
                    }}
                    title={comingSoon ? 'Coming soon' : tti.label}
                  >
                    <span>{tti.emoji}</span>
                    <span>{tti.abbr}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Volume + Pan + Mute/Solo */}
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wide text-zinc-500 mb-1">Volume & Pan</label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={Math.round(track.volume * 100)}
                  onChange={(e) => updateTrack(track.id, { volume: parseInt(e.target.value) / 100 })}
                  className="w-full h-1.5"
                  title={`Volume: ${Math.round(track.volume * 100)}%`}
                />
                <div className="text-[9px] text-zinc-500 mt-0.5">Vol: {Math.round(track.volume * 100)}%</div>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <Knob
                  value={pan}
                  min={-1}
                  max={1}
                  defaultValue={0}
                  step={0.01}
                  size={30}
                  onChange={(v) => updateTrackMixer(track.id, { pan: v })}
                />
                <span className="text-[9px] text-zinc-500">
                  {pan === 0 ? 'C' : pan < 0 ? `L${Math.round(Math.abs(pan) * 100)}` : `R${Math.round(pan * 100)}`}
                </span>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => updateTrack(track.id, { muted: !track.muted })}
                  className={`w-7 h-6 text-[10px] font-bold rounded transition-colors ${
                    track.muted ? 'bg-amber-600 text-white' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  M
                </button>
                <button
                  onClick={() => updateTrack(track.id, { soloed: !track.soloed })}
                  className={`w-7 h-6 text-[10px] font-bold rounded transition-colors ${
                    track.soloed ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  S
                </button>
              </div>
            </div>
          </div>

          {/* Local Caption */}
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wide text-zinc-500 mb-1">Local Caption</label>
            <input
              type="text"
              value={track.localCaption ?? ''}
              onChange={(e) => setTrackLocalCaption(track.id, e.target.value)}
              placeholder={track.displayName}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500/60"
            />
            <p className="text-[9px] text-zinc-600 mt-0.5">Defaults to track name if empty</p>
          </div>

          {/* EQ */}
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wide text-zinc-500 mb-2">EQ</label>
            <div className="flex items-end gap-5 justify-center">
              <div className="flex flex-col items-center gap-1">
                <Knob value={eqLow} min={-15} max={15} defaultValue={0} step={0.5} size={32} onChange={(v) => updateTrackMixer(track.id, { eqLowGain: v })} />
                <span className="text-[9px] text-zinc-400">{eqLow > 0 ? '+' : ''}{eqLow.toFixed(0)} dB</span>
                <span className="text-[9px] text-zinc-600">Low</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Knob value={eqMid} min={-15} max={15} defaultValue={0} step={0.5} size={32} onChange={(v) => updateTrackMixer(track.id, { eqMidGain: v })} />
                <span className="text-[9px] text-zinc-400">{eqMid > 0 ? '+' : ''}{eqMid.toFixed(0)} dB</span>
                <span className="text-[9px] text-zinc-600">Mid</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Knob value={eqHigh} min={-15} max={15} defaultValue={0} step={0.5} size={32} onChange={(v) => updateTrackMixer(track.id, { eqHighGain: v })} />
                <span className="text-[9px] text-zinc-400">{eqHigh > 0 ? '+' : ''}{eqHigh.toFixed(0)} dB</span>
                <span className="text-[9px] text-zinc-600">High</span>
              </div>
            </div>
          </div>

          {/* Compressor */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Compressor</label>
              <button
                onClick={() => updateTrackMixer(track.id, { compressorEnabled: !compEnabled })}
                className={`px-2 py-0.5 rounded text-[9px] font-bold transition-colors ${
                  compEnabled ? 'bg-orange-600 text-white' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {compEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className={`flex items-end gap-5 justify-center transition-opacity ${compEnabled ? '' : 'opacity-40'}`}>
              <div className="flex flex-col items-center gap-1">
                <Knob value={compThreshold} min={-60} max={0} defaultValue={-24} step={1} size={32} onChange={(v) => updateTrackMixer(track.id, { compressorThreshold: v })} disabled={!compEnabled} />
                <span className="text-[9px] text-zinc-400">{compThreshold} dB</span>
                <span className="text-[9px] text-zinc-600">Threshold</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Knob value={compRatio} min={1} max={20} defaultValue={4} step={0.5} size={32} onChange={(v) => updateTrackMixer(track.id, { compressorRatio: v })} disabled={!compEnabled} />
                <span className="text-[9px] text-zinc-400">{compRatio.toFixed(1)}:1</span>
                <span className="text-[9px] text-zinc-600">Ratio</span>
              </div>
            </div>
          </div>

          {/* Reverb */}
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wide text-zinc-500 mb-2">Reverb</label>
            <div className="flex items-end gap-5 justify-center">
              <div className="flex flex-col items-center gap-1">
                <Knob value={reverbMix} min={0} max={1} defaultValue={0} step={0.01} size={32} onChange={(v) => setTrackReverb(track.id, v, reverbRoom)} />
                <span className="text-[9px] text-zinc-400">{Math.round(reverbMix * 100)}%</span>
                <span className="text-[9px] text-zinc-600">Mix</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Knob value={reverbRoom} min={0} max={1} defaultValue={0.5} step={0.01} size={32} onChange={(v) => setTrackReverb(track.id, reverbMix, v)} />
                <span className="text-[9px] text-zinc-400">{Math.round(reverbRoom * 100)}%</span>
                <span className="text-[9px] text-zinc-600">Room</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-daw-border shrink-0">
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 text-xs text-red-400 hover:bg-red-900/30 rounded transition-colors"
          >
            Delete Track
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
