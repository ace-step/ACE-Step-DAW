import { useState, useEffect, useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';
import { useUIStore } from '../../store/uiStore';
import { generateVocalReplacement } from '../../services/generationPipeline';

const VOCAL_LANGUAGES = [
  { value: 'unknown', label: 'Auto-detect' },
  { value: 'en', label: 'English' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
] as const;

export function VocalReplacementModal() {
  const clipId = useUIStore((s) => s.vocalReplacementClipId);
  const setModal = useUIStore((s) => s.setVocalReplacementModal);
  const isGenerating = useGenerationStore((s) => s.isGenerating);
  const getClipById = useProjectStore((s) => s.getClipById);
  const project = useProjectStore((s) => s.project);

  const clip = clipId ? getClipById(clipId) : null;
  const track = project?.tracks.find((t) => t.clips.some((c) => c.id === clipId)) ?? null;

  const [lyrics, setLyrics] = useState('');
  const [vocalStyle, setVocalStyle] = useState('');
  const [targetTrackId, setTargetTrackId] = useState('');
  const [vocalLanguage, setVocalLanguage] = useState('unknown');
  const [bpmMode, setBpmMode] = useState<'project' | 'auto'>('project');
  const [keyMode, setKeyMode] = useState<'project' | 'auto'>('project');

  // Reset form when clip changes
  useEffect(() => {
    if (clip && project) {
      setLyrics('');
      setVocalStyle('');
      setVocalLanguage('unknown');
      setBpmMode('project');
      setKeyMode('project');
      // Default target: first vocals track, or create new
      const vocalTrack = project.tracks.find(
        (t) =>
          (t.trackType ?? 'stems') === 'stems' &&
          (t.trackName === 'vocals' || t.trackName === 'backing_vocals'),
      );
      setTargetTrackId(vocalTrack?.id ?? '__new__');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipId]);

  const onClose = useCallback(() => setModal(null), [setModal]);

  useEffect(() => {
    if (!clipId) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [clipId, onClose]);

  const handleGenerate = useCallback(async () => {
    if (!clipId || !project || isGenerating) return;

    let resolvedTargetId = targetTrackId;

    // Create new vocals track if needed
    if (targetTrackId === '__new__') {
      const store = useProjectStore.getState();
      const newTrack = store.addTrack('vocals', 'stems');
      resolvedTargetId = newTrack.id;
    }

    onClose();
    await generateVocalReplacement({
      clipId,
      vocalStyle: vocalStyle.trim(),
      lyrics: lyrics.trim(),
      targetTrackId: resolvedTargetId,
      bpm: bpmMode === 'auto' ? null : (project.bpm ?? 120),
      keyScale: keyMode === 'auto' ? '' : (project.keyScale ?? ''),
      vocalLanguage: vocalLanguage !== 'unknown' ? vocalLanguage : undefined,
    });
  }, [clipId, targetTrackId, vocalStyle, lyrics, bpmMode, keyMode, vocalLanguage, isGenerating, project, onClose]);

  if (!clipId || !clip || !track || !project) return null;

  const hasAudio = !!(clip.isolatedAudioKey || clip.cumulativeMixKey);

  // Vocal tracks for target selection
  const vocalTargets = project.tracks.filter(
    (t) =>
      (t.trackType ?? 'stems') === 'stems' &&
      (t.trackName === 'vocals' || t.trackName === 'backing_vocals'),
  );

  const canGenerate = hasAudio && lyrics.trim().length > 0 && vocalStyle.trim().length > 0 && !isGenerating;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="vocal-replacement-modal"
    >
      <div className="bg-daw-surface border border-daw-border rounded-lg shadow-2xl w-[520px] max-h-[85vh] flex flex-col text-xs text-zinc-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">Generate Vocals</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-violet-700/60 text-violet-200">
              Add Vocals
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close vocal replacement modal"
            className="text-zinc-400 hover:text-zinc-200 transition-colors text-base leading-none"
          >
            {'\u00d7'}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          {/* Source clip info */}
          <div className="bg-[#222]/60 rounded px-3 py-2.5 border border-[#3a3a3a] space-y-0.5">
            <p className="text-[10px] text-zinc-400 uppercase tracking-wide">Source instrumental</p>
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
                No audio generated yet — generate the instrumental clip first.
              </p>
            )}
          </div>

          {/* Target vocal track */}
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">
              Target vocal track
            </label>
            <select
              value={targetTrackId}
              onChange={(e) => setTargetTrackId(e.target.value)}
              className="w-full bg-[#222] border border-[#444] rounded px-2.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-daw-accent"
              data-testid="vocal-target-track"
            >
              <option value="__new__">+ Create new Vocals track</option>
              {vocalTargets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.displayName ?? t.trackName}
                </option>
              ))}
            </select>
          </div>

          {/* Lyrics */}
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">
              Lyrics
              <span className="ml-1 normal-case font-normal text-red-400">*required</span>
            </label>
            <textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder={"[Verse 1]\nYour lyrics here...\n\n[Chorus]\nChorus lyrics..."}
              rows={5}
              className="w-full bg-[#222] border border-[#444] rounded px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-daw-accent font-mono"
              data-testid="vocal-lyrics-input"
            />
          </div>

          {/* Vocal style */}
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">
              Vocal style
              <span className="ml-1 normal-case font-normal text-red-400">*required</span>
            </label>
            <textarea
              value={vocalStyle}
              onChange={(e) => setVocalStyle(e.target.value)}
              placeholder="e.g. warm female vocals, energetic male rap, soft whispered singing, soulful R&B..."
              rows={2}
              className="w-full bg-[#222] border border-[#444] rounded px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-daw-accent"
              data-testid="vocal-style-input"
            />
          </div>

          {/* Language + BPM / Key options */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">Language</label>
              <select
                value={vocalLanguage}
                onChange={(e) => setVocalLanguage(e.target.value)}
                className="w-full bg-[#222] border border-[#444] rounded px-2 py-1.5 text-[11px] text-zinc-100 focus:outline-none focus:border-daw-accent"
              >
                {VOCAL_LANGUAGES.map((lang) => (
                  <option key={lang.value} value={lang.value}>{lang.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">BPM</label>
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name="vr-bpm" checked={bpmMode === 'project'} onChange={() => setBpmMode('project')} className="w-3 h-3 accent-daw-accent" />
                  <span className="text-[10px] text-zinc-300">Project ({project.bpm})</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name="vr-bpm" checked={bpmMode === 'auto'} onChange={() => setBpmMode('auto')} className="w-3 h-3 accent-daw-accent" />
                  <span className="text-[10px] text-zinc-300">Auto</span>
                </label>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">Key</label>
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name="vr-key" checked={keyMode === 'project'} onChange={() => setKeyMode('project')} className="w-3 h-3 accent-daw-accent" />
                  <span className="text-[10px] text-zinc-300">Project ({project.keyScale || 'none'})</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name="vr-key" checked={keyMode === 'auto'} onChange={() => setKeyMode('auto')} className="w-3 h-3 accent-daw-accent" />
                  <span className="text-[10px] text-zinc-300">Auto</span>
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
            disabled={!canGenerate}
            className={`px-4 py-1.5 rounded text-xs font-medium transition-colors ${
              canGenerate
                ? 'bg-violet-600 hover:bg-violet-500 text-white'
                : 'bg-[#444] text-zinc-400 cursor-not-allowed'
            }`}
            data-testid="vocal-generate-button"
          >
            {isGenerating ? 'Generating...' : 'Generate Vocals'}
          </button>
        </div>
      </div>
    </div>
  );
}
