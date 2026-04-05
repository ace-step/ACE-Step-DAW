import { useState, useCallback } from 'react';
import {
  interpretSoundDescription,
  generateVariations,
  type SoundDesignSuggestion,
} from '../../services/soundDesignAssistant';
import type { SubtractiveInstrumentSettings, InstrumentKind } from '../../types/project';

interface Props {
  currentSettings: SubtractiveInstrumentSettings;
  instrumentKind: InstrumentKind;
  onApply: (changes: SoundDesignSuggestion['changes']) => void;
}

function formatParamValue(val: unknown): string {
  if (typeof val === 'number') return val.toFixed(3).replace(/\.?0+$/, '');
  if (typeof val === 'boolean') return val ? 'on' : 'off';
  if (typeof val === 'string') return val;
  return String(val);
}

function flattenChanges(obj: Record<string, unknown>, prefix = ''): { key: string; value: string }[] {
  const result: { key: string; value: string }[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      result.push(...flattenChanges(v as Record<string, unknown>, path));
    } else {
      result.push({ key: path, value: formatParamValue(v) });
    }
  }
  return result;
}

export function SoundDesignPanel({ currentSettings, instrumentKind, onApply }: Props) {
  const [description, setDescription] = useState('');
  const [suggestion, setSuggestion] = useState<SoundDesignSuggestion | null>(null);
  const [variations, setVariations] = useState<SoundDesignSuggestion[]>([]);
  const [showVariations, setShowVariations] = useState(false);

  const handleSuggest = useCallback(() => {
    if (!description.trim()) return;
    const result = interpretSoundDescription(description, instrumentKind, currentSettings);
    setSuggestion(result);
    setShowVariations(false);
  }, [description, instrumentKind, currentSettings]);

  const handleApply = useCallback(() => {
    if (!suggestion) return;
    onApply(suggestion.changes);
    setSuggestion(null);
    setDescription('');
  }, [suggestion, onApply]);

  const handleShowVariations = useCallback(() => {
    const vars = generateVariations(currentSettings, instrumentKind, 5);
    setVariations(vars);
    setShowVariations(true);
    setSuggestion(null);
  }, [currentSettings, instrumentKind]);

  const handleApplyVariation = useCallback((v: SoundDesignSuggestion) => {
    onApply(v.changes);
    setShowVariations(false);
  }, [onApply]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSuggest();
    }
  }, [handleSuggest]);

  const diffEntries = suggestion ? flattenChanges(suggestion.changes as Record<string, unknown>) : [];

  return (
    <div className="border border-daw-border/50 rounded-lg p-2.5 space-y-2 bg-[#1a1a1e]/50">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500 font-medium">
          AI Sound Design
        </span>
        <button
          type="button"
          data-testid="sound-design-variations-btn"
          onClick={handleShowVariations}
          className="text-[9px] px-1.5 py-0.5 rounded border border-daw-border/50 text-zinc-500 hover:text-zinc-300 hover:border-daw-border transition-colors"
        >
          Variations
        </button>
      </div>

      {/* Description input */}
      <div className="flex gap-1.5">
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe the sound you want..."
          className="flex-1 bg-[#161618] border border-[#333] rounded px-2 py-1 text-[11px] text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-teal-600"
        />
        <button
          type="button"
          data-testid="sound-design-suggest-btn"
          onClick={handleSuggest}
          disabled={!description.trim()}
          className="px-2 py-1 rounded bg-teal-900/50 border border-teal-700/50 text-teal-300 text-[10px] hover:bg-teal-800/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Suggest
        </button>
      </div>

      {/* Suggestion result */}
      {suggestion && (
        <div data-testid="sound-design-suggestion" className="bg-[#161618] border border-[#333] rounded-lg p-2 space-y-1.5">
          <p className="text-[10px] text-zinc-300">{suggestion.description}</p>

          {/* Parameter diff preview */}
          {diffEntries.length > 0 && (
            <div data-testid="sound-design-diff" className="space-y-0.5">
              <span className="text-[9px] text-zinc-500 uppercase tracking-wide">Changes:</span>
              <div className="flex flex-wrap gap-1">
                {diffEntries.map((entry) => (
                  <span
                    key={entry.key}
                    className="text-[9px] rounded bg-teal-900/30 border border-teal-800/30 px-1.5 py-0.5 text-teal-400"
                  >
                    {entry.key}: {entry.value}
                  </span>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            data-testid="sound-design-apply-btn"
            onClick={handleApply}
            className="w-full px-2 py-1 rounded bg-teal-700/60 text-teal-100 text-[10px] hover:bg-teal-600/60 transition-colors"
          >
            Apply Changes
          </button>
        </div>
      )}

      {/* Variations */}
      {showVariations && variations.length > 0 && (
        <div className="space-y-1">
          <span className="text-[9px] text-zinc-500 uppercase tracking-wide">Variations:</span>
          {variations.map((v, i) => (
            <button
              key={i}
              type="button"
              data-testid="sound-design-variation"
              onClick={() => handleApplyVariation(v)}
              className="w-full text-left px-2 py-1.5 rounded bg-[#161618] border border-[#333] hover:border-teal-700/50 hover:bg-[#1e1e22] transition-colors"
            >
              <span className="text-[10px] text-zinc-200 font-medium">{v.name}</span>
              <p className="text-[9px] text-zinc-500">{v.description}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
