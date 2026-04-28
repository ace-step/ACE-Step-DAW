import { useCallback } from 'react';
import type { MouseEvent } from 'react';
import type { VoiceProfile } from '../../types/voice';
import { renderSimplePeaks } from '../generation/WaveformPreview';

const SKILL_COLORS: Record<string, string> = {
  beginner: 'bg-emerald-800/50 text-emerald-300',
  intermediate: 'bg-blue-800/50 text-blue-300',
  advanced: 'bg-purple-800/50 text-purple-300',
  professional: 'bg-amber-800/50 text-amber-300',
};

function formatDuration(seconds: number): string {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

interface VoiceCardProps {
  voice: VoiceProfile;
  isSelected: boolean;
  isPlaying: boolean;
  onSelect: (id: string) => void;
  onPlay: (id: string) => void;
  onStop: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function VoiceCard({
  voice,
  isSelected,
  isPlaying,
  onSelect,
  onPlay,
  onStop,
  onEdit,
  onDelete,
}: VoiceCardProps) {
  const handlePlayToggle = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      if (isPlaying) {
        onStop();
      } else {
        onPlay(voice.id);
      }
    },
    [isPlaying, onPlay, onStop, voice.id],
  );

  const handleEdit = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      onEdit(voice.id);
    },
    [onEdit, voice.id],
  );

  const handleDelete = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      onDelete(voice.id);
    },
    [onDelete, voice.id],
  );

  return (
    <div
      className={`group relative flex flex-col gap-1.5 rounded-lg border p-2 cursor-pointer transition-colors ${
        isSelected
          ? 'border-daw-accent bg-daw-accent/10'
          : 'border-daw-border bg-daw-surface hover:bg-daw-surface-2 hover:border-daw-surface-3'
      }`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(voice.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(voice.id); } }}
      data-testid={`voice-card-${voice.id}`}
    >
      {/* Waveform thumbnail */}
      <div className="relative h-8 rounded bg-daw-bg overflow-hidden">
        {voice.waveformPeaks && voice.waveformPeaks.length > 0 ? (
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${voice.waveformPeaks.length} 100`}
            preserveAspectRatio="none"
            className="absolute inset-0"
          >
            {renderSimplePeaks(voice.waveformPeaks, isSelected ? 'var(--color-daw-accent)' : '#6b7280')}
          </svg>
        ) : (
          <div className="flex items-center justify-center h-full">
            <span className="text-[8px] text-zinc-600">No waveform</span>
          </div>
        )}
        {/* Play/Stop overlay button */}
        <button
          type="button"
          onClick={handlePlayToggle}
          className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/30 transition-colors"
          aria-label={isPlaying ? 'Stop preview' : 'Play preview'}
          data-testid={`voice-play-${voice.id}`}
        >
          <div className={`w-5 h-5 flex items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity ${isPlaying ? 'opacity-100' : ''}`}>
            {isPlaying ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <rect x="1" y="1" width="3" height="8" rx="0.5" />
                <rect x="6" y="1" width="3" height="8" rx="0.5" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <path d="M2 1l7 4-7 4V1z" />
              </svg>
            )}
          </div>
        </button>
      </div>

      {/* Info row */}
      <div className="flex items-start justify-between gap-1">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium text-zinc-200 truncate" title={voice.name}>
            {voice.name}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[9px] text-zinc-500 font-mono">{formatDuration(voice.durationSeconds)}</span>
            <span className={`text-[8px] px-1 py-px rounded ${SKILL_COLORS[voice.skillLevel] ?? 'bg-zinc-700 text-zinc-400'}`}>
              {voice.skillLevel}
            </span>
            <span
              className={`text-[8px] px-1 py-px rounded ${
                voice.verificationStatus === 'verified'
                  ? 'bg-emerald-900/50 text-emerald-300'
                  : 'bg-zinc-800 text-zinc-500'
              }`}
              title={voice.verificationStatus === 'verified' ? 'Voice identity verified' : 'Voice identity unverified'}
            >
              {voice.verificationStatus === 'verified' ? 'verified' : 'unverified'}
            </span>
          </div>
        </div>

        {/* Action buttons (visible on hover) */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            type="button"
            onClick={handleEdit}
            className="w-5 h-5 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-200 hover:bg-daw-hover-subtle"
            aria-label="Edit voice"
            data-testid={`voice-edit-${voice.id}`}
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="w-5 h-5 flex items-center justify-center rounded text-zinc-500 hover:text-red-400 hover:bg-red-900/20"
            aria-label="Delete voice"
            data-testid={`voice-delete-${voice.id}`}
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tags */}
      {voice.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {voice.tags.map((tag) => (
            <span
              key={tag}
              className="text-[8px] px-1 py-px rounded bg-daw-surface-2 text-zinc-500"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
