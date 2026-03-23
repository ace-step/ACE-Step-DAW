import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SectionPreset {
  name: string;
  color: string;
}

/** Preset colors for common arrangement sections. */
export const SECTION_COLORS: Record<string, string> = {
  intro: '#6366f1',
  verse: '#22c55e',
  chorus: '#f59e0b',
  bridge: '#8b5cf6',
  outro: '#ef4444',
  hook: '#ec4899',
  'pre-chorus': '#14b8a6',
  solo: '#f97316',
  breakdown: '#64748b',
  drop: '#06b6d4',
  build: '#a855f7',
  interlude: '#84cc16',
  tag: '#d946ef',
};

export const SECTION_PRESETS: SectionPreset[] = Object.entries(SECTION_COLORS).map(
  ([name, color]) => ({ name, color }),
);

export function getSectionColor(name: string, fallback: string): string {
  const key = name.toLowerCase().trim();
  return SECTION_COLORS[key] ?? fallback;
}

interface SectionSelectorProps {
  defaultValue: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
  /** Anchor rect from getBoundingClientRect() for positioning the dropdown */
  anchorRect: DOMRect;
}

export function SectionSelector({ defaultValue, onCommit, onCancel, anchorRect }: SectionSelectorProps) {
  const [query, setQuery] = useState(defaultValue === 'New Section' ? '' : defaultValue);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = SECTION_PRESETS.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase().trim()),
  );

  // If query doesn't match any preset exactly, add a custom option
  const hasExactMatch = filtered.some(
    (p) => p.name.toLowerCase() === query.toLowerCase().trim(),
  );
  const showCustomOption = query.trim().length > 0 && !hasExactMatch;
  const totalOptions = filtered.length + (showCustomOption ? 1 : 0);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query]);

  // Scroll highlighted item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[highlightedIndex] as HTMLElement | undefined;
    item?.scrollIntoView?.({ block: 'nearest' });
  }, [highlightedIndex]);

  const commit = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (trimmed) onCommit(trimmed);
      else onCancel();
    },
    [onCommit, onCancel],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex((i) => Math.min(i + 1, totalOptions - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (showCustomOption && highlightedIndex === 0) {
            commit(query);
          } else {
            const presetIdx = showCustomOption ? highlightedIndex - 1 : highlightedIndex;
            if (filtered[presetIdx]) {
              commit(filtered[presetIdx].name);
            } else {
              commit(query);
            }
          }
          break;
        case 'Escape':
          e.preventDefault();
          onCancel();
          break;
        case 'Tab':
          e.preventDefault();
          onCancel();
          break;
      }
    },
    [totalOptions, showCustomOption, highlightedIndex, filtered, query, commit, onCancel],
  );

  // Position: below the anchor, clamped to viewport
  const top = anchorRect.bottom + 2;
  const left = anchorRect.left;

  return createPortal(
    <>
      {/* Click-away backdrop */}
      <div
        className="fixed inset-0 z-[9998]"
        onClick={onCancel}
        data-testid="section-selector-backdrop"
      />
      <div
        className="fixed z-[9999] bg-[#2a2a2a] border border-[#444] rounded shadow-lg"
        style={{ top, left, minWidth: 160, maxWidth: 220 }}
        data-testid="section-selector"
      >
        <input
          ref={inputRef}
          className="w-full bg-transparent text-white text-[11px] px-2 py-1.5 outline-none border-b border-[#444] placeholder-white/40"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search sections..."
          role="combobox"
          aria-expanded={true}
          aria-autocomplete="list"
          aria-controls="section-selector-list"
          aria-activedescendant={
            totalOptions > 0 ? `section-option-${highlightedIndex}` : undefined
          }
        />
        <ul
          ref={listRef}
          id="section-selector-list"
          role="listbox"
          className="max-h-[140px] overflow-y-auto py-0.5"
        >
          {showCustomOption && (
            <li
              id="section-option-0"
              role="option"
              aria-selected={highlightedIndex === 0}
              className={`flex items-center gap-2 px-2 py-1 text-[11px] cursor-pointer ${
                highlightedIndex === 0 ? 'bg-[rgba(74,95,255,0.25)] text-white' : 'text-white/70 hover:bg-white/5'
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(query);
              }}
              onMouseEnter={() => setHighlightedIndex(0)}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-white/30 shrink-0" />
              <span className="truncate">Use &quot;{query.trim()}&quot;</span>
            </li>
          )}
          {filtered.map((preset, i) => {
            const idx = showCustomOption ? i + 1 : i;
            return (
              <li
                key={preset.name}
                id={`section-option-${idx}`}
                role="option"
                aria-selected={highlightedIndex === idx}
                className={`flex items-center gap-2 px-2 py-1 text-[11px] cursor-pointer capitalize ${
                  highlightedIndex === idx ? 'bg-[rgba(74,95,255,0.25)] text-white' : 'text-white/70 hover:bg-white/5'
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(preset.name);
                }}
                onMouseEnter={() => setHighlightedIndex(idx)}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: preset.color }}
                />
                <span className="truncate">{preset.name}</span>
              </li>
            );
          })}
          {totalOptions === 0 && (
            <li className="px-2 py-1 text-[10px] text-white/30">No matches</li>
          )}
        </ul>
      </div>
    </>,
    document.body,
  );
}
