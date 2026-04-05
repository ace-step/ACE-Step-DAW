import { useState, useCallback } from 'react';
import {
  TIMBRE_PRESETS,
  TIMBRE_CATEGORIES,
  buildPromptWithTimbre,
  type TimbrePreset,
  type TimbreCategory,
} from '../../data/timbrePresets';

interface TimbrePresetSelectorProps {
  currentPrompt: string;
  onApplyTimbre: (newPrompt: string) => void;
  disabled?: boolean;
}

export function TimbrePresetSelector({
  currentPrompt,
  onApplyTimbre,
  disabled,
}: TimbrePresetSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<TimbreCategory | null>(null);
  const [activePreset, setActivePreset] = useState<TimbrePreset | null>(null);

  const filteredPresets = selectedCategory
    ? TIMBRE_PRESETS.filter((p) => p.category === selectedCategory)
    : TIMBRE_PRESETS;

  const handleSelect = useCallback(
    (preset: TimbrePreset) => {
      setActivePreset(preset);
      const newPrompt = buildPromptWithTimbre(currentPrompt, preset);
      onApplyTimbre(newPrompt);
      setIsOpen(false);
    },
    [currentPrompt, onApplyTimbre],
  );

  const handleClear = useCallback(() => {
    if (activePreset) {
      // Remove the timbre fragment from the prompt
      const fragment = activePreset.promptFragment;
      const cleaned = currentPrompt
        .replace(`${fragment}, `, '')
        .replace(fragment, '')
        .trim();
      onApplyTimbre(cleaned);
    }
    setActivePreset(null);
  }, [activePreset, currentPrompt, onApplyTimbre]);

  return (
    <section className="space-y-1.5" data-testid="timbre-preset-selector">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-medium uppercase text-zinc-400">
          Timbre Preset
        </label>
        {activePreset && (
          <button
            type="button"
            onClick={handleClear}
            className="text-[9px] text-zinc-500 hover:text-zinc-300 transition-colors"
            disabled={disabled}
          >
            Clear
          </button>
        )}
      </div>

      {/* Active preset display / toggle button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full rounded border px-2 py-1.5 text-left text-[11px] transition-colors ${
          isOpen
            ? 'border-indigo-500/50 bg-indigo-950/20'
            : activePreset
              ? 'border-emerald-600/40 bg-emerald-950/10 text-zinc-200'
              : 'border-[#444] bg-[#2a2a2a] text-zinc-500'
        } hover:border-indigo-500/40 disabled:opacity-40 disabled:cursor-not-allowed`}
        data-testid="timbre-preset-toggle"
      >
        {activePreset ? (
          <span>
            <span className="text-emerald-400 font-medium">{activePreset.name}</span>
            <span className="text-zinc-500 ml-1.5">({activePreset.category})</span>
          </span>
        ) : (
          'Select a timbre preset...'
        )}
      </button>

      {/* Dropdown browser */}
      {isOpen && (
        <div className="rounded border border-[#444] bg-[#1e1e1e] overflow-hidden" data-testid="timbre-preset-browser">
          {/* Category tabs */}
          <div className="flex flex-wrap gap-1 p-2 border-b border-[#333]">
            <button
              type="button"
              onClick={() => setSelectedCategory(null)}
              className={`text-[9px] px-2 py-0.5 rounded-full border transition-colors ${
                selectedCategory === null
                  ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                  : 'border-[#444] text-zinc-500 hover:text-zinc-300'
              }`}
            >
              All
            </button>
            {TIMBRE_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`text-[9px] px-2 py-0.5 rounded-full border transition-colors ${
                  selectedCategory === cat
                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                    : 'border-[#444] text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Preset list */}
          <div className="max-h-48 overflow-y-auto">
            {filteredPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelect(preset)}
                data-timbre-preset-id={preset.id}
                className={`w-full text-left px-3 py-1.5 border-b border-[#2a2a2a] last:border-b-0 transition-colors hover:bg-[#2a2a2a] ${
                  activePreset?.id === preset.id ? 'bg-indigo-950/30' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-200 font-medium">{preset.name}</span>
                  <span className="text-[9px] text-zinc-600">{preset.category}</span>
                </div>
                <p className="text-[9px] text-zinc-500 mt-0.5">{preset.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
