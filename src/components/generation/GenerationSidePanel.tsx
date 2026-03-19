import { useState, useCallback, useRef, useEffect } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';
import type { VariationSessionParams, VariationStatus } from '../../store/generationStore';
import { KEY_SCALES } from '../../constants/tracks';
import { DEFAULT_BPM, DEFAULT_KEY_SCALE, MIN_BPM, MAX_BPM } from '../../constants/defaults';
import { GENERATION_PRESETS, PRESET_CATEGORIES } from '../../constants/generationPresets';
import type { PresetCategory } from '../../constants/generationPresets';

const VARIATION_STATUS_LABELS: Record<VariationStatus, string> = {
  pending: 'Waiting',
  generating: 'Generating',
  processing: 'Processing',
  done: 'Ready',
  error: 'Error',
  cancelled: 'Cancelled',
};

const VARIATION_STATUS_COLORS: Record<VariationStatus, string> = {
  pending: 'bg-zinc-700 text-zinc-400',
  generating: 'bg-indigo-900/60 text-indigo-300',
  processing: 'bg-amber-900/60 text-amber-300',
  done: 'bg-emerald-900/60 text-emerald-300',
  error: 'bg-red-900/60 text-red-300',
  cancelled: 'bg-zinc-800 text-zinc-500',
};

