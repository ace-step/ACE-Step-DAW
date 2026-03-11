import { useState, useEffect } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useGeneration } from '../../hooks/useGeneration';

export function ClipPromptEditor() {
  const editingClipId = useUIStore((s) => s.editingClipId);
  const setEditingClip = useUIStore((s) => s.setEditingClip);
  const getClipById = useProjectStore((s) => s.getClipById);
  const updateClip = useProjectStore((s) => s.updateClip);
  const removeClip = useProjectStore((s) => s.removeClip);
  const project = useProjectStore((s) => s.project);
  const { generateClip, isGenerating } = useGeneration();

  const clip = editingClipId ? getClipById(editingClipId) : null;

  const [prompt, setPrompt] = useState('');
  const [globalCaption, setGlobalCaption] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [startTime, setStartTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [sampleMode, setSampleMode] = useState(false);
  const [autoExpandPrompt, setAutoExpandPrompt] = useState(true);
  const [showSeed, setShowSeed] = useState(false);
  const [seedValue, setSeedValue] = useState('');

  // Only reset form when switching to a different clip (not on every store update)
  useEffect(() => {
    if (clip) {
      setPrompt(clip.prompt);
      // Pre-fill global caption from project if clip has none
      setGlobalCaption(clip.globalCaption || project?.globalCaption || '');
      setLyrics(clip.lyrics);
      setStartTime(clip.startTime);
      setDuration(clip.duration);
      setSampleMode(clip.sampleMode ?? false);
      setAutoExpandPrompt(clip.autoExpandPrompt ?? true);
      setShowSeed(false);
      setSeedValue('');
    }
  }, [editingClipId]);

  if (!editingClipId || !clip || !project) return null;

  const parsedSeed = seedValue.trim() ? parseInt(seedValue, 10) : undefined;

  const handleSave = () => {
    updateClip(editingClipId, {
      prompt,
      globalCaption,
      lyrics,
      startTime: Math.max(0, startTime),
      duration: Math.max(0.5, duration),
      sampleMode,
      autoExpandPrompt,
    });
    setEditingClip(null);
  };

  const handleGenerate = () => {
    updateClip(editingClipId, {
      prompt, globalCaption, lyrics, startTime, duration,
      sampleMode,
      autoExpandPrompt,
    });
    setEditingClip(null);
    generateClip(editingClipId, parsedSeed !== undefined ? { sharedSeed: parsedSeed } : undefined);
  };

  const handleDelete = () => {
    removeClip(editingClipId);
    setEditingClip(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[480px] bg-daw-surface rounded-lg border border-daw-border shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border">
          <h2 className="text-sm font-medium">Edit Clip</h2>
          <button
            onClick={() => setEditingClip(null)}
            className="text-zinc-500 hover:text-zinc-300 text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sampleMode}
                onChange={(e) => setSampleMode(e.target.checked)}
                className="w-4 h-4 rounded border-daw-border bg-daw-bg accent-daw-accent"
              />
              <span className="text-xs text-zinc-400">Sample Mode</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoExpandPrompt}
                onChange={(e) => setAutoExpandPrompt(e.target.checked)}
                className="w-4 h-4 rounded border-daw-border bg-daw-bg accent-daw-accent"
              />
              <span className="text-xs text-zinc-400">Auto-expand prompt</span>
            </label>
          </div>

          {!sampleMode && (
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Song description <span className="text-zinc-500">(global — full song context, optional)</span>
              </label>
              <textarea
                value={globalCaption}
                onChange={(e) => setGlobalCaption(e.target.value)}
                placeholder="e.g. upbeat pop song with energetic drums and catchy melody..."
                rows={2}
                className="w-full px-3 py-2 text-sm bg-daw-bg border border-daw-border rounded resize-none focus:outline-none focus:border-daw-accent"
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-zinc-400 mb-1">
              {sampleMode ? 'Description' : 'Track description'}{' '}
              {!sampleMode && <span className="text-zinc-500">(local — this stem only)</span>}
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={sampleMode ? 'Describe the sample you want...' : 'Describe the sound for this track...'}
              rows={3}
              className="w-full px-3 py-2 text-sm bg-daw-bg border border-daw-border rounded resize-none focus:outline-none focus:border-daw-accent"
            />
          </div>

          {!sampleMode && (
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Lyrics (optional)</label>
              <textarea
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder="Song lyrics..."
                rows={2}
                className="w-full px-3 py-2 text-sm bg-daw-bg border border-daw-border rounded resize-none focus:outline-none focus:border-daw-accent"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Start (seconds)</label>
              <input
                type="number"
                value={startTime}
                onChange={(e) => setStartTime(parseFloat(e.target.value) || 0)}
                min={0}
                step={0.5}
                className="w-full px-3 py-1.5 text-sm bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Duration (seconds)</label>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(parseFloat(e.target.value) || 0)}
                min={0.5}
                step={0.5}
                className="w-full px-3 py-1.5 text-sm bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
              />
            </div>
          </div>

          {/* Seed (optional, collapsed by default) */}
          <div className="border-t border-daw-border pt-3">
            <button
              type="button"
              onClick={() => setShowSeed((v) => !v)}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {showSeed ? '▾' : '▸'} Seed (optional)
            </button>
            {showSeed && (
              <div className="mt-2">
                <input
                  type="number"
                  value={seedValue}
                  onChange={(e) => setSeedValue(e.target.value)}
                  placeholder="Leave empty for random"
                  className="w-full px-3 py-1.5 text-sm bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent placeholder:text-zinc-600"
                />
                <p className="mt-1 text-[10px] text-zinc-600">
                  Project: {project.bpm} BPM · {project.keyScale} · {project.timeSignature}/4 (edit in Settings)
                </p>
              </div>
            )}
          </div>

          {/* Inferred by ACE-Step */}
          {clip.generationStatus === 'ready' && clip.inferredMetas && (
            <div className="border-t border-daw-border pt-3">
              <p className="text-[10px] text-zinc-500 mb-2">Inferred by ACE-Step</p>
              <div className="grid grid-cols-3 gap-x-3 gap-y-1">
                {clip.inferredMetas.bpm != null && (
                  <div>
                    <span className="text-[10px] text-zinc-500">BPM</span>
                    <p className="text-xs text-zinc-300">{clip.inferredMetas.bpm}</p>
                  </div>
                )}
                {clip.inferredMetas.keyScale && (
                  <div>
                    <span className="text-[10px] text-zinc-500">Key</span>
                    <p className="text-xs text-zinc-300">{clip.inferredMetas.keyScale}</p>
                  </div>
                )}
                {clip.inferredMetas.timeSignature && (
                  <div>
                    <span className="text-[10px] text-zinc-500">Time Sig</span>
                    <p className="text-xs text-zinc-300">{clip.inferredMetas.timeSignature}</p>
                  </div>
                )}
                {clip.inferredMetas.genres && (
                  <div>
                    <span className="text-[10px] text-zinc-500">Genres</span>
                    <p className="text-xs text-zinc-300 truncate">{clip.inferredMetas.genres}</p>
                  </div>
                )}
                {clip.inferredMetas.seed && (
                  <div>
                    <span className="text-[10px] text-zinc-500">Seed</span>
                    <p className="text-xs text-zinc-300 truncate">{clip.inferredMetas.seed}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-daw-border">
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors"
          >
            Delete Clip
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              className="px-4 py-1.5 text-xs font-medium bg-daw-surface-2 hover:bg-zinc-600 rounded transition-colors"
            >
              Save
            </button>
            <button
              onClick={handleGenerate}
              disabled={!prompt || isGenerating}
              className="px-4 py-1.5 text-xs font-medium bg-daw-accent hover:bg-daw-accent-hover text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Generate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
