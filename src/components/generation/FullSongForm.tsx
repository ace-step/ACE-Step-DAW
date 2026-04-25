import { useCallback, useEffect, useRef, useState } from 'react';
import { ExpandEditorModal } from './ExpandEditorModal';
import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';
import { useModelStore } from '../../store/modelStore';
import { useUIStore } from '../../store/uiStore';
import { MAX_DURATION, MIN_DURATION } from '../../constants/defaults';
import { VOCAL_LANGUAGES, DEFAULT_VOCAL_LANGUAGE } from '../../constants/languages';
import { generateText2Music, regenerateClip } from '../../services/generationPipeline';
import { formatInput, createRandomSample } from '../../services/aceStepApi';
import { toastError, toastInfo } from '../../hooks/useToast';
import { PromptAutocompleteTextarea } from './PromptAutocompleteTextarea';
import { TimbrePresetPicker } from './TimbrePresetPicker';
import { NegativePromptSection } from './NegativePromptSection';

/** Magic pen icon for AI enhance buttons */
function MagicPenIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.5 20.5l1.5-4.5 3 3-4.5 1.5zM7.5 13.5l3 3 9-9-3-3-9 9z" opacity="0.85" />
      <path d="M17 2l-1.5 3.5L12 7l3.5 1.5L17 12l1.5-3.5L22 7l-3.5-1.5L17 2z" />
      <path d="M7 2L6.25 3.75 4.5 4.5l1.75.75L7 7l.75-1.75L9.5 4.5 7.75 3.75 7 2z" opacity="0.6" />
    </svg>
  );
}

/** Expand/fullscreen icon for textarea expand buttons */
function ExpandIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}


interface FullSongFormProps {
  /** Pre-filled data from Simple mode's Create Sample */
  initialData?: {
    caption: string;
    lyrics: string;
    bpm: number | null;
    keyScale: string;
    duration: number;
    timeSignature: string;
    vocalLanguage: string;
  } | null;
  /** Called whenever footer button state changes */
  onFooterChange: (footer: { label: string; disabled: boolean; action: () => void; thinkingState?: { checked: boolean; onChange: (v: boolean) => void; disabled: boolean } }) => void;
}

/** Predefined style tags for quick selection, organized by category */
const STYLE_TAG_OPTIONS = [
  { value: 'lo-fi', category: 'genre' },
  { value: 'synthwave', category: 'genre' },
  { value: 'ambient', category: 'genre' },
  { value: 'house', category: 'genre' },
  { value: 'techno', category: 'genre' },
  { value: 'trap', category: 'genre' },
  { value: 'jazz', category: 'genre' },
  { value: 'cinematic', category: 'genre' },
  { value: 'warm', category: 'mood' },
  { value: 'dark', category: 'mood' },
  { value: 'dreamy', category: 'mood' },
  { value: 'uplifting', category: 'mood' },
] as const;
const DEFAULT_GENERATION_TEMPERATURE = 0.7;

