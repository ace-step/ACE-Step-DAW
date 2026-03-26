import { useCallback, useEffect, useMemo, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';
import { useModelStore } from '../../store/modelStore';
import { KEY_SCALES } from '../../constants/tracks';
import { MAX_BPM, MAX_DURATION, MIN_BPM, MIN_DURATION } from '../../constants/defaults';
import { getModelDefaults, inferModelVariant, type ModelVariant } from '../../constants/modelDefaults';
import { generateText2Music } from '../../services/generationPipeline';
import { PromptAutocompleteTextarea } from './PromptAutocompleteTextarea';
import { Button } from '../ui/Button';

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
}

export function FullSongForm({ initialData }: FullSongFormProps) {
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
  const [showLyrics, setShowLyrics] = useState(false);
  const [bpm, setBpm] = useState(project?.bpm ?? 120);
  const [keyScale, setKeyScale] = useState(project?.keyScale ?? 'C major');
  const [durationSeconds, setDurationSeconds] = useState(30);
  const [splitToStems, setSplitToStems] = useState(true);
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
    if (initialData.bpm !== null) setBpm(initialData.bpm);
    if (initialData.keyScale) setKeyScale(initialData.keyScale);
    if (initialData.duration > 0) setDurationSeconds(initialData.duration);
    if (initialData.lyrics.trim()) setShowLyrics(true);
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
        lyrics,
        durationSeconds,
        bpm,
        keyScale,
        timeSignature: String(project?.timeSignature ?? 4),
        splitToStems,
        stemCount,
        inferenceSteps,
        guidanceScale,
        shift,
        thinking,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    }
  }, [prompt, lyrics, durationSeconds, bpm, keyScale, project?.timeSignature, splitToStems, stemCount, inferenceSteps, guidanceScale, shift, thinking]);

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

      {/* Prompt */}
      <section className="space-y-2">
        <label className="block text-[11px] font-medium uppercase text-zinc-400">
          Song Description
        </label>
        <PromptAutocompleteTextarea
          value={prompt}
          onChange={setPrompt}
          disabled={isDisabled}
          getSuggestions={getPromptAutocompleteSuggestions}
          applySuggestion={applyPromptAutocompleteSuggestion}
        />
      </section>

      {/* Lyrics toggle */}
      <section className="space-y-2">
        <button
          type="button"
          onClick={() => setShowLyrics(!showLyrics)}
          className="flex items-center gap-1.5 text-[11px] font-medium uppercase text-zinc-400 transition-colors hover:text-zinc-200"
        >
          <span className="text-[9px]">{showLyrics ? '▼' : '▶'}</span>
          Lyrics {lyrics.trim() ? '(added)' : '(optional)'}
        </button>
        {showLyrics && (
          <textarea
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            rows={4}
            placeholder="Add song lyrics here..."
            className="w-full resize-none rounded border border-[#444] bg-[#2a2a2a] px-2 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
            disabled={isDisabled}
            data-testid="full-song-lyrics"
          />
        )}
      </section>

      {/* BPM, Key, Duration */}
      <section className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-[11px] font-medium uppercase text-zinc-400">BPM</label>
          <input
            type="number"
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            min={MIN_BPM}
            max={MAX_BPM}
            className="mt-1 w-full rounded border border-[#444] bg-[#2a2a2a] px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
            disabled={isDisabled}
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium uppercase text-zinc-400">Key</label>
          <select
            value={keyScale}
            onChange={(e) => setKeyScale(e.target.value)}
            className="mt-1 w-full rounded border border-[#444] bg-[#2a2a2a] px-1 py-1 text-sm focus:border-indigo-500 focus:outline-none"
            disabled={isDisabled}
          >
            {KEY_SCALES.map((key) => (
              <option key={key} value={key}>{key}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium uppercase text-zinc-400">Duration</label>
          <input
            type="number"
            value={durationSeconds}
            onChange={(e) => setDurationSeconds(Number(e.target.value))}
            min={MIN_DURATION}
            max={MAX_DURATION}
            step={1}
            className="mt-1 w-full rounded border border-[#444] bg-[#2a2a2a] px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
            disabled={isDisabled}
          />
          <span className="mt-0.5 block text-[10px] text-zinc-600">{durationSeconds}s</span>
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
            <div className="grid grid-cols-2 gap-2">
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
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={thinking}
                    onChange={(e) => setThinking(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-[#444] bg-[#2a2a2a] accent-indigo-500"
                    disabled={isDisabled}
                  />
                  <span className="text-[10px] text-zinc-500">Thinking (LM CoT)</span>
                </label>
              </div>
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

      {/* Generate button */}
      <div className="mt-auto border-t border-[#3a3a3a] px-4 py-3">
        <Button
          variant="primary"
          size="md"
          onClick={() => void handleGenerate()}
          disabled={isDisabled || !prompt.trim()}
          className="w-full"
          data-testid="full-song-generate-btn"
        >
          {isDisabled ? 'Generating...' : 'Generate Full Song'}
        </Button>
      </div>
    </div>
  );
}
