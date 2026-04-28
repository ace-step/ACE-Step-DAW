import { WaveformPreview } from './WaveformPreview';
import type { ABSide } from './ResultsPanel';

export interface EnhanceSourcePreviewProps {
  clipPrompt: string | undefined;
  clipDuration: number;
  trackDisplayName: string;
  hasClipAndTrack: boolean;
  hasAudio: boolean;
  chainedSourceAudioKey: string | null;
  canAB: boolean;
  abSide: ABSide;
  sourceIsPlaying: boolean;
  sourceProgress: number;
  sourcePeaks: number[];
  accentColor: string;
  inventoryLoaded: boolean;
  modelReady: boolean;
  modeSupported: boolean;
  mode: 'cover' | 'repaint';
  onSourcePlay: () => void;
  onSourceSeek?: (progress: number) => void;
  handleABToggle: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function EnhanceSourcePreview({
  clipPrompt,
  clipDuration,
  trackDisplayName,
  hasClipAndTrack,
  hasAudio,
  chainedSourceAudioKey,
  canAB,
  abSide,
  sourceIsPlaying,
  sourceProgress,
  sourcePeaks,
  accentColor,
  inventoryLoaded,
  modelReady,
  modeSupported,
  mode,
  onSourcePlay,
  onSourceSeek,
  handleABToggle,
}: EnhanceSourcePreviewProps) {
  return (
    <>
      {/* Source audio preview */}
      <div className="bg-[#161618] rounded-lg px-3 py-3 border border-[#333]">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wide">
            Source
            {chainedSourceAudioKey && (
              <span className="ml-1 text-teal-400 normal-case" data-testid="chained-source-indicator">(chained)</span>
            )}
            {canAB && (
              <span className={`ml-1.5 ${abSide === 'A' ? 'text-teal-400 font-bold' : 'text-zinc-600'}`}>A</span>
            )}
          </p>
          {hasClipAndTrack && (
            <span className="text-[9px] text-zinc-600 font-mono">
              {formatDuration(clipDuration)}
            </span>
          )}
        </div>
        {hasClipAndTrack ? (
          <>
            <div className="flex items-center gap-2">
              <button
                data-testid="source-play-btn"
                onClick={onSourcePlay}
                className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors flex-shrink-0 ${
                  sourceIsPlaying
                    ? 'bg-teal-600 text-white'
                    : 'bg-[#2a2a2e] text-zinc-400 hover:text-zinc-200'
                }`}
                aria-label={sourceIsPlaying ? 'Stop source' : 'Play source'}
              >
                {sourceIsPlaying ? (
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                ) : (
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                )}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-zinc-200 truncate">
                  {trackDisplayName}
                </p>
                <p className="text-[10px] text-zinc-500 truncate">{clipPrompt || '(no prompt)'}</p>
              </div>
            </div>
            {/* Real waveform */}
            <div className="mt-2">
              <WaveformPreview
                peaks={sourcePeaks}
                color={accentColor}
                height={40}
                playbackProgress={sourceProgress}
                onSeek={hasAudio ? onSourceSeek : undefined}
                data-testid="source-waveform"
              />
            </div>
          </>
        ) : (
          <p className="text-[11px] text-zinc-500">No clip found</p>
        )}
        {hasClipAndTrack && !hasAudio && (
          <p className="text-[10px] text-amber-400 mt-2">
            No audio generated yet — generate the clip first before enhancing.
          </p>
        )}
        {!inventoryLoaded && (
          <p className="text-[10px] text-amber-400 mt-2">
            Connecting to server...
          </p>
        )}
        {inventoryLoaded && !modelReady && (
          <p className="text-[10px] text-amber-400 mt-2">
            No model loaded on server. Load a model in Settings before enhancing.
          </p>
        )}
        {inventoryLoaded && modelReady && !modeSupported && (
          <p className="text-[10px] text-amber-400 mt-2">
            The currently loaded model does not support {mode} generation.
          </p>
        )}
      </div>

      {/* A/B Comparison Toggle */}
      {canAB && (
        <div className="flex items-center justify-center" data-testid="ab-toggle-section">
          <button
            data-testid="ab-toggle-btn"
            onClick={handleABToggle}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[11px] font-semibold transition-colors border ${
              abSide === 'A'
                ? 'border-teal-500/50 bg-teal-900/30 text-teal-300'
                : 'border-violet-500/50 bg-violet-900/30 text-violet-300'
            }`}
          >
            <span className={abSide === 'A' ? 'text-teal-300' : 'text-zinc-500'}>A</span>
            <svg className="w-3.5 h-3.5 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 16l5-5-5-5M17 8l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className={abSide === 'B' ? 'text-violet-300' : 'text-zinc-500'}>B</span>
          </button>
        </div>
      )}
    </>
  );
}
