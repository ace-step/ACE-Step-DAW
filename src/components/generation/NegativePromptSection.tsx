import { useId, useState } from 'react';

/** Common exclusion suggestions — one-click chips for quick negative prompting */
const SUGGESTION_CHIPS = [
  'no autotune',
  'no heavy reverb',
  'no distortion',
  'no falsetto',
  'no guitar solo',
  'no background vocals',
  'no synthesizer',
  'no drum machine',
] as const;

/** Parse comma-separated tokens for exact-match duplicate detection */
function parseTokens(value: string): string[] {
  return value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
}

interface NegativePromptSectionProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function NegativePromptSection({ value, onChange, disabled }: NegativePromptSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();

  const tokens = parseTokens(value);

  const handleChipClick = (chip: string) => {
    const current = value.trim();
    if (tokens.includes(chip.toLowerCase())) return;
    onChange(current ? `${current}, ${chip}` : chip);
  };

  const hasValue = value.trim().length > 0;

  return (
    <section className="space-y-1.5" data-testid="negative-prompt-section">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 text-left"
        aria-expanded={expanded}
        aria-controls={contentId}
        data-testid="negative-prompt-toggle"
      >
        <svg
          width={10}
          height={10}
          viewBox="0 0 10 10"
          fill="currentColor"
          className={`text-zinc-500 transition-transform ${expanded ? 'rotate-90' : ''}`}
        >
          <path d="M3 1l4 4-4 4z" />
        </svg>
        <span className="text-[11px] font-medium uppercase text-zinc-400">
          Negative Prompt
        </span>
        {!expanded && hasValue && (
          <span className="ml-auto max-w-[60%] truncate text-[10px] text-zinc-500">
            {value}
          </span>
        )}
      </button>

      {expanded && (
        <div id={contentId} className="space-y-1.5">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={2}
            placeholder="e.g. no autotune, no heavy reverb, no falsetto..."
            className="w-full resize-none rounded border border-[#444] bg-[#2a2a2a] px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
            disabled={disabled}
            aria-label="Negative prompt — exclude unwanted elements"
            data-testid="negative-prompt-input"
          />
          <div className="flex flex-wrap gap-1" data-testid="negative-prompt-chips">
            {SUGGESTION_CHIPS.map((chip) => {
              const isActive = tokens.includes(chip.toLowerCase());
              return (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleChipClick(chip)}
                  disabled={disabled || isActive}
                  className={`rounded-full px-2 py-0.5 text-[10px] transition-colors ${
                    isActive
                      ? 'bg-zinc-600 text-zinc-300 cursor-default'
                      : 'bg-[#333] text-zinc-400 hover:bg-[#444] hover:text-zinc-200'
                  }`}
                >
                  {chip}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
