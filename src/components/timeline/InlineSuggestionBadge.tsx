import { useState, useCallback, useEffect } from 'react';
import { useUIStore } from '../../store/uiStore';
import type { InlineSuggestion } from '../../types/suggestions';

interface InlineSuggestionBadgeProps {
  suggestion: InlineSuggestion;
  pixelsPerSecond: number;
}

export function InlineSuggestionBadge({ suggestion, pixelsPerSecond }: InlineSuggestionBadgeProps) {
  const dismissInlineSuggestion = useUIStore((s) => s.dismissInlineSuggestion);
  const [expanded, setExpanded] = useState(false);

  const left = suggestion.time * pixelsPerSecond;

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((v) => !v);
  }, []);

  const handleDismiss = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    dismissInlineSuggestion(suggestion.id);
  }, [suggestion.id, dismissInlineSuggestion]);

  // Dismiss on Escape
  useEffect(() => {
    if (!expanded) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setExpanded(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [expanded]);

  // Close on click-away
  useEffect(() => {
    if (!expanded) return;
    const handleClickAway = () => setExpanded(false);
    window.addEventListener('click', handleClickAway);
    return () => window.removeEventListener('click', handleClickAway);
  }, [expanded]);

  const typeColors: Record<string, string> = {
    fill: 'bg-emerald-500/80',
    arrangement: 'bg-amber-500/80',
    variation: 'bg-blue-500/80',
    next: 'bg-violet-500/80',
  };

  return (
    <div
      className="absolute z-30 pointer-events-auto"
      style={{ left, top: -2 }}
      data-testid={`suggestion-badge-${suggestion.id}`}
    >
      {/* Sparkle icon */}
      <button
        onClick={handleClick}
        className={`
          w-5 h-5 rounded-full flex items-center justify-center
          ${typeColors[suggestion.type] ?? 'bg-violet-500/80'}
          hover:scale-110 transition-transform shadow-lg
          text-white text-[10px] leading-none cursor-pointer
        `}
        title={suggestion.text}
      >
        ✦
      </button>

      {/* Expanded popover */}
      {expanded && (
        <div
          className="absolute top-6 left-0 z-50 bg-[#2a2a2a] border border-[#555] rounded-lg shadow-2xl p-3 min-w-[220px] max-w-[300px]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wide ${typeColors[suggestion.type] ?? 'bg-violet-500/80'} text-white`}>
              {suggestion.type}
            </span>
            <button
              onClick={handleDismiss}
              className="text-zinc-500 hover:text-zinc-200 text-[10px] leading-none transition-colors"
              title="Dismiss suggestion"
            >
              ✕
            </button>
          </div>
          <p className="text-[11px] text-zinc-200 leading-relaxed mt-1">
            {suggestion.text}
          </p>
          <p className="text-[9px] text-zinc-600 mt-2">
            Click away or press Esc to close. This suggestion will not be auto-applied.
          </p>
        </div>
      )}
    </div>
  );
}