export function FullSongForm({ initialData, onFooterChange }: FullSongFormProps) {
  const project = useProjectStore((s) => s.project);
  const isGenerating = useGenerationStore((s) => s.isGenerating);
  const modelLoadingState = useModelStore((s) => s.modelLoadingState);
  const getPromptAutocompleteSuggestions = useGenerationStore((s) => s.getPromptAutocompleteSuggestions);
  const applyPromptAutocompleteSuggestion = useGenerationStore((s) => s.applyPromptAutocompleteSuggestion);

  // Persisted in generationStore — survives panel close/reopen
  const prompt = useGenerationStore((s) => s.generationForm.prompt);
  const setPrompt = useGenerationStore((s) => s.setGenerationPrompt);
  const negativePrompt = useGenerationStore((s) => s.generationForm.negativePrompt ?? '');
  const setNegativePrompt = useGenerationStore((s) => s.setGenerationNegativePrompt);
  const lyrics = useGenerationStore((s) => s.generationForm.lyrics);
  const setLyrics = useGenerationStore((s) => s.setGenerationLyrics);
  const thinking = useGenerationStore((s) => s.generationForm.thinking);
  const setThinking = useGenerationStore((s) => s.setGenerationThinking);
  const seedStr = useGenerationStore((s) => s.generationForm.seed);
  const setSeedStr = useGenerationStore((s) => s.setGenerationSeed);
  const styleTags = useGenerationStore((s) => s.generationForm.styleTags);
  const toggleStyleTag = useGenerationStore((s) => s.toggleGenerationStyleTag);
  const temperature = useGenerationStore((s) => s.generationForm.temperature);
  const setTemperature = useGenerationStore((s) => s.setGenerationTemperature);
  // Stable fallback seed — only generated once per component mount, not on every render
  const fallbackSeed = useRef(Math.floor(Math.random() * 2147483647));
  const parsedSeed = Number(seedStr);
  const seed = Number.isFinite(parsedSeed) && parsedSeed > 0 ? parsedSeed : fallbackSeed.current;
  const setSeed = useCallback((v: number) => setSeedStr(String(v)), [setSeedStr]);
  const useRandomSeed = useGenerationStore((s) => s.generationForm.useRandomSeed);
  const setUseRandomSeed = useGenerationStore((s) => s.setGenerationUseRandomSeed);

  // Local state — reset on panel reopen (less critical)
  const [instrumental, setInstrumental] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(-1);
  const [durationAuto, setDurationAuto] = useState(true);
  const [vocalLanguage, setVocalLanguage] = useState(DEFAULT_VOCAL_LANGUAGE);
  const [splitToStems, setSplitToStems] = useState(false);
  const [stemCount, setStemCount] = useState<2 | 4 | 6>(4);
  const [useProjectMeta, setUseProjectMeta] = useState(true);
  const [syncMetaToProject, setSyncMetaToProject] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enhancingCaption, setEnhancingCaption] = useState(false);
  const [enhancingLyrics, setEnhancingLyrics] = useState(false);
  const [loadingExample, setLoadingExample] = useState(false);
  const [expandCaption, setExpandCaption] = useState(false);
  const [expandLyrics, setExpandLyrics] = useState(false);
  const [legacyGuidanceScale, setLegacyGuidanceScale] = useState<number | null>(null);

  const handleEnhanceCaption = useCallback(async () => {
    if (!prompt.trim()) return;
    setEnhancingCaption(true);
    try {
      const result = await formatInput({
        prompt: prompt.trim(),
        lyrics,
        language: vocalLanguage !== 'unknown' ? vocalLanguage : undefined,
      });
      if (result.caption) setPrompt(result.caption);
      toastInfo('Caption enhanced');
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to enhance caption');
    } finally {
      setEnhancingCaption(false);
    }
  }, [prompt, lyrics, vocalLanguage]);

  const handleEnhanceLyrics = useCallback(async () => {
    if (!lyrics.trim() && !prompt.trim()) return;
    setEnhancingLyrics(true);
    try {
      const result = await formatInput({
        prompt: prompt.trim(),
        lyrics: lyrics.trim(),
        language: vocalLanguage !== 'unknown' ? vocalLanguage : undefined,
      });
      if (result.lyrics) setLyrics(result.lyrics);
      if (result.caption && !prompt.trim()) setPrompt(result.caption);
      toastInfo('Lyrics enhanced');
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to enhance lyrics');
    } finally {
      setEnhancingLyrics(false);
    }
  }, [prompt, lyrics, vocalLanguage]);

  const handleRandomExample = useCallback(async () => {
    setLoadingExample(true);
    try {
      const sample = await createRandomSample('custom_mode');
      if (sample.caption) setPrompt(sample.caption);
      if (sample.lyrics) setLyrics(sample.lyrics);
      if (sample.language) setVocalLanguage(sample.language);
      if (sample.duration && sample.duration > 0) {
        setDurationSeconds(sample.duration);
        setDurationAuto(false);
      }
      toastInfo('Random example loaded');
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to load example');
    } finally {
      setLoadingExample(false);
    }
  }, []);

  // Apply initial data from Simple mode's Create Sample
  useEffect(() => {
    if (!initialData) return;
    setPrompt(initialData.caption);
    setLyrics(initialData.lyrics);
    if (initialData.duration > 0) {
      setDurationSeconds(initialData.duration);
      setDurationAuto(false);
    }
    if (initialData.vocalLanguage) setVocalLanguage(initialData.vocalLanguage);
  }, [initialData]);

  // Edit mode: hydrate form from clip's stored generationParams
  const editingClipId = useUIStore((s) => s.editingText2MusicClipId);
  const editingClip = useProjectStore((s) =>
    editingClipId ? s.project?.tracks.flatMap((t) => t.clips).find((c) => c.id === editingClipId) : undefined,
  );
  const hydratedClipIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editingClipId || !editingClip || hydratedClipIdRef.current === editingClipId) return;
    hydratedClipIdRef.current = editingClipId;
    const p = editingClip.generationParams;
    if (p) {
      setPrompt(p.prompt);
      setLyrics(p.lyrics);
      if (p.thinking !== undefined) setThinking(p.thinking);
      if (p.seed !== undefined) { setSeed(p.seed); setUseRandomSeed(false); }
      if (p.useRandomSeed !== undefined) setUseRandomSeed(p.useRandomSeed);
      if (p.vocalLanguage) setVocalLanguage(p.vocalLanguage);
      if (p.instrumental !== undefined) setInstrumental(p.instrumental);
      if (p.durationSeconds !== undefined && p.durationSeconds > 0) {
        setDurationSeconds(p.durationSeconds);
        setDurationAuto(false);
      } else {
        setDurationSeconds(-1);
        setDurationAuto(true);
      }
      if (p.splitToStems !== undefined) setSplitToStems(p.splitToStems);
      if (p.stemCount !== undefined) setStemCount(p.stemCount);
      if (p.useProjectMeta !== undefined) setUseProjectMeta(p.useProjectMeta);
      const persistedTemperature = (p as { temperature?: unknown }).temperature;
      const persistedGuidanceScale = p.guidanceScale;
      if (
        typeof persistedTemperature === 'number' &&
        persistedTemperature >= 0 &&
        persistedTemperature <= 1
      ) {
        setTemperature(persistedTemperature);
        setLegacyGuidanceScale(null);
      } else if (
        typeof persistedGuidanceScale === 'number' &&
        persistedGuidanceScale >= 0 &&
        persistedGuidanceScale <= 1
      ) {
        setTemperature(persistedGuidanceScale);
        setLegacyGuidanceScale(null);
      } else if (
        typeof persistedGuidanceScale === 'number' &&
        Number.isFinite(persistedGuidanceScale) &&
        persistedGuidanceScale >= 0
      ) {
        setTemperature(DEFAULT_GENERATION_TEMPERATURE);
        setLegacyGuidanceScale(persistedGuidanceScale);
      } else {
        setTemperature(DEFAULT_GENERATION_TEMPERATURE);
        setLegacyGuidanceScale(null);
      }
      // Hydrate style tags from clip to avoid double-prepend
      useGenerationStore.getState().setGenerationStyleTags(p.styleTags ?? []);
    } else {
      // Backward compatibility: hydrate from basic clip fields
      setPrompt(editingClip.prompt || '');
      setLyrics(editingClip.lyrics || '');
      if (editingClip.audioDuration && editingClip.audioDuration > 0) {
        setDurationSeconds(editingClip.audioDuration);
        setDurationAuto(false);
      }
      setInstrumental(editingClip.lyrics === '[Instrumental]');
      setTemperature(DEFAULT_GENERATION_TEMPERATURE);
      setLegacyGuidanceScale(null);
      useGenerationStore.getState().setGenerationStyleTags([]);
    }
  }, [editingClipId, editingClip]);
  useEffect(() => {
    if (!editingClipId) {
      hydratedClipIdRef.current = null;
      setLegacyGuidanceScale(null);
    }
  }, [editingClipId]);

  // Only disable form during model loading, NOT during generation.
  // Generation runs in background — user should be able to edit/start new tasks.
  const isDisabled = modelLoadingState === 'loading';
  const isSubmitDisabled = isGenerating || isDisabled;
  const handleTemperatureChange = useCallback((nextTemperature: number) => {
    setLegacyGuidanceScale(null);
    setTemperature(nextTemperature);
  }, [setTemperature]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      setError('Please describe your song');
      return;
    }
    setError(null);
    const effectiveGuidanceScale = editingClipId ? (legacyGuidanceScale ?? temperature) : temperature;

    // Close the generation panel so user sees the timeline with the loading clip
    useUIStore.getState().setShowGenerationPanel(false);

    // Edit mode: update stored params on existing clip, then regenerate
    if (editingClipId) {
      const store = useProjectStore.getState();
      store.updateClip(editingClipId, {
        generationParams: {
          type: 'text2music',
          prompt: prompt.trim(),
          lyrics: instrumental ? '[Instrumental]' : lyrics,
          durationSeconds: durationSeconds === -1 ? undefined : durationSeconds,
          thinking,
          seed: useRandomSeed ? undefined : seed,
          useRandomSeed,
          vocalLanguage: instrumental ? 'unknown' : vocalLanguage,
          instrumental,
          splitToStems,
          stemCount,
          useProjectMeta,
          inferenceSteps: project?.generationDefaults?.inferenceSteps,
          guidanceScale: effectiveGuidanceScale,
          temperature: legacyGuidanceScale === null ? temperature : undefined,
          shift: project?.generationDefaults?.shift,
          styleTags: styleTags.length > 0 ? [...styleTags] : undefined,
        },
      });
      useUIStore.getState().setEditingText2MusicClipId(null);
      regenerateClip(editingClipId).catch((err) => {
        setError(err instanceof Error ? err.message : 'Regeneration failed');
      });
      return;
    }

    // New generation: fire-and-forget, runs in background.
    // Pass raw prompt + styleTags separately — pipeline handles prepending.
    generateText2Music({
      prompt: prompt.trim(),
      lyrics: instrumental ? '[Instrumental]' : lyrics,
      durationSeconds: durationSeconds === -1 ? undefined as unknown as number : durationSeconds,
      bpm: useProjectMeta ? (project?.bpm ?? null) : null,
      keyScale: useProjectMeta ? (project?.keyScale ?? '') : '',
      timeSignature: useProjectMeta ? String(project?.timeSignature ?? 4) : '',
      splitToStems,
      stemCount,
      inferenceSteps: project?.generationDefaults?.inferenceSteps,
      guidanceScale: effectiveGuidanceScale,
      temperature,
      shift: project?.generationDefaults?.shift,
      thinking,
      seed: useRandomSeed ? undefined : seed,
      useRandomSeed,
      vocalLanguage: instrumental ? 'unknown' : vocalLanguage,
      syncMetaToProject: thinking || (!useProjectMeta && syncMetaToProject),
      instrumental,
      useProjectMeta,
      negativePrompt: negativePrompt.trim() || undefined,
      styleTags: styleTags.length > 0 ? [...styleTags] : undefined,
    }).catch((err) => {
      setError(err instanceof Error ? err.message : 'Generation failed');
    });
  }, [prompt, lyrics, instrumental, durationSeconds, project, splitToStems, stemCount, thinking, seed, useRandomSeed, useProjectMeta, syncMetaToProject, vocalLanguage, editingClipId, styleTags, temperature, legacyGuidanceScale]);

  // Sync footer state to parent on every render
  const footerAction = useCallback(() => void handleGenerate(), [handleGenerate]);
  onFooterChange({
    label: isGenerating ? 'Generating...' : (editingClipId ? 'Re-generate' : 'Generate Full Song'),
    disabled: isSubmitDisabled || !prompt.trim(),
    action: footerAction,
    thinkingState: { checked: thinking, onChange: setThinking, disabled: isSubmitDisabled },
  });

  return (
    <div className="flex-1 space-y-4 overflow-y-auto px-3 py-3" data-testid="full-song-form">
      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-950/30 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      {/* Music Caption */}
      <section className="space-y-1.5">
        <label className="block text-[11px] font-medium uppercase text-zinc-400">
          Music Caption
        </label>
        <TimbrePresetPicker onSelect={(preset) => setPrompt(preset.promptTemplate)} />
        <div className="relative">
          <PromptAutocompleteTextarea
            value={prompt}
            onChange={setPrompt}
            disabled={isDisabled}
            getSuggestions={getPromptAutocompleteSuggestions}
            applySuggestion={applyPromptAutocompleteSuggestion}
          />
          <button
            type="button"
            onClick={handleEnhanceCaption}
            disabled={isDisabled || enhancingCaption}
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded text-white/80 transition-colors hover:text-white disabled:opacity-20 disabled:cursor-not-allowed"
            title="AI enhance caption"
          >
            {enhancingCaption ? <span className="animate-spin">...</span> : <MagicPenIcon />}
          </button>
          <button
            type="button"
            onClick={() => setExpandCaption(true)}
            className="absolute right-2 bottom-1.5 flex h-7 w-7 items-center justify-center rounded text-white/60 transition-colors hover:text-white"
            title="Expand editor"
          >
            <ExpandIcon />
          </button>
        </div>
        <ExpandEditorModal
          isOpen={expandCaption}
          title="Music Caption"
          value={prompt}
          onChange={setPrompt}
          onClose={() => setExpandCaption(false)}
          onEnhance={handleEnhanceCaption}
          enhancing={enhancingCaption}
          disabled={isDisabled}
          placeholder="Describe the music you want to generate..."
        />
      </section>

      {/* Negative Prompt (collapsed by default) */}
      <NegativePromptSection
        value={negativePrompt}
        onChange={setNegativePrompt}
        disabled={isDisabled}
      />

      {/* Lyrics — with Language + Instrumental inline */}
      <section className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-medium uppercase text-zinc-400">Lyrics</label>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-zinc-500">Lang</span>
              <select
                value={vocalLanguage}
                onChange={(e) => setVocalLanguage(e.target.value)}
                className="rounded border border-[#444] bg-[#2a2a2a] px-1 py-0.5 text-[10px] focus:border-indigo-500 focus:outline-none"
                disabled={isDisabled || instrumental}
              >
                {VOCAL_LANGUAGES.map((lang) => (
                  <option key={lang.value} value={lang.value}>{lang.label}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={instrumental}
                onChange={(e) => {
                  setInstrumental(e.target.checked);
                  if (e.target.checked) setLyrics('[Instrumental]');
                  else if (lyrics === '[Instrumental]') setLyrics('');
                }}
                className="h-3.5 w-3.5 rounded border-[#444] bg-[#2a2a2a] accent-indigo-500"
                disabled={isDisabled}
              />
              <span className="text-[10px] text-zinc-500">Instrumental</span>
            </label>
          </div>
        </div>
        <div className="relative">
          <textarea
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            rows={5}
            placeholder="[Verse 1]\nYour lyrics here..."
            className="w-full resize-none rounded border border-[#444] bg-[#2a2a2a] px-2 py-1.5 pr-8 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
            disabled={isDisabled || instrumental}
            data-testid="full-song-lyrics"
          />
          <button
            type="button"
            onClick={handleEnhanceLyrics}
            disabled={isDisabled || enhancingLyrics || instrumental}
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded text-white/80 transition-colors hover:text-white disabled:opacity-20 disabled:cursor-not-allowed"
            title="AI enhance lyrics"
          >
            {enhancingLyrics ? <span className="animate-spin">...</span> : <MagicPenIcon />}
          </button>
          <button
            type="button"
            onClick={() => setExpandLyrics(true)}
            disabled={instrumental}
            className="absolute right-2 bottom-1.5 flex h-7 w-7 items-center justify-center rounded text-white/60 transition-colors hover:text-white disabled:opacity-20 disabled:cursor-not-allowed"
            title="Expand editor"
          >
            <ExpandIcon />
          </button>
        </div>
        <ExpandEditorModal
          isOpen={expandLyrics}
          title="Lyrics"
          value={lyrics}
          onChange={setLyrics}
          onClose={() => setExpandLyrics(false)}
          onEnhance={handleEnhanceLyrics}
          enhancing={enhancingLyrics}
          mono
          disabled={isDisabled || instrumental}
          placeholder="[Verse 1]\nYour lyrics here..."
        />
      </section>

      {/* Random Example */}
      <button
        type="button"
        onClick={handleRandomExample}
        disabled={isDisabled || loadingExample}
        className="w-full rounded border border-dashed border-zinc-600 py-1.5 text-[11px] text-zinc-400 transition-colors hover:border-zinc-400 hover:text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loadingExample ? 'Loading...' : '🎲 Random Example'}
      </button>

      {/* Style Tags */}
      <section className="space-y-1.5" data-testid="style-tags-section">
        <label className="block text-[11px] font-medium uppercase text-zinc-400">
          Style Tags
        </label>
        <div className="flex flex-wrap gap-1.5">
          {STYLE_TAG_OPTIONS.map((tag) => {
            const isActive = styleTags.includes(tag.value);
            return (
              <button
                key={tag.value}
                type="button"
                data-testid={`style-tag-${tag.value}`}
                onClick={() => toggleStyleTag(tag.value)}
                disabled={isDisabled}
                aria-pressed={isActive}
                aria-label={`${isActive ? 'Remove' : 'Add'} ${tag.value} style tag`}
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'bg-[#333] text-zinc-400 hover:bg-[#444]'
                }`}
              >
                {tag.value}
              </button>
            );
          })}
        </div>
      </section>

      {/* Parameters grid */}
      <section className="grid grid-cols-2 gap-x-3 gap-y-2">
        <div className="col-span-2 space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-medium uppercase text-zinc-500">Temperature</label>
            <span className="font-mono text-[10px] text-zinc-400">{temperature.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={temperature}
            onChange={(e) => handleTemperatureChange(Number(e.target.value))}
            className="w-full accent-indigo-500"
            disabled={isDisabled}
            data-testid="full-song-temperature"
            aria-label="Generation temperature"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase text-zinc-500">Duration</label>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={durationSeconds === -1 ? '' : durationSeconds}
              onChange={(e) => setDurationSeconds(e.target.value === '' ? -1 : Number(e.target.value))}
              placeholder="Auto"
              min={MIN_DURATION}
              max={MAX_DURATION}
              step={1}
              className="w-full rounded border border-[#444] bg-[#2a2a2a] px-1.5 py-1 text-[11px] focus:border-indigo-500 focus:outline-none"
              disabled={isDisabled || durationAuto}
            />
            <label className="flex items-center gap-1 cursor-pointer shrink-0" title="Auto-detect duration">
              <input
                type="checkbox"
                checked={durationAuto}
                onChange={(e) => {
                  setDurationAuto(e.target.checked);
                  if (e.target.checked) setDurationSeconds(-1);
                  else setDurationSeconds(30);
                }}
                className="h-3 w-3 rounded border-[#444] accent-indigo-500"
                disabled={isDisabled}
              />
              <span className="text-[9px] text-zinc-500">Auto</span>
            </label>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase text-zinc-500">Seed</label>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value))}
              className="w-full rounded border border-[#444] bg-[#2a2a2a] px-1.5 py-1 text-[11px] font-mono focus:border-indigo-500 focus:outline-none"
              disabled={isDisabled || useRandomSeed}
            />
            <button
              type="button"
              onClick={() => { setSeed(Math.floor(Math.random() * 2147483647)); setUseRandomSeed(false); }}
              className="shrink-0 text-[13px] leading-none transition-opacity hover:opacity-80"
              title="Random seed"
              disabled={isDisabled}
            >🎲</button>
            <label className="flex items-center gap-1 cursor-pointer shrink-0" title="Use random seed each time">
              <input
                type="checkbox"
                checked={useRandomSeed}
                onChange={(e) => setUseRandomSeed(e.target.checked)}
                className="h-3 w-3 rounded border-[#444] accent-indigo-500"
                disabled={isDisabled}
              />
              <span className="text-[9px] text-zinc-500">Rand</span>
            </label>
          </div>
        </div>

      </section>

      {/* Options — two-column tree layout */}
      <section className="grid grid-cols-2 gap-x-3">

        {/* ── Split to stems ── */}
        <div>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={splitToStems}
              onChange={(e) => setSplitToStems(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-[#444] bg-[#2a2a2a] accent-indigo-500"
              disabled={isDisabled}
              data-testid="full-song-split-stems"
            />
            <span className="text-[11px] font-medium text-zinc-300">Split to stems</span>
          </label>
          {splitToStems && (
            <div className="ml-4 mt-1 border-l border-zinc-700 pl-3">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-zinc-500">Count</span>
                {([2, 4, 6] as const).map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setStemCount(count)}
                    className={`rounded px-2 py-0.5 text-[10px] transition-colors ${
                      stemCount === count
                        ? 'bg-indigo-600 text-white'
                        : 'bg-[#333] text-zinc-400 hover:bg-[#444]'
                    }`}
                    disabled={isDisabled}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Match project settings ── */}
        <div>
          <label className="flex items-center gap-1.5 cursor-pointer flex-wrap">
            <input
              type="checkbox"
              checked={useProjectMeta}
              onChange={(e) => setUseProjectMeta(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-[#444] bg-[#2a2a2a] accent-indigo-500"
              disabled={isDisabled}
            />
            <span className="text-[11px] font-medium text-zinc-300">Match project</span>
            {useProjectMeta && project && (
              <span className="text-[9px] text-zinc-500">
                {[
                  project.bpm ? `${project.bpm} BPM` : null,
                  project.keyScale || null,
                  project.timeSignature ? `${project.timeSignature}/4` : null,
                ].filter(Boolean).join(' · ') || ''}
              </span>
            )}
          </label>
          {!useProjectMeta && (
            <div className="ml-4 mt-1 border-l border-zinc-700 pl-3">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={syncMetaToProject}
                  onChange={(e) => setSyncMetaToProject(e.target.checked)}
                  className="h-3 w-3 rounded border-[#444] bg-[#2a2a2a] accent-indigo-500"
                  disabled={isDisabled}
                />
                <span className="text-[10px] text-zinc-400">Apply to project</span>
              </label>
            </div>
          )}
        </div>

      </section>

    </div>
  );
}
