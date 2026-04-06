import { useState, useCallback } from 'react';

const SUGGESTION_CHIPS = [
  'no autotune',
  'no heavy reverb',
  'no falsetto',
  'no distortion',
  'no electronic',
  'no screaming',
  'no rap',
  'no auto-generated lyrics',
  'no excessive bass',
  'no synthesizers',
] as const;

interface NegativePromptSectionProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * Collapsible negative prompt section with one-click suggestion chips.
 * Hidden by default — expands when the user clicks the toggle.
 */
export function NegativePromptSection({
  value,
  onChange,
  disabled = false,
}: NegativePromptSectionProps) {
  const [expanded, setExpanded] = useState(value.length > 0);

  const toggleChip = useCallback(
    (chip: string) => {
      const current = value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const idx = current.findIndex((c) => c.toLowerCase() === chip.toLowerCase());
      if (idx >= 0) {
        current.splice(idx, 1);
      } else {
        current.push(chip);
      }
      onChange(current.join(', '));
    },
    [value, onChange],
  );

  const activeChips = new Set(
    value
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );

  return (
    <section className="space-y-1.5">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[11px] font-medium uppercase text-zinc-500 hover:text-zinc-300 transition-colors"
        data-testid="negative-prompt-toggle"
      >
        <span
          className="inline-block transition-transform duration-150"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          ▶
        </span>
        Negative Prompt
        {value.trim() && !expanded && (
          <span className="ml-1 text-[9px] text-zinc-600 normal-case">
            ({value.split(',').filter((s) => s.trim()).length} items)
          </span>
        )}
      </button>

      {expanded && (
        <div className="space-y-2">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="Describe what you DON'T want (e.g., no autotune, no heavy reverb)"
            className="w-full resize-none rounded border border-[#444] bg-[#2a2a2a] px-2.5 py-2 text-sm text-white placeholder-zinc-600 focus:border-indigo-500 focus:outline-none disabled:opacity-40"
            rows={2}
            data-testid="negative-prompt-input"
          />
          <div className="flex flex-wrap gap-1">
            {SUGGESTION_CHIPS.map((chip) => {
              const isActive = activeChips.has(chip.toLowerCase());
              return (
                <button
                  key={chip}
                  type="button"
                  onClick={() => toggleChip(chip)}
                  disabled={disabled}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors border
                    ${
                      isActive
                        ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-300'
                        : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-300'
                    }
                    disabled:opacity-40 disabled:cursor-not-allowed`}
                  data-testid={`suggestion-chip-${chip.replace(/\s+/g, '-')}`}
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
