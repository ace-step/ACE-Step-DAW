import { ENHANCE_PRESETS, surpriseMe } from '../../constants/enhancePresets';
import { TimbreReferenceSelector } from './TimbreReferenceSelector';
import type { TimbreReference } from '../../services/timbreTransfer';

export type ConsistencyLevel = 'low' | 'medium' | 'high';

export interface EnhanceCoverControlsProps {
  lyrics: string;
  onLyricsChange: (value: string) => void;
  caption: string;
  onCaptionChange: (value: string) => void;
  consistency: ConsistencyLevel;
  onConsistencyChange: (value: ConsistencyLevel) => void;
  createNew: boolean;
  onCreateNewChange: (value: boolean) => void;
  quickStylesOpen: boolean;
  onQuickStylesToggle: () => void;
  timbreRef?: TimbreReference | null;
  onTimbreRefChange?: (ref: TimbreReference | null) => void;
  isSubmitting?: boolean;
}

export function EnhanceCoverControls({
  lyrics,
  onLyricsChange,
  caption,
  onCaptionChange,
  consistency,
  onConsistencyChange,
  createNew,
  onCreateNewChange,
  quickStylesOpen,
  onQuickStylesToggle,
  timbreRef,
  onTimbreRefChange,
  isSubmitting,
}: EnhanceCoverControlsProps) {
  return (
    <>
      {/* Lyrics */}
      <div>
        <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wide mb-1">
          Lyrics
        </label>
        <textarea
          data-testid="enhance-lyrics-input"
          value={lyrics}
          onChange={(e) => onLyricsChange(e.target.value)}
          placeholder="Override lyrics for this enhancement..."
          rows={3}
          className="w-full bg-[#161618] border border-[#333] rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-teal-500/60 font-mono"
        />
      </div>

      {/* Quick Styles presets */}
      <div>
        <button
          data-testid="quick-styles-toggle"
          onClick={onQuickStylesToggle}
          className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-500 uppercase tracking-wide mb-1 hover:text-zinc-300 transition-colors"
        >
          <svg
            className={`w-3 h-3 transition-transform ${quickStylesOpen ? 'rotate-90' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Quick Styles
        </button>
        {quickStylesOpen && (
          <div data-testid="quick-styles-grid" className="flex flex-wrap gap-1.5 mb-2">
            {ENHANCE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                data-testid={`preset-${preset.id}`}
                onClick={() => {
                  onCaptionChange(preset.caption);
                  onConsistencyChange(preset.consistency);
                }}
                className="px-2.5 py-1 rounded-full bg-[#2a2a2e] hover:bg-[#3a3a3e] text-[10px] text-zinc-300 transition-colors whitespace-nowrap border border-[#3a3a3a] hover:border-teal-500/40"
              >
                {preset.icon} {preset.label}
              </button>
            ))}
            <button
              data-testid="preset-surprise-me"
              onClick={() => {
                const result = surpriseMe();
                onCaptionChange(result.caption);
                onConsistencyChange(result.consistency);
              }}
              className="px-2.5 py-1 rounded-full bg-gradient-to-r from-purple-600/30 to-pink-600/30 hover:from-purple-600/50 hover:to-pink-600/50 text-[10px] text-zinc-200 transition-all whitespace-nowrap border border-purple-500/30 hover:border-purple-400/60 font-medium"
            >
              {'\u{1F3B2}'} Surprise Me
            </button>
          </div>
        )}
      </div>

      {/* Styles (caption) */}
      <div>
        <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wide mb-1">
          Styles
        </label>
        <textarea
          data-testid="enhance-styles-input"
          value={caption}
          onChange={(e) => onCaptionChange(e.target.value)}
          placeholder="e.g. jazz arrangement, acoustic guitar, slow tempo..."
          rows={2}
          className="w-full bg-[#161618] border border-[#333] rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-teal-500/60"
        />
      </div>

      {/* Consistency */}
      <div>
        <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wide mb-2">
          Consistency
        </label>
        <div className="flex gap-1" data-testid="enhance-consistency-toggle">
          {(['low', 'medium', 'high'] as ConsistencyLevel[]).map((level) => (
            <button
              key={level}
              onClick={() => onConsistencyChange(level)}
              className={`flex-1 py-1.5 rounded-md text-[11px] font-medium capitalize transition-colors ${
                consistency === level
                  ? 'bg-teal-600 text-white'
                  : 'bg-[#161618] text-zinc-500 hover:bg-[#2a2a2e] hover:text-zinc-300'
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      {/* Timbre Reference */}
      {onTimbreRefChange && (
        <TimbreReferenceSelector
          timbreRef={timbreRef ?? null}
          onTimbreRefChange={onTimbreRefChange}
          disabled={isSubmitting}
        />
      )}

      {/* Create new vs replace */}
      <div className="flex items-center gap-3 pt-1">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={createNew}
            onChange={(e) => onCreateNewChange(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-[#444] bg-[#222] accent-teal-500"
          />
          <span className="text-[10px] text-zinc-400">Create new clip (leave original intact)</span>
        </label>
      </div>
    </>
  );
}
