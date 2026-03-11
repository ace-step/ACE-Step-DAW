import { useCallback } from 'react';
import type { Track } from '../../types/project';
import { useProjectStore } from '../../store/projectStore';
import { Knob } from '../ui/Knob';

interface TrackInspectorProps {
  track: Track;
}

export function TrackInspector({ track }: TrackInspectorProps) {
  const updateTrackMixer = useProjectStore((s) => s.updateTrackMixer);
  const setTrackLocalCaption = useProjectStore((s) => s.setTrackLocalCaption);
  const setTrackReverb = useProjectStore((s) => s.setTrackReverb);

  const eqLow = track.eqLowGain ?? 0;
  const eqMid = track.eqMidGain ?? 0;
  const eqHigh = track.eqHighGain ?? 0;
  const compEnabled = track.compressorEnabled ?? false;
  const compThreshold = track.compressorThreshold ?? -24;
  const compRatio = track.compressorRatio ?? 4;
  const reverbMix = track.reverbMix ?? 0;
  const reverbRoom = track.reverbRoomSize ?? 0.5;

  const handleReverbChange = useCallback((mix: number, room: number) => {
    setTrackReverb(track.id, mix, room);
  }, [track.id, setTrackReverb]);

  return (
    <div className="bg-zinc-950 border-b border-daw-border text-[10px] text-zinc-400 select-none overflow-y-auto" style={{ height: 220 }}>
      <div className="px-3 py-2 space-y-3">
      {/* Local caption */}
      <div>
        <label className="block font-medium uppercase tracking-wide text-zinc-500 mb-1">
          Local Caption
        </label>
        <input
          type="text"
          value={track.localCaption ?? ''}
          onChange={(e) => setTrackLocalCaption(track.id, e.target.value)}
          placeholder={track.displayName}
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[10px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-daw-accent"
        />
        <p className="text-[9px] text-zinc-600 mt-0.5">Defaults to track name if empty</p>
      </div>

      {/* EQ */}
      <div>
        <div className="font-medium uppercase tracking-wide text-zinc-500 mb-1">EQ</div>
        <div className="flex items-end gap-3 justify-center">
          <div className="flex flex-col items-center gap-0.5">
            <Knob
              value={eqLow}
              min={-15}
              max={15}
              defaultValue={0}
              step={0.5}
              size={28}
              onChange={(v) => updateTrackMixer(track.id, { eqLowGain: v })}
            />
            <span className="text-[9px]">{eqLow > 0 ? '+' : ''}{eqLow.toFixed(0)}</span>
            <span className="text-[9px] text-zinc-600">Lo</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <Knob
              value={eqMid}
              min={-15}
              max={15}
              defaultValue={0}
              step={0.5}
              size={28}
              onChange={(v) => updateTrackMixer(track.id, { eqMidGain: v })}
            />
            <span className="text-[9px]">{eqMid > 0 ? '+' : ''}{eqMid.toFixed(0)}</span>
            <span className="text-[9px] text-zinc-600">Mid</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <Knob
              value={eqHigh}
              min={-15}
              max={15}
              defaultValue={0}
              step={0.5}
              size={28}
              onChange={(v) => updateTrackMixer(track.id, { eqHighGain: v })}
            />
            <span className="text-[9px]">{eqHigh > 0 ? '+' : ''}{eqHigh.toFixed(0)}</span>
            <span className="text-[9px] text-zinc-600">Hi</span>
          </div>
        </div>
      </div>

      {/* Compressor */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="font-medium uppercase tracking-wide text-zinc-500">Comp</div>
          <button
            onClick={() => updateTrackMixer(track.id, { compressorEnabled: !compEnabled })}
            className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors ${
              compEnabled
                ? 'bg-orange-600 text-white'
                : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {compEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
        <div className={`flex items-end gap-3 justify-center transition-opacity ${compEnabled ? '' : 'opacity-40'}`}>
          <div className="flex flex-col items-center gap-0.5">
            <Knob
              value={compThreshold}
              min={-60}
              max={0}
              defaultValue={-24}
              step={1}
              size={28}
              onChange={(v) => updateTrackMixer(track.id, { compressorThreshold: v })}
              disabled={!compEnabled}
            />
            <span className="text-[9px]">{compThreshold}dB</span>
            <span className="text-[9px] text-zinc-600">Thr</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <Knob
              value={compRatio}
              min={1}
              max={20}
              defaultValue={4}
              step={0.5}
              size={28}
              onChange={(v) => updateTrackMixer(track.id, { compressorRatio: v })}
              disabled={!compEnabled}
            />
            <span className="text-[9px]">{compRatio.toFixed(1)}:1</span>
            <span className="text-[9px] text-zinc-600">Ratio</span>
          </div>
        </div>
      </div>

      {/* Reverb */}
      <div>
        <div className="font-medium uppercase tracking-wide text-zinc-500 mb-1">Reverb</div>
        <div className="flex items-end gap-3 justify-center">
          <div className="flex flex-col items-center gap-0.5">
            <Knob
              value={reverbMix}
              min={0}
              max={1}
              defaultValue={0}
              step={0.01}
              size={28}
              onChange={(v) => handleReverbChange(v, reverbRoom)}
            />
            <span className="text-[9px]">{Math.round(reverbMix * 100)}%</span>
            <span className="text-[9px] text-zinc-600">Mix</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <Knob
              value={reverbRoom}
              min={0}
              max={1}
              defaultValue={0.5}
              step={0.01}
              size={28}
              onChange={(v) => handleReverbChange(reverbMix, v)}
            />
            <span className="text-[9px]">{Math.round(reverbRoom * 100)}%</span>
            <span className="text-[9px] text-zinc-600">Room</span>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
