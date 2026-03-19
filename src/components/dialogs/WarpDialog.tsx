import { useState, useEffect } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { calcTempoMatchRate } from '../../utils/warp';
import type { Clip } from '../../types/project';

interface WarpDialogProps {
  clip: Clip;
  projectBpm: number;
  onClose: () => void;
}

export function WarpDialog({ clip, projectBpm, onClose }: WarpDialogProps) {
  const setClipSourceBpm = useProjectStore((s) => s.setClipSourceBpm);
  const setClipTimeStretch = useProjectStore((s) => s.setClipTimeStretch);
  const setClipStretchMode = useProjectStore((s) => s.setClipStretchMode);
  const tempoMatchClip = useProjectStore((s) => s.tempoMatchClip);

  const [sourceBpm, setSourceBpm] = useState(clip.sourceBpm ?? 0);
  const [manualRate, setManualRate] = useState(clip.timeStretchRate ?? 1);
  const [mode, setMode] = useState<'repitch' | 'basic'>(clip.stretchMode ?? 'repitch');

  // Inferred BPM from audio analysis (if available)
  const inferredBpm = clip.inferredMetas?.bpm;

  useEffect(() => {
    if (sourceBpm <= 0 && inferredBpm && inferredBpm > 0) {
      setSourceBpm(inferredBpm);
    }
  }, [inferredBpm, sourceBpm]);

  const previewRate = sourceBpm > 0
    ? calcTempoMatchRate(sourceBpm, projectBpm)
    : manualRate;

  const handleTempoMatch = () => {
    if (sourceBpm > 0) {
      setClipSourceBpm(clip.id, sourceBpm);
      setClipStretchMode(clip.id, mode);
      tempoMatchClip(clip.id);
    }
    onClose();
  };

  const handleManualRate = () => {
    setClipTimeStretch(clip.id, manualRate);
    setClipStretchMode(clip.id, mode);
    onClose();
  };

  const handleReset = () => {
    setClipTimeStretch(clip.id, 1);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />
      <div
        className="fixed z-50 bg-[#2a2a2a] border border-[#555] rounded-lg shadow-2xl p-4 min-w-[320px]"
        style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
      >
        <h3 className="text-sm font-semibold text-zinc-100 mb-3">
          Warp / Time-Stretch
        </h3>

        {/* Stretch Mode */}
        <div className="mb-3">
          <label className="text-[11px] text-zinc-400 block mb-1">Mode</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as 'repitch' | 'basic')}
            className="w-full bg-[#383838] border border-[#555] rounded px-2 py-1 text-[11px] text-zinc-200"
          >
            <option value="repitch">Re-Pitch (changes pitch with speed)</option>
            <option value="basic">Basic (pitch-preserving — coming soon)</option>
          </select>
        </div>

        {/* Tempo Match section */}
        <div className="mb-3 p-2 bg-[#333] rounded border border-[#444]">
          <label className="text-[11px] text-zinc-400 block mb-1">
            Source BPM
            {inferredBpm ? ` (detected: ${inferredBpm})` : ''}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={20}
              max={300}
              step={0.1}
              value={sourceBpm || ''}
              onChange={(e) => setSourceBpm(Number(e.target.value))}
              placeholder="e.g. 120"
              className="w-20 bg-[#2a2a2a] border border-[#555] rounded px-2 py-1 text-[11px] text-zinc-200"
            />
            <span className="text-[10px] text-zinc-500">
              Project: {projectBpm} BPM
            </span>
            {sourceBpm > 0 && (
              <span className="text-[10px] text-cyan-400">
                Rate: {previewRate.toFixed(3)}x
              </span>
            )}
          </div>
          <button
            onClick={handleTempoMatch}
            disabled={sourceBpm <= 0}
            className="mt-2 w-full px-3 py-1.5 text-[11px] bg-cyan-700 hover:bg-cyan-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded transition-colors"
          >
            Match to Project Tempo
          </button>
        </div>

        {/* Manual Rate */}
        <div className="mb-3 p-2 bg-[#333] rounded border border-[#444]">
          <label className="text-[11px] text-zinc-400 block mb-1">
            Manual Playback Rate
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0.1}
              max={4}
              step={0.01}
              value={manualRate}
              onChange={(e) => setManualRate(Number(e.target.value))}
              className="w-20 bg-[#2a2a2a] border border-[#555] rounded px-2 py-1 text-[11px] text-zinc-200"
            />
            <span className="text-[10px] text-zinc-500">
              {manualRate > 1 ? 'faster' : manualRate < 1 ? 'slower' : 'original'}
            </span>
          </div>
          <button
            onClick={handleManualRate}
            className="mt-2 w-full px-3 py-1.5 text-[11px] bg-violet-700 hover:bg-violet-600 text-white rounded transition-colors"
          >
            Apply Manual Rate
          </button>
        </div>

        {/* Current state info */}
        {(clip.timeStretchRate != null && clip.timeStretchRate !== 1) && (
          <div className="mb-3 text-[10px] text-amber-400">
            Current stretch: {clip.timeStretchRate?.toFixed(3)}x
            {clip.sourceBpm ? ` (source: ${clip.sourceBpm} BPM)` : ''}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between">
          <button
            onClick={handleReset}
            className="px-3 py-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Reset to Original
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
