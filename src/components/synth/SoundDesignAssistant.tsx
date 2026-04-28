import { useState, useCallback, useRef } from 'react';
import { parseSoundDescription, type ParameterAdjustment } from '../../services/soundDesignAssistant';

interface SoundDesignAssistantProps {
  trackId: string;
  onApplyAdjustments: (adjustments: ParameterAdjustment[]) => void;
  disabled?: boolean;
}

interface HistoryEntry {
  description: string;
  adjustments: ParameterAdjustment[];
  timestamp: number;
}

export function SoundDesignAssistant({
  onApplyAdjustments,
  disabled,
}: SoundDesignAssistantProps) {
  const [input, setInput] = useState('');
  const [preview, setPreview] = useState<ParameterAdjustment[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = useCallback((value: string) => {
    setInput(value);
    // Live preview of what would change
    const adjustments = parseSoundDescription(value);
    setPreview(adjustments);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!input.trim()) return;
    const adjustments = parseSoundDescription(input);
    if (adjustments.length === 0) return;

    onApplyAdjustments(adjustments);
    setHistory((prev) => [
      { description: input.trim(), adjustments, timestamp: Date.now() },
      ...prev,
    ]);
    setInput('');
    setPreview([]);
  }, [input, onApplyAdjustments]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const quickDescriptors = [
    'warmer', 'brighter', 'darker', 'fatter',
    'softer', 'sharper', 'punchier', 'dreamy',
  ];

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        disabled={disabled}
        className="w-full rounded border border-dashed border-zinc-700 px-3 py-1.5 text-[10px] text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors disabled:opacity-40"
        data-testid="sound-design-toggle"
      >
        Sound Design Assistant
      </button>
    );
  }

  return (
    <div
      className="rounded border border-zinc-700 bg-[#1a1a1a] overflow-hidden"
      data-testid="sound-design-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-700/50">
        <span className="text-[10px] font-medium text-zinc-400 uppercase">
          Sound Design Assistant
        </span>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-zinc-600 hover:text-zinc-400 text-sm leading-none"
        >
          x
        </button>
      </div>

      {/* Input */}
      <div className="px-3 py-2">
        <div className="flex gap-1.5">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the sound you want..."
            className="flex-1 rounded border border-[#444] bg-[#2a2a2a] px-2 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
            disabled={disabled}
            data-testid="sound-design-input"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={disabled || preview.length === 0}
            className="rounded bg-indigo-600 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            data-testid="sound-design-apply"
          >
            Apply
          </button>
        </div>

        {/* Quick descriptors */}
        <div className="flex flex-wrap gap-1 mt-2">
          {quickDescriptors.map((desc) => (
            <button
              key={desc}
              type="button"
              onClick={() => {
                handleInputChange(desc);
                // Also auto-submit
                const adjustments = parseSoundDescription(desc);
                if (adjustments.length > 0) {
                  onApplyAdjustments(adjustments);
                  setHistory((prev) => [
                    { description: desc, adjustments, timestamp: Date.now() },
                    ...prev,
                  ]);
                  setInput('');
                  setPreview([]);
                }
              }}
              disabled={disabled}
              className="rounded-full border border-zinc-700 px-2 py-0.5 text-[9px] text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors disabled:opacity-40"
              data-testid={`quick-${desc}`}
            >
              {desc}
            </button>
          ))}
        </div>
      </div>

      {/* Preview of pending changes */}
      {preview.length > 0 && (
        <div className="px-3 py-1.5 border-t border-zinc-700/50 bg-indigo-950/10">
          <p className="text-[9px] text-zinc-500 uppercase mb-1">Preview Changes</p>
          {preview.map((adj, i) => (
            <div key={i} className="flex items-center justify-between py-0.5">
              <span className="text-[10px] text-zinc-400">{adj.description}</span>
              <span className={`text-[10px] font-mono ${adj.delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {adj.delta > 0 ? '+' : ''}{typeof adj.delta === 'number' && adj.delta % 1 !== 0 ? adj.delta.toFixed(2) : adj.delta}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="px-3 py-1.5 border-t border-zinc-700/50 max-h-24 overflow-y-auto">
          <p className="text-[9px] text-zinc-500 uppercase mb-1">History</p>
          {history.slice(0, 5).map((entry, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-0.5 group"
            >
              <span className="text-[10px] text-zinc-500">
                &ldquo;{entry.description}&rdquo;
              </span>
              <span className="text-[9px] text-zinc-600">
                {entry.adjustments.length} change{entry.adjustments.length !== 1 ? 's' : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
