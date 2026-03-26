import { useCallback, useEffect, useMemo, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';
import { useModelStore } from '../../store/modelStore';
import { MAX_DURATION, MIN_DURATION } from '../../constants/defaults';
import { getModelDefaults, inferModelVariant, type ModelVariant } from '../../constants/modelDefaults';
import { generateText2Music } from '../../services/generationPipeline';
import { PromptAutocompleteTextarea } from './PromptAutocompleteTextarea';

const VARIANT_LABELS: Record<ModelVariant, string> = {
  turbo: 'Turbo',
  base: 'Base',
  sft: 'SFT',
};

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
  onFooterChange: (footer: { label: string; disabled: boolean; action: () => void }) => void;
}

export function FullSongForm({ initialData, onFooterChange }: FullSongFormProps) {
  const project = useProjectStore((s) => s.project);
  const isGenerating = useGenerationStore((s) => s.isGenerating);
  const modelLoadingState = useModelStore((s) => s.modelLoadingState);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const availableModels = useModelStore((s) => s.availableModels);
  const getPromptAutocompleteSuggestions = useGenerationStore((s) => s.getPromptAutocompleteSuggestions);
  const applyPromptAutocompleteSuggestion = useGenerationStore((s) => s.applyPromptAutocompleteSuggestion);

  // Resolve model variant and defaults
  const activeModel = useMemo(
    () => availableModels.find((m) => m.name === activeModelId),
    [availableModels, activeModelId],
  );
  const modelVariant = useMemo(
    () => activeModel ? inferModelVariant(activeModel) : 'base',
    [activeModel],
  );
  const modelDefaults = useMemo(
    () => activeModel ? getModelDefaults(activeModel) : getModelDefaults({}),
    [activeModel],
  );

  const [prompt, setPrompt] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [instrumental, setInstrumental] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(30);
  const [durationAuto, setDurationAuto] = useState(false);
  const [seed, setSeed] = useState(Math.floor(Math.random() * 2147483647));
  const [useRandomSeed, setUseRandomSeed] = useState(true);
  const [vocalLanguage, setVocalLanguage] = useState('unknown');
  const [splitToStems, setSplitToStems] = useState(false);
  const [stemCount, setStemCount] = useState<2 | 4 | 6>(4);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [inferenceSteps, setInferenceSteps] = useState(modelDefaults.inferenceSteps);
  const [guidanceScale, setGuidanceScale] = useState(modelDefaults.guidanceScale);
  const [shift, setShift] = useState(modelDefaults.shift);
  const [thinking, setThinking] = useState(modelDefaults.thinking);
  const [error, setError] = useState<string | null>(null);

  // Apply initial data from Simple mode's Create Sample
  useEffect(() => {
    if (!initialData) return;
    setPrompt(initialData.caption);
    setLyrics(initialData.lyrics);
    if (initialData.duration > 0) setDurationSeconds(initialData.duration);
    if (initialData.vocalLanguage) setVocalLanguage(initialData.vocalLanguage);
  }, [initialData]);

  const isDisabled = isGenerating || modelLoadingState === 'loading';

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      setError('Please describe your song');
      return;
    }
    setError(null);

    try {
      await generateText2Music({
        prompt: prompt.trim(),
        lyrics: instrumental ? '[Instrumental]' : lyrics,
        durationSeconds: durationSeconds === -1 ? undefined as unknown as number : durationSeconds,
        bpm: project?.bpm ?? null,
        keyScale: project?.keyScale ?? '',
        timeSignature: String(project?.timeSignature ?? 4),
        splitToStems,
        stemCount,
        inferenceSteps,
        guidanceScale,
        shift,
        thinking,
        seed: useRandomSeed ? undefined : seed,
        useRandomSeed,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    }
  }, [prompt, lyrics, instrumental, durationSeconds, project?.bpm, project?.keyScale, project?.timeSignature, splitToStems, stemCount, inferenceSteps, guidanceScale, shift, thinking, seed, useRandomSeed]);

  // Sync footer state to parent on every render
  const footerAction = useCallback(() => void handleGenerate(), [handleGenerate]);
  onFooterChange({
    label: isDisabled ? 'Generating...' : 'Generate Full Song',
    disabled: isDisabled || !prompt.trim(),
    action: footerAction,
  });

  return (
    <div className="flex-1 space-y-4 overflow-y-auto px-3 py-3" data-testid="full-song-form">
      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-950/30 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      {/* Model variant indicator */}
      {activeModel && (
        <div className="flex items-center gap-2 rounded border border-[#333] bg-[#1a1a1a] px-2.5 py-1.5">
          <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            modelVariant === 'turbo' ? 'bg-amber-500/20 text-amber-300' :
            modelVariant === 'sft' ? 'bg-emerald-500/20 text-emerald-300' :
            'bg-blue-500/20 text-blue-300'
          }`}>
            {VARIANT_LABELS[modelVariant]}
          </span>
          <span className="truncate text-[10px] text-zinc-500" title={activeModel.name}>
            {activeModel.name}
          </span>
          <span className="ml-auto text-[9px] text-zinc-600">
            {modelDefaults.inferenceSteps} steps
          </span>
        </div>
      )}

      {/* Music Caption */}
      <section className="space-y-1.5">
        <label className="block text-[11px] font-medium uppercase text-zinc-400">
          Music Caption
        </label>
        <PromptAutocompleteTextarea
          value={prompt}
          onChange={setPrompt}
          disabled={isDisabled}
          getSuggestions={getPromptAutocompleteSuggestions}
          applySuggestion={applyPromptAutocompleteSuggestion}
        />
      </section>

      {/* Lyrics — always visible, with Instrumental toggle */}
      <section className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-medium uppercase text-zinc-400">Lyrics</label>
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
        <textarea
          value={lyrics}
          onChange={(e) => setLyrics(e.target.value)}
          rows={3}
          placeholder="[Verse 1]\nYour lyrics here..."
          className="w-full resize-none rounded border border-[#444] bg-[#2a2a2a] px-2 py-1.5 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
          disabled={isDisabled || instrumental}
          data-testid="full-song-lyrics"
        />
      </section>

      {/* Duration + Seed + Thinking + Vocal Language — inline row */}
      <section className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] font-medium uppercase text-zinc-500 shrink-0">Duration</label>
          <input
            type="number"
            value={durationSeconds === -1 ? '' : durationSeconds}
            onChange={(e) => setDurationSeconds(e.target.value === '' ? -1 : Number(e.target.value))}
            placeholder="Auto"
            min={MIN_DURATION}
            max={MAX_DURATION}
            step={1}
            className="w-[60px] rounded border border-[#444] bg-[#2a2a2a] px-1.5 py-0.5 text-[11px] focus:border-indigo-500 focus:outline-none"
            disabled={isDisabled || durationAuto}
          />
          <label className="flex items-center gap-1 cursor-pointer">
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
            <span className="text-[9px] text-zinc-600">Auto</span>
          </label>
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] font-medium uppercase text-zinc-500 shrink-0">Seed</label>
          <input
            type="number"
            value={seed}
            onChange={(e) => setSeed(Number(e.target.value))}
            className="w-[80px] rounded border border-[#444] bg-[#2a2a2a] px-1.5 py-0.5 text-[11px] font-mono focus:border-indigo-500 focus:outline-none"
            disabled={isDisabled || useRandomSeed}
          />
          <button
            type="button"
            onClick={() => {
              setSeed(Math.floor(Math.random() * 2147483647));
              setUseRandomSeed(false);
            }}
            className="text-[14px] leading-none transition-opacity hover:opacity-80"
            title="Random seed"
            disabled={isDisabled}
          >
            🎲
          </button>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={useRandomSeed}
              onChange={(e) => setUseRandomSeed(e.target.checked)}
              className="h-3 w-3 rounded border-[#444] accent-indigo-500"
              disabled={isDisabled}
            />
            <span className="text-[9px] text-zinc-600">Rand</span>
          </label>
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={thinking}
            onChange={(e) => setThinking(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-[#444] bg-[#2a2a2a] accent-indigo-500"
            disabled={isDisabled}
          />
          <span className="text-[10px] text-zinc-500">Thinking</span>
        </label>
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] font-medium uppercase text-zinc-500 shrink-0">Lang</label>
          <select
            value={vocalLanguage}
            onChange={(e) => setVocalLanguage(e.target.value)}
            className="rounded border border-[#444] bg-[#2a2a2a] px-1 py-0.5 text-[10px] focus:border-indigo-500 focus:outline-none"
            disabled={isDisabled || instrumental}
          >
            <option value="unknown">Auto</option>
            <option value="en">EN</option>
            <option value="zh">中文</option>
            <option value="ja">日本語</option>
            <option value="ko">한국어</option>
          </select>
        </div>
      </section>

      {/* Split to stems */}
      <section className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={splitToStems}
            onChange={(e) => setSplitToStems(e.target.checked)}
            className="h-4 w-4 rounded border-[#444] bg-[#2a2a2a] accent-indigo-500"
            disabled={isDisabled}
            data-testid="full-song-split-stems"
          />
          <span className="text-[11px] font-medium text-zinc-300">Split into stems after generation</span>
        </label>
        {splitToStems && (
          <div className="ml-6 flex items-center gap-2">
            <span className="text-[10px] text-zinc-500">Stems:</span>
            {([2, 4, 6] as const).map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => setStemCount(count)}
                className={`rounded px-2 py-0.5 text-[10px] ${
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
        )}
      </section>

      {/* Advanced — model-aware */}
      <section className="space-y-2">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1.5 text-[11px] font-medium uppercase text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <span className="text-[9px]">{showAdvanced ? '▼' : '▶'}</span>
          Advanced Parameters
        </button>
        {showAdvanced && (
          <div className="space-y-2 rounded border border-[#333] bg-[#1a1a1a] p-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-zinc-500">
                  Inference Steps
                  <span className="ml-1 text-zinc-700">({modelDefaults.inferenceStepsMin}–{modelDefaults.inferenceStepsMax})</span>
                </label>
                <input
                  type="number"
                  value={inferenceSteps}
                  onChange={(e) => setInferenceSteps(Number(e.target.value))}
                  min={modelDefaults.inferenceStepsMin}
                  max={modelDefaults.inferenceStepsMax}
                  className="mt-0.5 w-full rounded border border-[#444] bg-[#2a2a2a] px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
                  disabled={isDisabled}
                />
              </div>
              {modelDefaults.guidanceScaleVisible && (
                <div>
                  <label className="block text-[10px] text-zinc-500">Guidance Scale</label>
                  <input
                    type="number"
                    value={guidanceScale}
                    onChange={(e) => setGuidanceScale(Number(e.target.value))}
                    min={1}
                    max={15}
                    step={0.5}
                    className="mt-0.5 w-full rounded border border-[#444] bg-[#2a2a2a] px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
                    disabled={isDisabled}
                  />
                </div>
              )}
              {!modelDefaults.guidanceScaleVisible && (
                <div className="flex items-end pb-1">
                  <span className="text-[9px] text-zinc-600">CFG disabled for turbo models</span>
                </div>
              )}
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500">Shift</label>
              <input
                type="number"
                value={shift}
                onChange={(e) => setShift(Number(e.target.value))}
                min={1}
                max={5}
                step={0.5}
                className="mt-0.5 w-full rounded border border-[#444] bg-[#2a2a2a] px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
                disabled={isDisabled}
              />
            </div>
            {/* Reset to model defaults */}
            <button
              type="button"
              onClick={() => {
                setInferenceSteps(modelDefaults.inferenceSteps);
                setGuidanceScale(modelDefaults.guidanceScale);
                setShift(modelDefaults.shift);
                setThinking(modelDefaults.thinking);
              }}
              className="text-[10px] text-indigo-400 transition-colors hover:text-indigo-300"
            >
              Reset to model defaults
            </button>
          </div>
        )}
      </section>

    </div>
  );
}
