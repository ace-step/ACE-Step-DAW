import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { PromptAutocompleteSuggestion } from '../../utils/promptAutocomplete';

interface PromptAutocompleteTextareaProps {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  getSuggestions: (prompt: string, caretIndex?: number) => PromptAutocompleteSuggestion[];
  applySuggestion: (suggestion: string, caretIndex?: number) => { prompt: string; caretIndex: number } | null;
}

export function PromptAutocompleteTextarea({
  value,
  disabled = false,
  onChange,
  getSuggestions,
  applySuggestion,
}: PromptAutocompleteTextareaProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const blurTimeoutRef = useRef<number | null>(null);
  const listboxId = 'prompt-autocomplete-list';
  const [caretIndex, setCaretIndex] = useState<number | undefined>(undefined);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isComposing, setIsComposing] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);

  const suggestions = useMemo(
    () => (isComposing || !isFocused || !isAutocompleteOpen || disabled ? [] : getSuggestions(value, caretIndex)),
    [caretIndex, disabled, getSuggestions, isAutocompleteOpen, isComposing, isFocused, value],
  );

  useEffect(() => {
    setHighlightedIndex((current) => {
      if (suggestions.length === 0) return -1;
      if (current < 0) return suggestions.length > 0 ? 0 : -1;
      return Math.min(current, suggestions.length - 1);
    });
  }, [suggestions]);

  useEffect(() => () => {
    if (blurTimeoutRef.current !== null) {
      window.clearTimeout(blurTimeoutRef.current);
    }
  }, []);

  const handleSelectionChange = () => {
    const nextCaret = inputRef.current?.selectionStart ?? value.length;
    setCaretIndex(nextCaret);
  };

  const commitSuggestion = (suggestionValue: string) => {
    const applied = applySuggestion(suggestionValue, caretIndex);
    if (!applied) return;

    setCaretIndex(applied.caretIndex);
    setHighlightedIndex(-1);
    setIsAutocompleteOpen(false);

    requestAnimationFrame(() => {
      if (!inputRef.current) return;
      inputRef.current.focus();
      inputRef.current.setSelectionRange(applied.caretIndex, applied.caretIndex);
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isComposing || suggestions.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((current) => Math.min(current + 1, suggestions.length - 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, -1));
      return;
    }

    if (event.key === 'Escape') {
      setHighlightedIndex(-1);
      setIsAutocompleteOpen(false);
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    if (event.key === 'Enter' && highlightedIndex >= 0 && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      commitSuggestion(suggestions[highlightedIndex].value);
    }
  };

  const activeSuggestionId = highlightedIndex >= 0 ? `${listboxId}-option-${highlightedIndex}` : undefined;

  return (
    <div className="relative">
      <textarea
        id="generation-prompt-input"
        ref={inputRef}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setCaretIndex(event.target.selectionStart ?? event.target.value.length);
          setIsFocused(true);
          setIsAutocompleteOpen(true);
        }}
        onClick={handleSelectionChange}
        onKeyUp={handleSelectionChange}
        onSelect={handleSelectionChange}
        onFocus={() => {
          if (blurTimeoutRef.current !== null) {
            window.clearTimeout(blurTimeoutRef.current);
            blurTimeoutRef.current = null;
          }
          setIsFocused(true);
          setIsAutocompleteOpen(true);
        }}
        onBlur={() => {
          blurTimeoutRef.current = window.setTimeout(() => {
            setIsFocused(false);
            setIsAutocompleteOpen(false);
          }, 100);
        }}
        onCompositionStart={() => {
          setIsComposing(true);
          setHighlightedIndex(-1);
          setIsAutocompleteOpen(false);
        }}
        onCompositionEnd={(event) => {
          setIsComposing(false);
          setCaretIndex(event.currentTarget.selectionStart ?? event.currentTarget.value.length);
          setIsFocused(true);
          setIsAutocompleteOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Describe the music you want to generate..."
        className="w-full resize-none rounded border border-[#444] bg-[#2a2a2a] px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
        rows={3}
        disabled={disabled}
        role="combobox"
        aria-label="Generation prompt"
        aria-autocomplete="list"
        aria-controls={suggestions.length > 0 ? listboxId : undefined}
        aria-expanded={suggestions.length > 0}
        aria-activedescendant={activeSuggestionId}
        data-testid="generation-prompt-input"
      />

      {suggestions.length > 0 && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Prompt autocomplete suggestions"
          className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-[#444] bg-[#191919] shadow-xl"
          data-testid="prompt-autocomplete-list"
        >
          {suggestions.map((suggestion, index) => {
            const isActive = index === highlightedIndex;
            return (
              <button
                key={`${suggestion.category}-${suggestion.value}`}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                data-testid={`prompt-suggestion-${index}`}
                aria-label={`${suggestion.value} ${suggestion.category}`}
                aria-selected={isActive}
                className={`flex w-full items-center justify-between gap-3 px-2 py-2 text-left text-xs transition-colors ${
                  isActive ? 'bg-indigo-500/20 text-indigo-50' : 'text-zinc-200 hover:bg-[#2a2a2a]'
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => commitSuggestion(suggestion.value)}
              >
                <span>{suggestion.value}</span>
                <span className="rounded-full border border-[#444] px-1.5 py-0.5 text-[10px] tracking-wide text-zinc-400">
                  {suggestion.category.charAt(0).toUpperCase() + suggestion.category.slice(1)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
