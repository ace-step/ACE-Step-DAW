import { useState } from 'react';
import {
  FACTORY_TIMBRE_PRESETS,
  getAllTimbreCategories,
  type TimbreCategory,
  type TimbrePreset,
} from '../../data/timbrePresets';

interface Props {
  onSelect: (preset: TimbrePreset) => void;
}

export function TimbrePresetPicker({ onSelect }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<TimbreCategory | null>(null);
  const categories = getAllTimbreCategories();

  const filtered = selectedCategory
    ? FACTORY_TIMBRE_PRESETS.filter((p) => p.category === selectedCategory)
    : FACTORY_TIMBRE_PRESETS;

  const handleSelect = (preset: TimbrePreset) => {
    onSelect(preset);
    setExpanded(false);
  };

  return (
    <div>
      <button
        type="button"
        data-testid="timbre-preset-toggle"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[10px] text-teal-400/80 hover:text-teal-300 transition-colors mb-1"
      >
        <span className="text-[8px]">{expanded ? '▼' : '▶'}</span>
        <span>Timbre Presets</span>
      </button>

      {expanded && (
        <div className="bg-[#161618] border border-[#333] rounded-lg p-2 mb-2 space-y-1.5">
          {/* Category tabs */}
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              data-testid="timbre-category-tab"
              onClick={() => setSelectedCategory(null)}
              className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                selectedCategory === null
                  ? 'bg-teal-900/50 border-teal-700/50 text-teal-300'
                  : 'border-[#3a3a3a] text-zinc-500 hover:text-zinc-400'
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                data-testid="timbre-category-tab"
                onClick={() => setSelectedCategory(cat)}
                className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                  selectedCategory === cat
                    ? 'bg-teal-900/50 border-teal-700/50 text-teal-300'
                    : 'border-[#3a3a3a] text-zinc-500 hover:text-zinc-400'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Preset list */}
          <div className="max-h-32 overflow-y-auto space-y-0.5">
            {filtered.map((preset) => (
              <button
                key={preset.id}
                type="button"
                data-testid="timbre-preset-item"
                onClick={() => handleSelect(preset)}
                className="w-full text-left px-2 py-1 rounded hover:bg-[#2a2a2e] transition-colors group"
                title={preset.description}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-200 group-hover:text-white">
                    {preset.name}
                  </span>
                  <span className="text-[8px] text-zinc-600">{preset.category}</span>
                </div>
                <p className="text-[9px] text-zinc-500 truncate">{preset.promptTemplate}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
