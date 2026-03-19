import { useCallback, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import type { PatternRole, PatternGenre, PatternOptions } from '../../utils/midiPatternGenerator';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

const ROLE_OPTIONS: { label: string; value: PatternRole }[] = [
  { label: 'Melody', value: 'melody' },
  { label: 'Chords', value: 'chords' },
  { label: 'Bass', value: 'bass' },
  { label: 'Arpeggio', value: 'arp' },
];

const GENRE_OPTIONS: { label: string; value: PatternGenre }[] = [
  { label: 'Pop', value: 'pop' },
  { label: 'Rock', value: 'rock' },
  { label: 'Jazz', value: 'jazz' },
  { label: 'Electronic', value: 'electronic' },
  { label: 'Hip Hop', value: 'hiphop' },
  { label: 'Classical', value: 'classical' },
];

const SCALE_OPTIONS = [
  { label: 'Major', value: 'major' },
  { label: 'Minor', value: 'minor' },
  { label: 'Dorian', value: 'dorian' },
  { label: 'Mixolydian', value: 'mixolydian' },
  { label: 'Pentatonic', value: 'pentatonic' },
  { label: 'Minor Pentatonic', value: 'minor-pentatonic' },
  { label: 'Blues', value: 'blues' },
];

const BAR_OPTIONS = [1, 2, 4, 8];

export function GeneratePatternDialog() {
  const show = useUIStore((s) => s.showGeneratePatternDialog);
  const clipId = useUIStore((s) => s.generatePatternClipId);
  const setShow = useUIStore((s) => s.setShowGeneratePatternDialog);
  const populateMidiPattern = useProjectStore((s) => s.populateMidiPattern);
  const project = useProjectStore((s) => s.project);

  const [role, setRole] = useState<PatternRole>('melody');
  const [genre, setGenre] = useState<PatternGenre>('pop');
  const [root, setRoot] = useState(0);
  const [scale, setScale] = useState('major');
  const [bars, setBars] = useState(4);
  const [density, setDensity] = useState(0.5);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100000));

  const handleGenerate = useCallback(() => {
    if (!clipId) return;
    const options: PatternOptions = {
      role,
      genre,
      root,
      scale,
      bars,
      density,
      beatsPerBar: project?.timeSignature ?? 4,
      seed,
    };
    populateMidiPattern(clipId, options);
  }, [clipId, role, genre, root, scale, bars, density, seed, project, populateMidiPattern]);

  const handleRegenerate = useCallback(() => {
    setSeed(Math.floor(Math.random() * 100000));
  }, []);

  const handleAcceptAndClose = useCallback(() => {
    setShow(false);
  }, [setShow]);

  const handleCancel = useCallback(() => {
    setShow(false);
  }, [setShow]);

  if (!show || !clipId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && handleCancel()}
    >
      <div
        className="w-[400px] bg-daw-surface rounded-lg border border-daw-border shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); handleGenerate(); }
          if (e.key === 'Escape') handleCancel();
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border">
          <h2 className="text-sm font-semibold text-zinc-100">Generate Pattern</h2>
          <button
            onClick={handleCancel}
            className="text-zinc-500 hover:text-zinc-200 transition-colors text-lg leading-none"
            aria-label="Close generate pattern dialog"
          >
            x
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-4">
          {/* Role */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-zinc-400">Role</label>
            <div className="flex gap-1">
              {ROLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setRole(opt.value)}
                  className={`px-2.5 py-1 rounded text-[11px] transition-colors ${
                    role === opt.value
                      ? 'bg-violet-600/60 text-violet-100'
                      : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Genre */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-zinc-400">Genre</label>
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value as PatternGenre)}
              className="bg-[#111] border border-[#333] rounded px-2 py-1 text-[11px] text-zinc-300 w-36"
            >
              {GENRE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Key / Root */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-zinc-400">Key</label>
            <select
              value={root}
              onChange={(e) => setRoot(Number(e.target.value))}
              className="bg-[#111] border border-[#333] rounded px-2 py-1 text-[11px] text-zinc-300 w-24"
            >
              {NOTE_NAMES.map((name, i) => (
                <option key={i} value={i}>{name}</option>
              ))}
            </select>
          </div>

          {/* Scale */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-zinc-400">Scale</label>
            <select
              value={scale}
              onChange={(e) => setScale(e.target.value)}
              className="bg-[#111] border border-[#333] rounded px-2 py-1 text-[11px] text-zinc-300 w-36"
            >
              {SCALE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Bars */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-zinc-400">Length (bars)</label>
            <div className="flex gap-1">
              {BAR_OPTIONS.map((b) => (
                <button
                  key={b}
                  onClick={() => setBars(b)}
                  className={`px-2.5 py-1 rounded text-[11px] transition-colors min-w-[32px] ${
                    bars === b
                      ? 'bg-violet-600/60 text-violet-100'
                      : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          {/* Density */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-zinc-400">Density</label>
              <span className="text-[11px] text-zinc-300 tabular-nums w-10 text-right">
                {Math.round(density * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(density * 100)}
              onChange={(e) => setDensity(Number(e.target.value) / 100)}
              className="w-full h-1.5 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-violet-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-daw-border">
          <button
            onClick={handleRegenerate}
            className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-white/5 hover:bg-white/10 rounded transition-colors"
            title="Generate with a new random seed"
          >
            Regenerate
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-white/5 hover:bg-white/10 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => { handleGenerate(); handleAcceptAndClose(); }}
              className="px-3 py-1.5 text-xs text-white bg-violet-600 hover:bg-violet-500 rounded transition-colors"
            >
              Generate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
