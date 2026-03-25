import { useCallback, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';
import { useModelStore } from '../../store/modelStore';
import { KEY_SCALES } from '../../constants/tracks';
import { MAX_BPM, MAX_DURATION, MIN_BPM, MIN_DURATION } from '../../constants/defaults';
import { generateText2Music } from '../../services/generationPipeline';
import { PromptAutocompleteTextarea } from './PromptAutocompleteTextarea';
import { Button } from '../ui/Button';

export function FullSongForm() {
  const project = useProjectStore((s) => s.project);
  const isGenerating = useGenerationStore((s) => s.isGenerating);
  const modelLoadingState = useModelStore((s) => s.modelLoadingState);
  const getPromptAutocompleteSuggestions = useGenerationStore((s) => s.getPromptAutocompleteSuggestions);
  const applyPromptAutocompleteSuggestion = useGenerationStore((s) => s.applyPromptAutocompleteSuggestion);

  const [prompt, setPrompt] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [showLyrics, setShowLyrics] = useState(false);
  const [bpm, setBpm] = useState(project?.bpm ?? 120);
  const [keyScale, setKeyScale] = useState(project?.keyScale ?? 'C major');
  const [durationSeconds, setDurationSeconds] = useState(30);
  const [splitToStems, setSplitToStems] = useState(true);
  const [stemCount, setStemCount] = useState<2 | 4 | 6>(4);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [inferenceSteps, setInferenceSteps] = useState(project?.generationDefaults?.inferenceSteps ?? 50);
  const [guidanceScale, setGuidanceScale] = useState(project?.generationDefaults?.guidanceScale ?? 7);
  const [shift, setShift] = useState(project?.generationDefaults?.shift ?? 3);
  const [thinking, setThinking] = useState(project?.generationDefaults?.thinking ?? false);
  const [error, setError] = useState<string | null>(null);

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

      {/* Advanced */}
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
          <div className="grid grid-cols-2 gap-2 rounded border border-[#333] bg-[#1a1a1a] p-2">
            <div>
              <label className="block text-[10px] text-zinc-500">Inference Steps</label>
              <input
                type="number"
                value={inferenceSteps}
                onChange={(e) => setInferenceSteps(Number(e.target.value))}
                min={10}
                max={200}
                className="mt-0.5 w-full rounded border border-[#444] bg-[#2a2a2a] px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
                disabled={isDisabled}
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500">Guidance Scale</label>
              <input
                type="number"
                value={guidanceScale}
                onChange={(e) => setGuidanceScale(Number(e.target.value))}
                min={1}
                max={20}
                step={0.5}
                className="mt-0.5 w-full rounded border border-[#444] bg-[#2a2a2a] px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
                disabled={isDisabled}
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500">Shift</label>
              <input
                type="number"
                value={shift}
                onChange={(e) => setShift(Number(e.target.value))}
                min={0}
                max={10}
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
                <span className="text-[10px] text-zinc-500">Thinking</span>
              </label>
            </div>
          </div>
        )}
      </section>

      {/* Generate button */}
      <div className="sticky bottom-0 -mx-3 border-t border-[#333] bg-[#1e1e1e]/95 px-3 pb-3 pt-3 backdrop-blur">
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
