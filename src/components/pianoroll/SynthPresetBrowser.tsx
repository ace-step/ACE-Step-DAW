import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  ALL_PRESET_CATEGORIES,
  getPresetById,
  getPresetsByCategory,
  getPresetsByKind,
  getCategoriesForKind,
  type InstrumentPreset,
  type InstrumentPresetCategory,
  type InstrumentKindFilter,
} from '../../data/instrumentPresets';
// Keep backward compat imports for legacy callers
import type { SynthPresetDefinition } from '../../data/synthPresets';

const KIND_LABELS: Record<InstrumentKindFilter, string> = {
  all: 'All',
  subtractive: 'Synth',
  fm: 'FM',
  wavetable: 'Wavetable',
};

const KIND_FILTERS: InstrumentKindFilter[] = ['all', 'subtractive', 'fm', 'wavetable'];

interface SynthPresetBrowserProps {
  trackId: string;
  currentPresetId: string | null;
  onSelectPreset: (presetId: string) => void;
  onSavePreset: () => void;
  /** Legacy subtractive-only user presets (kept for backward compat). */
  userPresets: SynthPresetDefinition[];
  /** Unified user presets (all instrument kinds). */
  userInstrumentPresets?: InstrumentPreset[];
  onDeleteUserPreset?: (presetId: string) => void;
}

export function SynthPresetBrowser({
  currentPresetId,
  onSelectPreset,
  onSavePreset,
  userPresets: _legacyUserPresets,
  userInstrumentPresets = [],
  onDeleteUserPreset,
}: SynthPresetBrowserProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<InstrumentPresetCategory | null>(null);
  const [kindFilter, setKindFilter] = useState<InstrumentKindFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  const currentPreset = currentPresetId
    ? getPresetById(currentPresetId, userInstrumentPresets)
    : null;

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
    setSearchQuery('');
    setSelectedCategory(null);
  }, []);

  const handleSelectPreset = useCallback(
    (presetId: string) => {
      onSelectPreset(presetId);
      setIsOpen(false);
    },
    [onSelectPreset],
  );

  const availableCategories = useMemo(
    () => getCategoriesForKind(kindFilter),
    [kindFilter],
  );

  const filteredPresets = useMemo(() => {
    const kindPresets = getPresetsByKind(kindFilter, userInstrumentPresets);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return kindPresets.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (selectedCategory) {
      return kindPresets.filter((p) => p.category === selectedCategory);
    }
    return null; // show categories
  }, [searchQuery, selectedCategory, kindFilter, userInstrumentPresets]);

  const kindBadge = (kind: string) => {
    const colors: Record<string, string> = {
      subtractive: 'text-green-400',
      fm: 'text-yellow-400',
      wavetable: 'text-purple-400',
    };
    const labels: Record<string, string> = {
      subtractive: 'SUB',
      fm: 'FM',
      wavetable: 'WT',
    };
    return (
      <span className={`text-[8px] font-mono ${colors[kind] ?? 'text-zinc-500'} shrink-0`}>
        {labels[kind] ?? kind}
      </span>
    );
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        aria-label="Synth preset browser"
        onClick={handleToggle}
        className="bg-[#111] border border-[#333] rounded px-2 py-1 text-[11px] text-zinc-300 hover:bg-[#1a1a1a] hover:border-[#444] transition-colors flex items-center gap-1 min-w-[90px] max-w-[160px]"
      >
        <span className="truncate">{currentPreset?.name ?? 'Preset'}</span>
        <span className="text-[9px] text-zinc-500 ml-auto">{isOpen ? '\u25B2' : '\u25BC'}</span>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 w-[300px] bg-[#1a1a1a] border border-[#333] rounded-lg shadow-2xl overflow-hidden">
          {/* Kind filter tabs */}
          <div className="flex border-b border-[#333]">
            {KIND_FILTERS.map((kind) => (
              <button
                key={kind}
                onClick={() => {
                  setKindFilter(kind);
                  setSelectedCategory(null);
                  setSearchQuery('');
                }}
                className={`flex-1 px-2 py-1.5 text-[10px] transition-colors ${
                  kindFilter === kind
                    ? 'text-blue-300 border-b-2 border-blue-400 bg-blue-500/10'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {KIND_LABELS[kind]}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="p-2 border-b border-[#333]">
            <input
              type="text"
              placeholder="Search presets..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedCategory(null);
              }}
              className="w-full bg-[#111] border border-[#333] rounded px-2 py-1 text-[11px] text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-[#555]"
              autoFocus
            />
          </div>

          <div className="max-h-[300px] overflow-y-auto">
            {filteredPresets === null ? (
              /* Category list */
              <div className="p-1">
                {availableCategories.map((cat) => {
                  const count = getPresetsByKind(kindFilter, userInstrumentPresets)
                    .filter((p) => p.category === cat).length;
                  return (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-300 hover:bg-white/5 rounded flex items-center justify-between"
                    >
                      <span>{cat}</span>
                      <span className="text-[10px] text-zinc-500">{count}</span>
                    </button>
                  );
                })}
              </div>
            ) : filteredPresets.length === 0 ? (
              <div className="p-3 text-[11px] text-zinc-500 text-center">
                No presets found
              </div>
            ) : (
              <div className="p-1">
                {selectedCategory && (
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className="w-full text-left px-3 py-1 text-[10px] text-zinc-500 hover:text-zinc-300 mb-1"
                  >
                    &larr; All Categories
                  </button>
                )}
                {filteredPresets.map((preset) => (
                  <div
                    key={preset.id}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded cursor-pointer text-[11px] ${
                      preset.id === currentPresetId
                        ? 'bg-blue-600/20 text-blue-300'
                        : 'text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    <button
                      onClick={() => handleSelectPreset(preset.id)}
                      className="flex-1 text-left truncate"
                    >
                      {preset.name}
                    </button>
                    {kindFilter === 'all' && kindBadge(preset.instrumentKind)}
                    {!preset.isFactory && (
                      <span className="text-[9px] text-zinc-500 shrink-0">user</span>
                    )}
                    {!preset.isFactory && onDeleteUserPreset && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteUserPreset(preset.id);
                        }}
                        className="text-zinc-500 hover:text-red-400 text-[10px] shrink-0 ml-1"
                        aria-label={`Delete ${preset.name}`}
                      >
                        &times;
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Save button */}
          <div className="p-2 border-t border-[#333]">
            <button
              onClick={() => {
                onSavePreset();
                setIsOpen(false);
              }}
              className="w-full px-3 py-1.5 text-[11px] text-zinc-300 bg-white/5 hover:bg-white/10 rounded transition-colors text-center"
            >
              Save Current as Preset...
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
