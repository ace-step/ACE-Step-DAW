import { useState, useEffect, useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';
import { useUIStore } from '../../store/uiStore';
import { generateVocal2BGM } from '../../services/generationPipeline';
import { GENERATION_PRESETS, PRESET_CATEGORIES } from '../../constants/generationPresets';
import type { GenerationPreset } from '../../constants/generationPresets';

export function Vocal2BGMModal() {
  const vocal2bgmClipId = useUIStore((s) => s.vocal2bgmClipId);
  const setVocal2BGMModal = useUIStore((s) => s.setVocal2BGMModal);
  const isGenerating = useGenerationStore((s) => s.isGenerating);
  const getClipById = useProjectStore((s) => s.getClipById);
  const project = useProjectStore((s) => s.project);

  const clip = vocal2bgmClipId ? getClipById(vocal2bgmClipId) : null;
  const track = project?.tracks.find((t) => t.clips.some((c) => c.id === vocal2bgmClipId)) ?? null;

  const [caption, setCaption] = useState('');
  const [targetTrackId, setTargetTrackId] = useState('');
  const [bpmMode, setBpmMode] = useState<'project' | 'auto'>('project');
  const [keyMode, setKeyMode] = useState<'project' | 'auto'>('project');
  const [presetCategory, setPresetCategory] = useState<string>('');

  // Reset form when clip changes
  useEffect(() => {
    if (clip && project) {
      setCaption('');
      setBpmMode('project');
      setKeyMode('project');
      setPresetCategory('');
      // Default target: first non-vocal stems track
      const nonVocalTrack = project.tracks.find(
        (t) =>
          (t.trackType ?? 'stems') === 'stems' &&
          t.trackName !== 'vocals' &&
          t.trackName !== 'backing_vocals',
      );
      setTargetTrackId(nonVocalTrack?.id ?? '');
    }
  }, [vocal2bgmClipId]);

  const onClose = useCallback(() => setVocal2BGMModal(null), [setVocal2BGMModal]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleApplyPreset = useCallback((preset: GenerationPreset) => {
    setCaption(preset.caption);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!vocal2bgmClipId || !targetTrackId || isGenerating) return;
    onClose();
    await generateVocal2BGM({
      clipId: vocal2bgmClipId,
      caption,
      targetTrackId,
      bpm: bpmMode === 'auto' ? null : (project?.bpm ?? 120),
      keyScale: keyMode === 'auto' ? '' : (project?.keyScale ?? ''),
    });
  }, [vocal2bgmClipId, targetTrackId, caption, bpmMode, keyMode, isGenerating, project, onClose]);

  if (!vocal2bgmClipId || !clip || !track || !project) return null;

  const hasAudio = !!(clip.isolatedAudioKey || clip.cumulativeMixKey);
  const stemsTargets = project.tracks.filter(
    (t) => (t.trackType ?? 'stems') === 'stems' && t.id !== track.id,
  );

  const filteredPresets = presetCategory
    ? GENERATION_PRESETS.filter((p) => p.category === presetCategory)
    : GENERATION_PRESETS;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-label="Generate Accompaniment" className="bg-daw-surface border border-daw-border rounded-lg shadow-2xl w-[500px] max-h-[85vh] flex flex-col text-xs text-zinc-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">Generate Accompaniment</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-emerald-700/60 text-emerald-200">
              Vocal2BGM
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 transition-colors text-base leading-none"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          {/* Source clip info */}
          <div className="bg-[#222]/60 rounded px-3 py-2.5 border border-[#3a3a3a] space-y-0.5">
            <p className="text-[10px] text-zinc-400 uppercase tracking-wide">Source vocal</p>
            <p className="text-[11px] font-medium text-zinc-200">
              {track.displayName ?? track.trackName}
            </p>
            <p className="text-[10px] text-zinc-400 truncate">{clip.prompt || '(no prompt)'}</p>
            <p className="text-[10px] text-zinc-400">
              {clip.duration.toFixed(1)}s
              {clip.inferredMetas?.bpm ? ` | ${clip.inferredMetas.bpm} BPM` : ''}
              {clip.inferredMetas?.keyScale ? ` | ${clip.inferredMetas.keyScale}` : ''}
            </p>
            {!hasAudio && (
              <p className="text-[10px] text-amber-400 mt-1">
                No audio generated yet — generate the vocal clip first.
              </p>
            )}
          </div>

          {/* Target track */}
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">
              Target track
            </label>
            <select
              value={targetTrackId}
              onChange={(e) => setTargetTrackId(e.target.value)}
              className="w-full bg-[#222] border border-[#444] rounded px-2.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-daw-accent"
            >
              {stemsTargets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.displayName ?? t.trackName}
                </option>
              ))}
            </select>
          </div>

          {/* Preset selector */}
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">
              Style preset
              <span className="ml-1 normal-case font-normal text-zinc-600">(optional)</span>
            </label>
            <div className="flex flex-wrap gap-1 mb-2">
              <button
                onClick={() => setPresetCategory('')}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  !presetCategory ? 'bg-daw-accent text-white' : 'bg-[#333] text-zinc-400 hover:bg-[#444]'
                }`}
              >
                All
              </button>
              {PRESET_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setPresetCategory(cat === presetCategory ? '' : cat)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                    cat === presetCategory ? 'bg-daw-accent text-white' : 'bg-[#333] text-zinc-400 hover:bg-[#444]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1 max-h-[100px] overflow-y-auto">
              {filteredPresets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleApplyPreset(preset)}
                  className="text-left px-2 py-1.5 rounded bg-[#2a2a2a] hover:bg-[#383838] border border-[#3a3a3a] transition-colors"
                >
                  <p className="text-[10px] font-medium text-zinc-200">{preset.name}</p>
                  <p className="text-[10px] text-zinc-400 truncate">{preset.suggestedBpm} BPM | {preset.suggestedKey}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Style description */}
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">
              Style description
              <span className="ml-1 normal-case font-normal text-zinc-600">(caption for accompaniment)</span>
            </label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="e.g. jazzy piano accompaniment, soft guitar arpeggios, orchestral background..."
              rows={3}
              className="w-full bg-[#222] border border-[#444] rounded px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-daw-accent"
            />
          </div>

          {/* BPM / Key options */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">BPM</label>
              <div className="flex gap-2">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name="bpm-mode"
                    checked={bpmMode === 'project'}
                    onChange={() => setBpmMode('project')}
                    className="w-3 h-3 accent-daw-accent"
                  />
                  <span className="text-[10px] text-zinc-300">Project ({project.bpm})</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name="bpm-mode"
                    checked={bpmMode === 'auto'}
                    onChange={() => setBpmMode('auto')}
                    className="w-3 h-3 accent-daw-accent"
                  />
                  <span className="text-[10px] text-zinc-300">Auto-detect</span>
                </label>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">Key</label>
              <div className="flex gap-2">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name="key-mode"
                    checked={keyMode === 'project'}
                    onChange={() => setKeyMode('project')}
                    className="w-3 h-3 accent-daw-accent"
                  />
                  <span className="text-[10px] text-zinc-300">Project ({project.keyScale || 'none'})</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name="key-mode"
                    checked={keyMode === 'auto'}
                    onChange={() => setKeyMode('auto')}
                    className="w-3 h-3 accent-daw-accent"
                  />
                  <span className="text-[10px] text-zinc-300">Auto-detect</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-daw-border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs font-medium bg-[#333] hover:bg-[#444] text-zinc-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !hasAudio || !caption.trim() || !targetTrackId}
            className={`px-4 py-1.5 rounded text-xs font-medium transition-colors ${
              isGenerating || !hasAudio || !caption.trim() || !targetTrackId
                ? 'bg-[#444] text-zinc-400 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
          >
            {isGenerating ? 'Generating...' : 'Generate Accompaniment'}
          </button>
        </div>
      </div>
    </div>
  );
}
