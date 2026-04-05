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
import { usePresetPreview } from '../../hooks/usePresetPreview';

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
  /** Called to preview/audition a preset before applying it. */
  onPreviewPreset?: (presetId: string) => void;
}

export function SynthPresetBrowser({
  currentPresetId,
  onSelectPreset,
  onSavePreset,
  userPresets: _legacyUserPresets,
  userInstrumentPresets = [],
  onDeleteUserPreset,
  onPreviewPreset,
}: SynthPresetBrowserProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<InstrumentPresetCategory | null>(null);
  const [kindFilter, setKindFilter] = useState<InstrumentKindFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  const preview = usePresetPreview({ hoverDelay: 300 });

  const currentPreset = currentPresetId
    ? getPresetById(currentPresetId, userInstrumentPresets)
    : null;

  // Close on outside click — also stop preview
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        preview.stop();
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, preview]);

  // Close on Escape — also stop preview
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        preview.stop();
        setIsOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, preview]);

  // Stop preview when panel closes
  useEffect(() => {
    if (!isOpen) {
      preview.stop();
      setFocusedIndex(-1);
    }
  }, [isOpen, preview]);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
    setSearchQuery('');
    setSelectedCategory(null);
  }, []);

  const handleSelectPreset = useCallback(
    (presetId: string) => {
      preview.stop();
      onSelectPreset(presetId);
      setIsOpen(false);
    },
    [onSelectPreset, preview],
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

  // Keyboard navigation within preset list
  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!filteredPresets) return;
      const len = filteredPresets.length;
      if (len === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % len);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => (prev <= 0 ? len - 1 : prev - 1));
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < len) {
          const preset = filteredPresets[focusedIndex];
          handleSelectPreset(preset.id);
        }
      } else if (e.key === 'p' || e.key === 'P') {
        // Preview with 'p' key
        if (focusedIndex >= 0 && focusedIndex < len) {
          const preset = filteredPresets[focusedIndex];
          preview.handlePresetClick(preset.id, {
            instrumentKind: preset.instrumentKind,
            category: preset.category,
          });
        }
      }
    },
    [filteredPresets, focusedIndex, handleSelectPreset, preview],
  );

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-preset-item]');
    items[focusedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex]);

  // Reset focus when filtered presets change
  useEffect(() => {
    setFocusedIndex(-1);
  }, [filteredPresets]);

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
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' && filteredPresets && filteredPresets.length > 0) {
                  e.preventDefault();
                  setFocusedIndex(0);
                  listRef.current?.focus();
                }
              }}
              className="w-full bg-[#111] border border-[#333] rounded px-2 py-1 text-[11px] text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-[#555]"
              autoFocus
            />
          </div>

          {/* Preview volume control */}
          <div className="px-3 py-1.5 border-b border-[#333] flex items-center gap-2">
            <span className="text-[9px] text-zinc-500 shrink-0">Preview</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={preview.volume}
              onChange={(e) => preview.changeVolume(parseFloat(e.target.value))}
              className="flex-1 h-1 accent-blue-400"
              aria-label="Preview volume"
            />
            <span className="text-[9px] text-zinc-500 w-6 text-right">
              {Math.round(preview.volume * 100)}
            </span>
          </div>

          <div
            className="max-h-[300px] overflow-y-auto"
            ref={listRef}
            onKeyDown={handleListKeyDown}
            tabIndex={0}
          >
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
                {filteredPresets.map((preset, idx) => (
                  <div
                    key={preset.id}
                    data-preset-item
                    onMouseEnter={() =>
                      preview.handlePresetHoverStart(preset.id, {
                        instrumentKind: preset.instrumentKind,
                        category: preset.category,
                      })
                    }
                    onMouseLeave={preview.handlePresetHoverEnd}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded cursor-pointer text-[11px] group ${
                      preset.id === currentPresetId
                        ? 'bg-blue-600/20 text-blue-300'
                        : focusedIndex === idx
                          ? 'bg-white/10 text-zinc-200'
                          : 'text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    {/* Preview play button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        preview.handlePresetClick(preset.id, {
                          instrumentKind: preset.instrumentKind,
                          category: preset.category,
                        });
                      }}
                      className={`shrink-0 w-4 h-4 flex items-center justify-center rounded-sm transition-colors ${
                        preview.isPlaying && preview.activePresetId === preset.id
                          ? 'text-blue-400'
                          : 'text-zinc-600 hover:text-zinc-300'
                      }`}
                      aria-label={`Preview ${preset.name}`}
                    >
                      {preview.isPlaying && preview.activePresetId === preset.id ? (
                        <span className="text-[10px]">&#9632;</span>
                      ) : (
                        <span className="text-[10px]">&#9654;</span>
                      )}
                    </button>

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
