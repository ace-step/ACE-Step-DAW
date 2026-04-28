/**
 * NegativePromptSection — Collapsible negative prompt input with suggestion chips.
 *
 * Allows users to specify elements to exclude from AI music generation.
 * Collapsed by default to keep the UI clean for basic usage.
 */
import { useCallback, useEffect, useState } from 'react';

const SUGGESTION_CHIPS = [
  'distortion',
  'autotune',
  'harsh vocals',
  'noise',
  'silence',
  'reverb',
  'bass heavy',
  'high pitch',
] as const;

interface NegativePromptSectionProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function NegativePromptSection({ value, onChange, disabled }: NegativePromptSectionProps) {
  const [expanded, setExpanded] = useState(() => value.trim().length > 0);

  useEffect(() => {
    if (value.trim()) {
      setExpanded(true);
    }
  }, [value]);

  const toggleChip = useCallback(
    (chip: string) => {
      const terms = value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const idx = terms.findIndex((t) => t.toLowerCase() === chip.toLowerCase());
      if (idx >= 0) {
        terms.splice(idx, 1);
      } else {
        terms.push(chip);
      }
      onChange(terms.join(', '));
    },
    [value, onChange],
  );

  const activeTerms = new Set(
    value
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
  );

  return (
    <section className="space-y-1.5">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-1 text-[11px] font-medium uppercase text-zinc-500 hover:text-zinc-300 transition-colors"
        data-testid="negative-prompt-toggle"
      >
        <svg
          className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        Exclude
        {value.trim() && (
          <span className="ml-1 rounded bg-red-500/15 px-1 py-0.5 text-[9px] font-normal normal-case text-red-400">
            {activeTerms.size} active
          </span>
        )}
      </button>

      {expanded && (
        <div className="space-y-2">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="Elements to exclude (e.g. distortion, harsh vocals, noise)"
            aria-label="Negative prompt — elements to exclude from generation"
            data-testid="negative-prompt-input"
            className="h-16 w-full resize-none rounded-md border border-daw-border bg-daw-surface-2 px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:border-daw-accent focus:outline-none disabled:opacity-50"
          />
          <div className="flex flex-wrap gap-1" data-testid="negative-prompt-chips">
            {SUGGESTION_CHIPS.map((chip) => {
              const isActive = activeTerms.has(chip.toLowerCase());
              return (
                <button
                  key={chip}
                  type="button"
                  onClick={() => toggleChip(chip)}
                  disabled={disabled}
                  data-testid={`chip-${chip.replace(/\s+/g, '-')}`}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    isActive
                      ? 'bg-red-500/20 text-red-300 ring-1 ring-red-500/30'
                      : 'bg-white/5 text-zinc-500 hover:bg-white/8 hover:text-zinc-400'
                  }`}
                >
                  {isActive ? '−' : '+'} {chip}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
