import { useCallback, useEffect, useRef } from 'react';
import type { PromptSuggestion, PromptSuggestionCategory } from '../../constants/promptSuggestions';

const CATEGORY_LABELS: Record<PromptSuggestionCategory, string> = {
  genre: 'Genre',
  instrument: 'Instrument',
  mood: 'Mood',
  technique: 'Technique',
};

const CATEGORY_COLORS: Record<PromptSuggestionCategory, string> = {
  genre: 'text-indigo-400',
  instrument: 'text-emerald-400',
  mood: 'text-amber-400',
  technique: 'text-cyan-400',
};

interface PromptAutocompleteProps {
  suggestions: PromptSuggestion[];
  selectedIndex: number;
  isOpen: boolean;
  onSelect: (index: number) => void;
}

export function PromptAutocomplete({
  suggestions,
  selectedIndex,
  isOpen,
  onSelect,
}: PromptAutocompleteProps) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    if (selected && typeof selected.scrollIntoView === 'function') {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent, index: number) => {
      event.preventDefault();
      onSelect(index);
    },
    [onSelect],
  );

  if (!isOpen || suggestions.length === 0) return null;

  return (
    <ul
      ref={listRef}
      className="absolute left-0 right-0 z-50 max-h-48 overflow-y-auto rounded border border-[#555] bg-[#2a2a2a] shadow-lg"
      role="listbox"
      aria-label="Prompt suggestions"
      data-testid="prompt-autocomplete-list"
    >
      {suggestions.map((suggestion, index) => (
        <li
          key={suggestion.text}
          role="option"
          aria-selected={index === selectedIndex}
          className={`flex cursor-pointer items-center justify-between px-2 py-1.5 text-sm ${
            index === selectedIndex
              ? 'bg-indigo-600/40 text-zinc-100'
              : 'text-zinc-300 hover:bg-[#333]'
          }`}
          onMouseDown={(event) => handleMouseDown(event, index)}
          data-testid={`prompt-suggestion-${index}`}
        >
          <span>{suggestion.text}</span>
          <span className={`text-[10px] ${CATEGORY_COLORS[suggestion.category]}`}>
            {CATEGORY_LABELS[suggestion.category]}
          </span>
        </li>
      ))}
    </ul>
  );
}
