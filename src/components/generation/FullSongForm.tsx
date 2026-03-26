import { useCallback, useEffect, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';
import { useModelStore } from '../../store/modelStore';
import { MAX_DURATION, MIN_DURATION } from '../../constants/defaults';
import { generateText2Music } from '../../services/generationPipeline';
import { PromptAutocompleteTextarea } from './PromptAutocompleteTextarea';


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

export function FullSongForm({ initialData, onFooterChange }: FullSongFormProps) {
  const project = useProjectStore((s) => s.project);
  const isGenerating = useGenerationStore((s) => s.isGenerating);
  const modelLoadingState = useModelStore((s) => s.modelLoadingState);
  const getPromptAutocompleteSuggestions = useGenerationStore((s) => s.getPromptAutocompleteSuggestions);
  const applyPromptAutocompleteSuggestion = useGenerationStore((s) => s.applyPromptAutocompleteSuggestion);

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
  const [thinking, setThinking] = useState(project?.generationDefaults?.thinking ?? true);
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
        inferenceSteps: project?.generationDefaults?.inferenceSteps,
        guidanceScale: project?.generationDefaults?.guidanceScale,
        shift: project?.generationDefaults?.shift,
        thinking,
        seed: useRandomSeed ? undefined : seed,
        useRandomSeed,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    }
  }, [prompt, lyrics, instrumental, durationSeconds, project, splitToStems, stemCount, thinking, seed, useRandomSeed]);

  // Sync footer state to parent on every render
  const footerAction = useCallback(() => void handleGenerate(), [handleGenerate]);
  onFooterChange({
    label: isDisabled ? 'Generating...' : 'Generate Full Song',
    disabled: isDisabled || !prompt.trim(),
    action: footerAction,
    thinkingState: { checked: thinking, onChange: setThinking, disabled: isDisabled },
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
        <PromptAutocompleteTextarea
          value={prompt}
          onChange={setPrompt}
          disabled={isDisabled}
          getSuggestions={getPromptAutocompleteSuggestions}
          applySuggestion={applyPromptAutocompleteSuggestion}
        />
      </section>

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
                <option value="unknown">Auto</option>
                <option value="en">EN</option>
                <option value="zh">中文</option>
                <option value="ja">日本語</option>
                <option value="ko">한국어</option>
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
        <textarea
          value={lyrics}
          onChange={(e) => setLyrics(e.target.value)}
          rows={5}
          placeholder="[Verse 1]\nYour lyrics here..."
          className="w-full resize-none rounded border border-[#444] bg-[#2a2a2a] px-2 py-1.5 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
          disabled={isDisabled || instrumental}
          data-testid="full-song-lyrics"
        />
      </section>

      {/* Parameters — clean two-row grid */}
      {/* Duration + Seed — compact inline */}
      <section className="flex items-center gap-3">
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
          <label className="flex items-center gap-1 cursor-pointer" title="Auto-detect duration">
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
            className="w-[110px] rounded border border-[#444] bg-[#2a2a2a] px-1.5 py-0.5 text-[11px] font-mono focus:border-indigo-500 focus:outline-none"
            disabled={isDisabled || useRandomSeed}
          />
          <button
            type="button"
            onClick={() => {
              setSeed(Math.floor(Math.random() * 2147483647));
              setUseRandomSeed(false);
            }}
            className="shrink-0 text-[14px] leading-none transition-opacity hover:opacity-80"
            title="Random seed"
            disabled={isDisabled}
          >
            🎲
          </button>
          <label className="flex items-center gap-1 cursor-pointer" title="Use random seed each time">
            <input
              type="checkbox"
              checked={useRandomSeed}
              onChange={(e) => setUseRandomSeed(e.target.checked)}
              className="h-3 w-3 rounded border-[#444] accent-indigo-500"
              disabled={isDisabled}
            />
            <span className="text-[9px] text-zinc-600">Random</span>
          </label>
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

      {/* Advanced Parameters removed — use Settings > Generation Defaults instead */}

    </div>
  );
}