export function GenerationSidePanel() {
  const show = useUIStore((s) => s.showGenerationPanel);
  const setShow = useUIStore((s) => s.setShowGenerationPanel);
  const project = useProjectStore((s) => s.project);

  const variationSession = useGenerationStore((s) => s.variationSession);
  const promptHistory = useGenerationStore((s) => s.promptHistory);
  const startVariationSession = useGenerationStore((s) => s.startVariationSession);
  const setActiveVariation = useGenerationStore((s) => s.setActiveVariation);
  const cancelVariationSession = useGenerationStore((s) => s.cancelVariationSession);
  const clearVariationSession = useGenerationStore((s) => s.clearVariationSession);

  // Form state
  const [prompt, setPrompt] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [bpm, setBpm] = useState(project?.bpm ?? DEFAULT_BPM);
  const [keyScale, setKeyScale] = useState(project?.keyScale ?? DEFAULT_KEY_SCALE);
  const [duration, setDuration] = useState(30);
  const [guidanceScale, setGuidanceScale] = useState(
    project?.generationDefaults.guidanceScale ?? 7.0,
  );
  const [variationCount, setVariationCount] = useState(2);
  const [selectedTrackId, setSelectedTrackId] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [presetCategory, setPresetCategory] = useState<PresetCategory | 'All'>('All');
  const [showLyrics, setShowLyrics] = useState(false);

  const promptRef = useRef<HTMLTextAreaElement>(null);

  // Sync BPM/key when project changes
  useEffect(() => {
    if (project) {
      setBpm(project.bpm);
      setKeyScale(project.keyScale);
    }
  }, [project?.bpm, project?.keyScale]);

  // Auto-select first stems track
  useEffect(() => {
    if (project && !selectedTrackId) {
      const stemsTrack = project.tracks.find((t) => t.trackType === 'stems');
      if (stemsTrack) setSelectedTrackId(stemsTrack.id);
    }
  }, [project, selectedTrackId]);

  const stemsTracks = project?.tracks.filter((t) => t.trackType === 'stems') ?? [];

  const handleGenerate = useCallback(() => {
    if (!prompt.trim() || !selectedTrackId) return;

    const params: VariationSessionParams = {
      prompt: prompt.trim(),
      trackId: selectedTrackId,
      variationCount,
      bpm,
      keyScale,
      duration,
      guidanceScale,
      lyrics: lyrics.trim() || undefined,
      globalCaption: project?.globalCaption || undefined,
    };

    startVariationSession(params);
  }, [prompt, selectedTrackId, variationCount, bpm, keyScale, duration, guidanceScale, lyrics, project?.globalCaption, startVariationSession]);

  const handlePresetSelect = useCallback((presetId: string) => {
    const preset = GENERATION_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setPrompt(preset.caption);
    setBpm(preset.suggestedBpm);
    setKeyScale(preset.suggestedKey);
    if (preset.lyricsTemplate) {
      setLyrics(preset.lyricsTemplate);
      setShowLyrics(true);
    }
  }, []);

  const handleHistorySelect = useCallback((historyPrompt: string) => {
    setPrompt(historyPrompt);
    setShowHistory(false);
  }, []);

  const filteredPresets = presetCategory === 'All'
    ? GENERATION_PRESETS
    : GENERATION_PRESETS.filter((p) => p.category === presetCategory);

  if (!show) return null;

  const isSessionActive = variationSession !== null && variationSession.status === 'generating';

  return (
    <div
      className="fixed right-0 top-10 bottom-6 w-80 bg-[#1e1e1e] border-l border-[#333] z-40 flex flex-col shadow-2xl"
      data-testid="generation-side-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#333]">
        <h2 className="text-sm font-semibold text-zinc-200">AI Generation</h2>
        <button
          onClick={() => setShow(false)}
          className="text-zinc-500 hover:text-zinc-300 text-lg leading-none"
          aria-label="Close generation panel"
        >
          &times;
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {/* Track selector */}
        <div>
          <label className="text-[11px] uppercase text-zinc-500 font-medium">Target Track</label>
          <select
            value={selectedTrackId}
            onChange={(e) => setSelectedTrackId(e.target.value)}
            className="w-full mt-1 px-2 py-1.5 text-sm bg-[#2a2a2a] border border-[#444] rounded focus:outline-none focus:border-indigo-500"
            disabled={isSessionActive}
          >
            {stemsTracks.length === 0 && (
              <option value="">No stems tracks</option>
            )}
            {stemsTracks.map((t) => (
              <option key={t.id} value={t.id}>{t.displayName}</option>
            ))}
          </select>
        </div>

        {/* Prompt */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-[11px] uppercase text-zinc-500 font-medium">Prompt</label>
            {promptHistory.length > 0 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="text-[10px] text-indigo-400 hover:text-indigo-300"
              >
                {showHistory ? 'Hide' : 'History'}
              </button>
            )}
          </div>
          <textarea
            ref={promptRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the music you want to generate..."
            className="w-full mt-1 px-2 py-1.5 text-sm bg-[#2a2a2a] border border-[#444] rounded resize-none focus:outline-none focus:border-indigo-500"
            rows={3}
            disabled={isSessionActive}
            data-testid="generation-prompt-input"
          />

          {/* Prompt history dropdown */}
          {showHistory && promptHistory.length > 0 && (
            <div className="mt-1 max-h-32 overflow-y-auto bg-[#2a2a2a] border border-[#444] rounded">
              {promptHistory.slice(0, 10).map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => handleHistorySelect(entry.prompt)}
                  className="w-full text-left px-2 py-1 text-xs text-zinc-300 hover:bg-[#333] truncate"
                  title={entry.prompt}
                >
                  {entry.prompt}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Style presets */}
        <div>
          <label className="text-[11px] uppercase text-zinc-500 font-medium">Style Presets</label>
          <div className="flex flex-wrap gap-1 mt-1">
            <button
              onClick={() => setPresetCategory('All')}
              className={`px-2 py-0.5 text-[10px] rounded-full ${
                presetCategory === 'All' ? 'bg-indigo-600 text-white' : 'bg-[#333] text-zinc-400 hover:bg-[#444]'
              }`}
            >
              All
            </button>
            {PRESET_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setPresetCategory(cat)}
                className={`px-2 py-0.5 text-[10px] rounded-full ${
                  presetCategory === cat ? 'bg-indigo-600 text-white' : 'bg-[#333] text-zinc-400 hover:bg-[#444]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="mt-1 max-h-24 overflow-y-auto space-y-0.5">
            {filteredPresets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => handlePresetSelect(preset.id)}
                className="w-full text-left px-2 py-1 text-xs text-zinc-300 hover:bg-[#333] rounded truncate"
                disabled={isSessionActive}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        {/* Lyrics toggle */}
        <div>
          <button
            onClick={() => setShowLyrics(!showLyrics)}
            className="text-[11px] uppercase text-zinc-500 font-medium hover:text-zinc-300"
          >
            Lyrics {showLyrics ? '[-]' : '[+]'}
          </button>
          {showLyrics && (
            <textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="[verse]\nYour lyrics here..."
              className="w-full mt-1 px-2 py-1.5 text-xs bg-[#2a2a2a] border border-[#444] rounded resize-none focus:outline-none focus:border-indigo-500 font-mono"
              rows={4}
              disabled={isSessionActive}
            />
          )}
        </div>

        {/* Controls grid */}
        <div className="grid grid-cols-2 gap-2">
          {/* BPM */}
          <div>
            <label className="text-[11px] uppercase text-zinc-500 font-medium">BPM</label>
            <input
              type="number"
              value={bpm}
              onChange={(e) => setBpm(Math.max(MIN_BPM, Math.min(MAX_BPM, Number(e.target.value))))}
              className="w-full mt-1 px-2 py-1 text-sm bg-[#2a2a2a] border border-[#444] rounded focus:outline-none focus:border-indigo-500"
              min={MIN_BPM}
              max={MAX_BPM}
              disabled={isSessionActive}
            />
          </div>

          {/* Key */}
          <div>
            <label className="text-[11px] uppercase text-zinc-500 font-medium">Key</label>
            <select
              value={keyScale}
              onChange={(e) => setKeyScale(e.target.value)}
              className="w-full mt-1 px-2 py-1 text-sm bg-[#2a2a2a] border border-[#444] rounded focus:outline-none focus:border-indigo-500"
              disabled={isSessionActive}
            >
              {KEY_SCALES.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>

          {/* Duration */}
          <div>
            <label className="text-[11px] uppercase text-zinc-500 font-medium">Length (s)</label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(Math.max(10, Math.min(600, Number(e.target.value))))}
              className="w-full mt-1 px-2 py-1 text-sm bg-[#2a2a2a] border border-[#444] rounded focus:outline-none focus:border-indigo-500"
              min={10}
              max={600}
              disabled={isSessionActive}
            />
          </div>

          {/* Variations */}
          <div>
            <label className="text-[11px] uppercase text-zinc-500 font-medium">Variations</label>
            <select
              value={variationCount}
              onChange={(e) => setVariationCount(Number(e.target.value))}
              className="w-full mt-1 px-2 py-1 text-sm bg-[#2a2a2a] border border-[#444] rounded focus:outline-none focus:border-indigo-500"
              disabled={isSessionActive}
            >
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
          </div>
        </div>

        {/* Temperature / Guidance Scale */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-[11px] uppercase text-zinc-500 font-medium">
              Guidance ({guidanceScale.toFixed(1)})
            </label>
          </div>
          <input
            type="range"
            value={guidanceScale}
            onChange={(e) => setGuidanceScale(Number(e.target.value))}
            min={1}
            max={15}
            step={0.5}
            className="w-full mt-1 accent-indigo-500"
            disabled={isSessionActive}
          />
          <div className="flex justify-between text-[9px] text-zinc-600">
            <span>Creative</span>
            <span>Precise</span>
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={!prompt.trim() || !selectedTrackId || isSessionActive}
          className="w-full py-2 text-sm font-medium rounded bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white transition-colors"
          data-testid="generation-generate-btn"
        >
          {isSessionActive ? 'Generating...' : `Generate ${variationCount} Variations`}
        </button>

        {/* Variation cards */}
        {variationSession && (
          <div className="space-y-1.5" data-testid="variation-cards">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase text-zinc-500 font-medium">
                Variations
              </span>
              <span className="text-[10px] text-zinc-600">
                Press 1–{variationSession.variations.length} to switch
              </span>
            </div>

            {variationSession.variations.map((v) => {
              const isActive = v.index === variationSession.activeVariationIndex;
              const eta = v.status === 'generating' && v.startedAt
                ? formatEta(v.startedAt)
                : null;

              return (
                <button
                  key={v.index}
                  onClick={() => setActiveVariation(v.index)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${
                    isActive
                      ? 'bg-indigo-900/40 border border-indigo-500/50'
                      : 'bg-[#2a2a2a] border border-transparent hover:border-[#444]'
                  }`}
                  data-testid={`variation-card-${v.index}`}
                >
                  <span className={`w-5 h-5 flex items-center justify-center rounded text-[11px] font-bold ${
                    isActive ? 'bg-indigo-600 text-white' : 'bg-[#333] text-zinc-400'
                  }`}>
                    {v.index + 1}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${VARIATION_STATUS_COLORS[v.status]}`}>
                        {VARIATION_STATUS_LABELS[v.status]}
                      </span>
                      {v.status === 'generating' && (
                        <div className="w-2.5 h-2.5 border border-indigo-400 border-t-transparent rounded-full animate-spin" />
                      )}
                    </div>
                    {v.progress && (
                      <span className="text-[10px] text-zinc-500 block mt-0.5">{v.progress}</span>
                    )}
                    {eta && (
                      <span className="text-[10px] text-zinc-600 block">ETA: {eta}</span>
                    )}
                    {v.error && (
                      <span className="text-[10px] text-red-400 block mt-0.5 truncate">{v.error}</span>
                    )}
                  </div>
                </button>
              );
            })}

            {/* Cancel / Clear actions */}
            <div className="flex gap-2">
              {variationSession.status === 'generating' && (
                <button
                  onClick={cancelVariationSession}
                  className="flex-1 py-1 text-[11px] text-red-400 hover:text-red-300 bg-red-900/20 hover:bg-red-900/30 rounded transition-colors"
                  data-testid="cancel-generation-btn"
                >
                  Cancel
                </button>
              )}
              {variationSession.status !== 'generating' && (
                <button
                  onClick={clearVariationSession}
                  className="flex-1 py-1 text-[11px] text-zinc-500 hover:text-zinc-300 bg-[#333] hover:bg-[#444] rounded transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatEta(startedAt: number): string {
  const elapsed = (Date.now() - startedAt) / 1000;
  // Rough estimate: typical generation takes ~60s
  const estimated = 60;
  const remaining = Math.max(0, estimated - elapsed);
  if (remaining < 5) return '< 5s';
  return `~${Math.round(remaining)}s`;
}
