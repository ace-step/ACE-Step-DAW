import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import {
  getGenerationValidationError,
  useGenerationStore,
  type VariationStatus,
} from '../../store/generationStore';
import { useProjectStore } from '../../store/projectStore';
import { KEY_SCALES } from '../../constants/tracks';
import { MAX_BPM, MAX_DURATION, MIN_BPM, MIN_DURATION } from '../../constants/defaults';
import { GENERATION_PRESETS, PRESET_CATEGORIES } from '../../constants/generationPresets';
import type { PresetCategory } from '../../constants/generationPresets';
import { generateVariationSession } from '../../services/generationPipeline';
import { PromptAutocompleteTextarea } from './PromptAutocompleteTextarea';
import { computeEta, formatEtaDisplay } from '../../utils/generationProgress';

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
  const selectClip = useUIStore((s) => s.selectClip);
  const project = useProjectStore((s) => s.project);

  const generationForm = useGenerationStore((s) => s.generationForm);
  const isGenerating = useGenerationStore((s) => s.isGenerating);
  const variationSession = useGenerationStore((s) => s.variationSession);
  const jobs = useGenerationStore((s) => s.jobs);
  const promptHistory = useGenerationStore((s) => s.promptHistory);
  const setGenerationPrompt = useGenerationStore((s) => s.setGenerationPrompt);
  const setGenerationStyleTags = useGenerationStore((s) => s.setGenerationStyleTags);
  const toggleGenerationStyleTag = useGenerationStore((s) => s.toggleGenerationStyleTag);
  const setGenerationBpm = useGenerationStore((s) => s.setGenerationBpm);
  const setGenerationKeyScale = useGenerationStore((s) => s.setGenerationKeyScale);
  const setGenerationLengthSeconds = useGenerationStore((s) => s.setGenerationLengthSeconds);
  const setGenerationTemperature = useGenerationStore((s) => s.setGenerationTemperature);
  const setGenerationVariationCount = useGenerationStore((s) => s.setGenerationVariationCount);
  const setGenerationTargetTrack = useGenerationStore((s) => s.setGenerationTargetTrack);
  const setGenerationLyrics = useGenerationStore((s) => s.setGenerationLyrics);
  const applyGenerationPreset = useGenerationStore((s) => s.applyGenerationPreset);
  const getPromptAutocompleteSuggestions = useGenerationStore((s) => s.getPromptAutocompleteSuggestions);
  const applyPromptAutocompleteSuggestion = useGenerationStore((s) => s.applyPromptAutocompleteSuggestion);
  const submitGenerationRequest = useGenerationStore((s) => s.submitGenerationRequest);
  const setActiveVariation = useGenerationStore((s) => s.setActiveVariation);
  const cancelVariationSession = useGenerationStore((s) => s.cancelVariationSession);
  const clearVariationSession = useGenerationStore((s) => s.clearVariationSession);

  const [showHistory, setShowHistory] = useState(false);
  const [presetCategory, setPresetCategory] = useState<PresetCategory | 'All'>('All');
  const [showLyrics, setShowLyrics] = useState(false);
  const [styleTagsInput, setStyleTagsInput] = useState('');

  const stemsTracks = project?.tracks.filter((track) => track.trackType === 'stems') ?? [];
  const activeJobs = jobs.filter((job) => job.status === 'queued' || job.status === 'generating' || job.status === 'processing');
  const projectBpm = project?.bpm;
  const projectKeyScale = project?.keyScale;
  const projectGuidanceScale = project?.generationDefaults.guidanceScale;

  useEffect(() => {
    const selectedTrackStillExists = stemsTracks.some((track) => track.id === generationForm.selectedTrackId);
    if (!selectedTrackStillExists) {
      setGenerationTargetTrack(stemsTracks[0]?.id ?? '');
    }
  }, [generationForm.selectedTrackId, setGenerationTargetTrack, stemsTracks]);

  useEffect(() => {
    if (generationForm.lyrics.trim()) setShowLyrics(true);
  }, [generationForm.lyrics]);

  useEffect(() => {
    setStyleTagsInput(generationForm.styleTags.join(', '));
  }, [generationForm.styleTags]);

  useEffect(() => {
    if (projectBpm === undefined || !projectKeyScale || projectGuidanceScale === undefined) return;

    const isPristine =
      generationForm.prompt.trim() === ''
      && generationForm.styleTags.length === 0
      && generationForm.bpm === 120
      && generationForm.keyScale === 'C major';

    if (isPristine) {
      useGenerationStore.getState().hydrateGenerationForm({
        bpm: projectBpm,
        keyScale: projectKeyScale,
        temperature: projectGuidanceScale,
      });
    }
  }, [
    generationForm.bpm,
    generationForm.keyScale,
    generationForm.prompt,
    generationForm.styleTags.length,
    projectBpm,
    projectGuidanceScale,
    projectKeyScale,
  ]);
  const filteredPresets = presetCategory === 'All'
    ? GENERATION_PRESETS
    : GENERATION_PRESETS.filter((preset) => preset.category === presetCategory);

  const validationError = useMemo(() => getGenerationValidationError({
    prompt: generationForm.prompt,
    selectedTrackId: generationForm.selectedTrackId,
    bpm: generationForm.bpm,
    lengthSeconds: generationForm.lengthSeconds,
    temperature: generationForm.temperature,
    variationCount: generationForm.variationCount,
  }), [generationForm]);

  const variationError = useMemo(
    () => variationSession?.variations.find((variation) => variation.error)?.error ?? null,
    [variationSession],
  );

  const statusMessage = generationForm.requestError
    ?? variationError
    ?? jobs.find((job) => job.status === 'error')?.actionableMessage
    ?? validationError;
  const isSessionActive = isGenerating || variationSession?.status === 'generating';

  const handleGenerate = useCallback(() => {
    const params = submitGenerationRequest({ globalCaption: project?.globalCaption });
    if (!params) return;
    void generateVariationSession(params);
  }, [project?.globalCaption, submitGenerationRequest]);

  const handleHistorySelect = useCallback((historyPrompt: string) => {
    setGenerationPrompt(historyPrompt);
    setShowHistory(false);
  }, [setGenerationPrompt]);

  const commitStyleTagsInput = useCallback(() => {
    const nextTags = styleTagsInput
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    setGenerationStyleTags(nextTags);
  }, [setGenerationStyleTags, styleTagsInput]);

  if (!show) return null;

  return (
    <aside
      className="fixed right-0 top-10 bottom-6 z-40 flex w-88 flex-col border-l border-[#333] bg-[#1e1e1e] shadow-2xl"
      data-testid="generation-side-panel"
      aria-label="AI generation panel"
    >
      <div className="flex items-center justify-between border-b border-[#333] px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">AI Generation</h2>
          <p className="text-[11px] text-zinc-500">Prompt a new idea without leaving the arrangement.</p>
        </div>
        <button
          onClick={() => setShow(false)}
          className="text-lg leading-none text-zinc-500 transition-colors hover:text-zinc-300"
          aria-label="Close generation panel"
        >
          &times;
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {statusMessage && (
          <div
            className={`rounded-md border px-3 py-2 text-xs ${
              generationForm.requestError || variationError
                ? 'border-red-500/40 bg-red-950/30 text-red-200'
                : 'border-amber-500/30 bg-amber-950/30 text-amber-100'
            }`}
            role="status"
            aria-live="polite"
            data-testid="generation-panel-message"
          >
            {statusMessage}
          </div>
        )}

        <section className="space-y-2">
          <label className="block text-[11px] font-medium uppercase text-zinc-500" htmlFor="generation-track-select">
            Target Track
          </label>
          <select
            id="generation-track-select"
            value={generationForm.selectedTrackId}
            onChange={(event) => setGenerationTargetTrack(event.target.value)}
            className="w-full rounded border border-[#444] bg-[#2a2a2a] px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
            disabled={isSessionActive}
            aria-label="Generation target track"
            data-testid="generation-track-select"
          >
            {stemsTracks.length === 0 && <option value="">No stems tracks available</option>}
            {stemsTracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.displayName}
              </option>
            ))}
          </select>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-[11px] font-medium uppercase text-zinc-500" htmlFor="generation-prompt-input">
              Prompt
            </label>
            {promptHistory.length > 0 && (
              <button
                onClick={() => setShowHistory((value) => !value)}
                className="text-[10px] text-indigo-400 transition-colors hover:text-indigo-300"
                type="button"
              >
                {showHistory ? 'Hide history' : 'Prompt history'}
              </button>
            )}
          </div>
          <PromptAutocompleteTextarea
            value={generationForm.prompt}
            onChange={setGenerationPrompt}
            disabled={isSessionActive}
            getSuggestions={getPromptAutocompleteSuggestions}
            applySuggestion={applyPromptAutocompleteSuggestion}
          />

          {showHistory && promptHistory.length > 0 && (
            <div className="max-h-32 overflow-y-auto rounded border border-[#444] bg-[#2a2a2a]">
              {promptHistory.slice(0, 10).map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => handleHistorySelect(entry.prompt)}
                  className="block w-full truncate px-2 py-1 text-left text-xs text-zinc-300 transition-colors hover:bg-[#333]"
                  title={entry.prompt}
                  type="button"
                >
                  {entry.prompt}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase text-zinc-500">Style Tags</span>
            <span className="text-[10px] text-zinc-600">
              {generationForm.styleTags.length}/6 selected
            </span>
          </div>
          <input
            value={styleTagsInput}
            onChange={(event) => setStyleTagsInput(event.target.value)}
            onBlur={commitStyleTagsInput}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitStyleTagsInput();
              }
            }}
            placeholder="Add comma-separated style tags"
            className="w-full rounded border border-[#444] bg-[#2a2a2a] px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
            disabled={isSessionActive}
            aria-label="Generation style tags"
            data-testid="generation-style-tags-input"
          />
          <div className="flex flex-wrap gap-1.5" data-testid="generation-style-tags">
            {PRESET_CATEGORIES.map((category) => {
              const selected = generationForm.styleTags.some((tag) => tag.toLowerCase() === category.toLowerCase());
              return (
                <button
                  key={category}
                  onClick={() => toggleGenerationStyleTag(category)}
                  className={`rounded-full border px-2 py-1 text-[11px] transition-colors ${
                    selected
                      ? 'border-indigo-400 bg-indigo-500/20 text-indigo-100'
                      : 'border-[#444] bg-[#2a2a2a] text-zinc-400 hover:border-[#555] hover:text-zinc-200'
                  }`}
                  type="button"
                  disabled={isSessionActive}
                  aria-pressed={selected}
                >
                  {category}
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase text-zinc-500">Quick Presets</span>
            <span className="text-[10px] text-zinc-600">Apply prompt + defaults</span>
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setPresetCategory('All')}
              className={`rounded-full px-2 py-0.5 text-[10px] ${
                presetCategory === 'All' ? 'bg-indigo-600 text-white' : 'bg-[#333] text-zinc-400 hover:bg-[#444]'
              }`}
              type="button"
            >
              All
            </button>
            {PRESET_CATEGORIES.map((category) => (
              <button
                key={category}
                onClick={() => setPresetCategory(category)}
                className={`rounded-full px-2 py-0.5 text-[10px] ${
                  presetCategory === category ? 'bg-indigo-600 text-white' : 'bg-[#333] text-zinc-400 hover:bg-[#444]'
                }`}
                type="button"
              >
                {category}
              </button>
            ))}
          </div>
          <div className="max-h-28 space-y-1 overflow-y-auto">
            {filteredPresets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => applyGenerationPreset(preset)}
                className="block w-full rounded bg-[#2a2a2a] px-2 py-1 text-left text-xs text-zinc-300 transition-colors hover:bg-[#333]"
                disabled={isSessionActive}
                type="button"
              >
                {preset.name}
              </button>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] font-medium uppercase text-zinc-500" htmlFor="generation-bpm-input">
              BPM
            </label>
            <input
              id="generation-bpm-input"
              type="number"
              value={generationForm.bpm}
              onChange={(event) => setGenerationBpm(Number(event.target.value))}
              className="mt-1 w-full rounded border border-[#444] bg-[#2a2a2a] px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
              min={MIN_BPM}
              max={MAX_BPM}
              disabled={isSessionActive}
              aria-label="Generation BPM"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium uppercase text-zinc-500" htmlFor="generation-key-select">
              Key
            </label>
            <select
              id="generation-key-select"
              value={generationForm.keyScale}
              onChange={(event) => setGenerationKeyScale(event.target.value)}
              className="mt-1 w-full rounded border border-[#444] bg-[#2a2a2a] px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
              disabled={isSessionActive}
              aria-label="Generation key"
            >
              {KEY_SCALES.map((keyScale) => (
                <option key={keyScale} value={keyScale}>
                  {keyScale}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium uppercase text-zinc-500" htmlFor="generation-length-input">
              Length (s)
            </label>
            <input
              id="generation-length-input"
              type="number"
              value={generationForm.lengthSeconds}
              onChange={(event) => setGenerationLengthSeconds(Number(event.target.value))}
              className="mt-1 w-full rounded border border-[#444] bg-[#2a2a2a] px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
              min={MIN_DURATION}
              max={MAX_DURATION}
              disabled={isSessionActive}
              aria-label="Generation length"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium uppercase text-zinc-500" htmlFor="generation-variation-count">
              Variations
            </label>
            <select
              id="generation-variation-count"
              value={generationForm.variationCount}
              onChange={(event) => setGenerationVariationCount(Number(event.target.value))}
              className="mt-1 w-full rounded border border-[#444] bg-[#2a2a2a] px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
              disabled={isSessionActive}
              aria-label="Generation variation count"
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-medium uppercase text-zinc-500" htmlFor="generation-temperature-slider">
              Temperature
            </label>
            <span className="text-xs text-zinc-300">{generationForm.temperature.toFixed(2)}</span>
          </div>
          <input
            id="generation-temperature-slider"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={generationForm.temperature}
            onChange={(event) => setGenerationTemperature(Number(event.target.value))}
            className="w-full accent-indigo-500"
            disabled={isSessionActive}
            aria-label="Generation temperature"
            data-testid="generation-temperature-slider"
          />
          <div className="flex justify-between text-[10px] text-zinc-600">
            <span>Stable</span>
            <span>Experimental</span>
          </div>
        </section>

        <section className="space-y-2">
          <button
            onClick={() => setShowLyrics((value) => !value)}
            className="text-[11px] font-medium uppercase text-zinc-500 transition-colors hover:text-zinc-300"
            type="button"
          >
            Lyrics {showLyrics ? '[-]' : '[+]'}
          </button>
          {showLyrics && (
            <textarea
              value={generationForm.lyrics}
              onChange={(event) => setGenerationLyrics(event.target.value)}
              placeholder="[verse]\nYour lyrics here..."
              className="w-full resize-none rounded border border-[#444] bg-[#2a2a2a] px-2 py-1.5 font-mono text-xs focus:border-indigo-500 focus:outline-none"
              rows={4}
              disabled={isSessionActive}
              aria-label="Generation lyrics"
            />
          )}
        </section>

        <button
          onClick={handleGenerate}
          disabled={Boolean(validationError) || isSessionActive}
          className="w-full rounded bg-indigo-600 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500"
          data-testid="generation-generate-btn"
        >
          {isSessionActive ? 'Generating...' : `Generate ${generationForm.variationCount} Variation${generationForm.variationCount === 1 ? '' : 's'}`}
        </button>

        {jobs.length > 0 && (
          <section className="space-y-2" data-testid="generation-live-jobs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase text-zinc-500">Live Progress</span>
              <span className="text-[10px] text-zinc-600">
                Store-backed backend stages
              </span>
            </div>

            {jobs.map((job) => {
              const eta = job.etaSeconds != null && (job.etaConfidence === 'medium' || job.etaConfidence === 'high')
                ? formatEtaDisplay(job.etaSeconds)
                : null;
              const progressLabel = job.progressPercent != null
                ? `${Math.round(job.progressPercent)}%`
                : job.status === 'queued'
                  ? 'Queued'
                  : null;

              return (
                <div
                  key={job.id}
                  className="rounded border border-[#333] bg-[#252525] px-2 py-2"
                  data-testid={`generation-job-${job.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium uppercase text-zinc-200">{job.trackName}</div>
                      <div className="mt-0.5 text-[10px] text-zinc-400">
                        {job.stage ?? 'Generation update pending'}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium ${VARIATION_STATUS_COLORS[job.status === 'queued' ? 'pending' : job.status]}`}>
                      {progressLabel ?? VARIATION_STATUS_LABELS[job.status === 'queued' ? 'pending' : job.status]}
                    </span>
                  </div>

                  {job.progressPercent != null && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#1b1b1b]">
                      <div
                        className="h-full rounded-full bg-indigo-500 transition-[width] duration-300"
                        style={{ width: `${job.progressPercent}%` }}
                        aria-label={`${job.trackName} progress ${Math.round(job.progressPercent)} percent`}
                      />
                    </div>
                  )}

                  <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-zinc-500">
                    <span>{job.progress}</span>
                    {eta ? <span>ETA: {eta}</span> : <span>{job.stage ? 'ETA pending' : 'Waiting for backend'}</span>}
                  </div>

                  {job.status === 'error' && job.actionableMessage && (
                    <div className="mt-1 text-[10px] text-red-300">{job.actionableMessage}</div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {variationSession && (
          <section className="space-y-2" data-testid="variation-cards">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase text-zinc-500">Variations</span>
              <span className="text-[10px] text-zinc-600">
                Press 1-{variationSession.variations.length} to switch
              </span>
            </div>

            {variationSession.variations.map((variation) => {
              const isActive = variation.index === variationSession.activeVariationIndex;
              const etaSeconds = variation.etaSeconds ?? computeEta(variation.startedAt, variation.progressPercent);
              const etaLabel = formatEtaDisplay(etaSeconds);

              return (
                <button
                  key={variation.index}
                  onClick={() => {
                    setActiveVariation(variation.index);
                    if (variation.clipId) {
                      selectClip(variation.clipId, false);
                    }
                  }}
                  className={`flex w-full items-center gap-2 rounded border px-2 py-1.5 text-left transition-colors ${
                    isActive
                      ? 'border-indigo-500/50 bg-indigo-900/40'
                      : 'border-transparent bg-[#2a2a2a] hover:border-[#444]'
                  }`}
                  type="button"
                  data-testid={`variation-card-${variation.index}`}
                  aria-label={`Variation ${variation.index + 1}`}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold ${
                      isActive ? 'bg-indigo-600 text-white' : 'bg-[#333] text-zinc-400'
                    }`}
                  >
                    {variation.index + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${VARIATION_STATUS_COLORS[variation.status]}`}>
                        {VARIATION_STATUS_LABELS[variation.status]}
                      </span>
                      {variation.status === 'generating' && (
                        <div className="h-2.5 w-2.5 rounded-full border border-indigo-400 border-t-transparent animate-spin" />
                      )}
                    </div>
                    {variation.stage && (
                      <span className="mt-0.5 block text-[10px] text-zinc-400">{variation.stage}</span>
                    )}
                    {variation.progress && !variation.stage && (
                      <span className="mt-0.5 block text-[10px] text-zinc-500">{variation.progress}</span>
                    )}
                    {variation.progressPercent !== undefined && variation.status === 'generating' && (
                      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-zinc-700">
                        <div
                          className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                          style={{ width: `${Math.min(100, variation.progressPercent)}%` }}
                        />
                      </div>
                    )}
                    {etaLabel && (
                      <span className="block text-[10px] text-zinc-600" data-testid={`variation-eta-${variation.index}`}>ETA: {etaLabel}</span>
                    )}
                    {variation.error && (
                      <span className="mt-0.5 block truncate text-[10px] text-red-400">{variation.error}</span>
                    )}
                  </div>
                </button>
              );
            })}

            <div className="flex gap-2">
              {variationSession.status === 'generating' ? (
                <button
                  onClick={cancelVariationSession}
                  className="flex-1 rounded bg-red-900/20 py-1 text-[11px] text-red-400 transition-colors hover:bg-red-900/30 hover:text-red-300"
                  type="button"
                  data-testid="cancel-generation-btn"
                >
                  Cancel
                </button>
              ) : (
                <button
                  onClick={clearVariationSession}
                  className="flex-1 rounded bg-[#333] py-1 text-[11px] text-zinc-500 transition-colors hover:bg-[#444] hover:text-zinc-300"
                  type="button"
                >
                  Clear
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
