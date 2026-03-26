import { useCallback, useState } from 'react';
import { useGenerationStore } from '../../store/generationStore';
import { useModelStore } from '../../store/modelStore';
import * as api from '../../services/aceStepApi';
import { toastError, toastInfo } from '../../hooks/useToast';

const VOCAL_LANGUAGES = [
  { value: 'auto', label: 'Instrumental / auto' },
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'unknown', label: 'Other' },
];

interface SimpleModeFormProps {
  onSampleCreated: (data: {
    caption: string;
    lyrics: string;
    bpm: number | null;
    keyScale: string;
    duration: number;
    timeSignature: string;
    vocalLanguage: string;
  }) => void;
  /** Called whenever footer button state changes */
  onFooterChange: (footer: { label: string; disabled: boolean; action: () => void }) => void;
}

export function SimpleModeForm({ onSampleCreated, onFooterChange }: SimpleModeFormProps) {
  const isGenerating = useGenerationStore((s) => s.isGenerating);
  const modelLoadingState = useModelStore((s) => s.modelLoadingState);

  const [query, setQuery] = useState('');
  const [vocalLanguage, setVocalLanguage] = useState('auto');
  const [instrumental, setInstrumental] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDisabled = isGenerating || modelLoadingState === 'loading' || isCreating;

  const handleCreateSample = useCallback(async () => {
    if (!query.trim()) {
      setError('Please describe what you want to create');
      return;
    }
    setError(null);
    setIsCreating(true);

    try {
      await useModelStore.getState().ensureModelForIntent('full-song');
      toastInfo('Creating sample from description...');

      const result = await api.createSample({
        query: query.trim(),
        vocal_language: instrumental ? 'unknown' : vocalLanguage,
        instrumental,
      });

      onSampleCreated({
        caption: result.caption ?? '',
        lyrics: result.lyrics ?? '',
        bpm: result.bpm ?? null,
        keyScale: result.keyscale ?? '',
        duration: result.duration ?? 30,
        timeSignature: result.timesignature ?? '',
        vocalLanguage: result.vocal_language ?? vocalLanguage,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create sample';
      setError(message);
      toastError(message);
    } finally {
      setIsCreating(false);
    }
  }, [query, vocalLanguage, instrumental, onSampleCreated]);

  // Sync footer state to parent on every render
  const footerAction = useCallback(() => void handleCreateSample(), [handleCreateSample]);
  onFooterChange({
    label: isCreating ? 'Creating...' : 'Create Sample',
    disabled: isDisabled || !query.trim(),
    action: footerAction,
  });

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" data-testid="simple-mode-form">
      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-950/30 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      <section className="space-y-2">
        <label className="block text-[11px] font-medium uppercase text-zinc-400">
          Song Description
        </label>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={4}
          placeholder="e.g., Dance pop, future house, upbeat indie rock with electric guitar..."
          className="w-full resize-none rounded-lg border border-[#3a3a3a] bg-[#161618] px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
          disabled={isDisabled}
          data-testid="simple-mode-query"
        />
      </section>

      <section className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-[11px] font-medium uppercase text-zinc-400 mb-1">
            Vocal Language
          </label>
          <select
            value={instrumental ? 'auto' : vocalLanguage}
            onChange={(e) => setVocalLanguage(e.target.value)}
            className="w-full rounded-lg border border-[#3a3a3a] bg-[#161618] px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
            disabled={isDisabled || instrumental}
            data-testid="simple-mode-vocal-language"
          >
            {VOCAL_LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>{lang.label}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 cursor-pointer pb-1">
          <input
            type="checkbox"
            checked={instrumental}
            onChange={(e) => setInstrumental(e.target.checked)}
            className="h-4 w-4 rounded border-[#3a3a3a] bg-[#161618] accent-indigo-500"
            disabled={isDisabled}
            data-testid="simple-mode-instrumental"
          />
          <span className="text-[11px] font-medium text-zinc-300">Instrumental</span>
        </label>
      </section>
    </div>
  );
}
