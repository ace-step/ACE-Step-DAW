import { useCallback, useMemo, useRef, useState } from 'react';
import { getPromptSuggestions, type PromptSuggestion } from '../constants/promptSuggestions';

export interface UsePromptAutocompleteOptions {
  maxResults?: number;
}

export interface UsePromptAutocompleteReturn {
  suggestions: PromptSuggestion[];
  selectedIndex: number;
  isOpen: boolean;
  handleInputChange: (fullText: string, cursorPosition: number) => void;
  handleKeyDown: (event: React.KeyboardEvent) => string | null;
  accept: (index?: number) => string | null;
  dismiss: () => void;
  currentToken: string;
}

const TOKEN_SEPARATORS = /[\s,]+/;

/**
 * Extract the token being typed at the cursor position.
 * Looks at the last whitespace/comma-separated word before cursor.
 */
function extractCurrentToken(text: string, cursorPosition: number): { token: string; start: number; end: number } {
  const beforeCursor = text.slice(0, cursorPosition);

  // Walk backwards to find the start of the current word
  let start = cursorPosition;
  for (let i = cursorPosition - 1; i >= 0; i--) {
    if (TOKEN_SEPARATORS.test(text[i])) {
      start = i + 1;
      break;
    }
    if (i === 0) {
      start = 0;
    }
  }

  // Walk forward to find end of current word
  let end = cursorPosition;
  for (let i = cursorPosition; i < text.length; i++) {
    if (TOKEN_SEPARATORS.test(text[i])) {
      end = i;
      break;
    }
    if (i === text.length - 1) {
      end = text.length;
    }
  }

  const token = text.slice(start, cursorPosition);
  return { token, start, end };
}

export function usePromptAutocomplete(
  options: UsePromptAutocompleteOptions = {},
): UsePromptAutocompleteReturn {
  const { maxResults = 8 } = options;

  const [currentToken, setCurrentToken] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const tokenInfoRef = useRef<{ token: string; start: number; end: number }>({
    token: '',
    start: 0,
    end: 0,
  });
  const fullTextRef = useRef('');

  const suggestions = useMemo(
    () => getPromptSuggestions(currentToken, maxResults),
    [currentToken, maxResults],
  );

  const handleInputChange = useCallback(
    (fullText: string, cursorPosition: number) => {
      fullTextRef.current = fullText;
      const info = extractCurrentToken(fullText, cursorPosition);
      tokenInfoRef.current = info;
      setCurrentToken(info.token);
      setSelectedIndex(0);

      const matches = getPromptSuggestions(info.token, maxResults);
      setIsOpen(matches.length > 0 && info.token.length > 0);
    },
    [maxResults],
  );

  const accept = useCallback(
    (index?: number): string | null => {
      const idx = index ?? selectedIndex;
      if (!isOpen || idx < 0 || idx >= suggestions.length) return null;

      const suggestion = suggestions[idx];
      const { start, end } = tokenInfoRef.current;
      const text = fullTextRef.current;

      const before = text.slice(0, start);
      const after = text.slice(end);

      const newText = before + suggestion.text + after;

      setIsOpen(false);
      setCurrentToken('');
      setSelectedIndex(0);

      return newText;
    },
    [isOpen, selectedIndex, suggestions],
  );

  const dismiss = useCallback(() => {
    setIsOpen(false);
    setSelectedIndex(0);
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent): string | null => {
      if (!isOpen) return null;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % suggestions.length);
          return null;
        case 'ArrowUp':
          event.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
          return null;
        case 'Enter':
          if (suggestions.length > 0) {
            event.preventDefault();
            return accept();
          }
          return null;
        case 'Tab':
          if (suggestions.length > 0) {
            event.preventDefault();
            return accept();
          }
          return null;
        case 'Escape':
          event.preventDefault();
          dismiss();
          return null;
        default:
          return null;
      }
    },
    [accept, dismiss, isOpen, suggestions.length],
  );

  return {
    suggestions,
    selectedIndex,
    isOpen,
    handleInputChange,
    handleKeyDown,
    accept,
    dismiss,
    currentToken,
  };
}

export { extractCurrentToken as _extractCurrentToken };
