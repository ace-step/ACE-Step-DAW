import { WaveformPreview } from './WaveformPreview';

type ABSide = 'A' | 'B';

interface ResultEntry {
  id: string;
  clipId: string;
  audioKey: string;
  title: string;
  duration: string;
  durationSec: number;
  peaks: number[];
  timestamp: number;
  status: 'generating' | 'ready' | 'error';
  error?: string;
}

interface EnhanceResultsProps {
  results: ResultEntry[];
  selectedResultId: string | null;
  onSelectResult: (id: string, idx: number) => void;
  canAB: boolean;
  abSide: ABSide;
  // Playback
  playingId: string | null;
  progress: number;
  onResultPlay: (resultId: string, audioKey: string) => void;
  onUseAsSource: (result: ResultEntry) => void;
  // Mini player
  miniPlayerIdx: number;
  onMiniPrev: () => void;
  onMiniNext: () => void;
  onMiniPlay: () => void;
  onMiniSeek: (e: React.MouseEvent<HTMLDivElement>) => void;
  miniIsPlaying: boolean;
  miniProgress: number;
  miniResult: ResultEntry | null;
}

export function EnhanceResults(props: EnhanceResultsProps) {
  const {
    results, selectedResultId, onSelectResult, canAB, abSide,
    playingId, progress, onResultPlay, onUseAsSource,
    miniPlayerIdx, onMiniPrev, onMiniNext, onMiniPlay, onMiniSeek,
    miniIsPlaying, miniProgress, miniResult,
  } = props;

  return (
    <div data-testid="enhance-results" className="w-[220px] min-w-[220px] flex flex-col bg-[#1a1a1e]">
      <div className="px-3 py-3 border-b border-[#3a3a3a]">
        <p className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wide">Results</p>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <svg className="w-8 h-8 text-zinc-700 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 18V5l12-2v13" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
            </svg>
            <p className="text-[11px] text-zinc-600">Enhanced results will appear here</p>
          </div>
        ) : (
          results.map((r, idx) => {
            const isPlaying = playingId === r.id;
            const isSelected = r.id === selectedResultId;
            return (
              <div
                key={r.id}
                data-testid={`result-item-${idx}`}
                onClick={() => onSelectResult(r.id, idx)}
                className={`rounded-md transition-colors group cursor-pointer ${isSelected ? 'bg-[#2a2a30] ring-1 ring-zinc-600' : 'hover:bg-[#222226]'}`}
              >
                <div className="flex items-center gap-2 px-2 py-2">
                  {r.status === 'generating' ? (
                    <div className="w-6 h-6 flex items-center justify-center flex-shrink-0"><div className="w-4 h-4 border-2 border-zinc-600 border-t-teal-400 rounded-full animate-spin" /></div>
                  ) : r.status === 'error' ? (
                    <div className="w-6 h-6 flex items-center justify-center rounded-full bg-red-900/50 text-red-400 flex-shrink-0">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
                    </div>
                  ) : (
                    <button
                      data-testid={`result-play-btn-${idx}`}
                      onClick={(e) => { e.stopPropagation(); onResultPlay(r.id, r.audioKey); }}
                      className={`w-6 h-6 flex items-center justify-center rounded-full transition-colors flex-shrink-0 ${isPlaying ? 'bg-violet-600 text-white' : 'bg-[#2a2a2e] text-zinc-400 hover:text-zinc-200'}`}
                      aria-label={isPlaying ? 'Stop result' : 'Play result'}
                    >
                      {isPlaying ? (
                        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                      ) : (
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                      )}
                    </button>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-[11px] truncate ${r.status === 'error' ? 'text-red-400' : 'text-zinc-300'}`}>
                      {r.title}
                      {canAB && isSelected && <span className={`ml-1 ${abSide === 'B' ? 'text-violet-400 font-bold' : 'text-zinc-600'}`}>B</span>}
                    </p>
                    <p className="text-[10px] text-zinc-600">{r.status === 'generating' ? 'Generating...' : r.status === 'error' ? (r.error ?? 'Failed') : r.duration}</p>
                  </div>
                  {r.audioKey && (
                    <button
                      data-testid={`use-as-source-btn-${idx}`}
                      onClick={(e) => { e.stopPropagation(); onUseAsSource(r); }}
                      className="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded text-[9px] font-medium bg-teal-700/50 text-teal-300 hover:bg-teal-600/60 transition-all whitespace-nowrap"
                      title="Use this result as source for next enhancement"
                    >Use as Source</button>
                  )}
                </div>
                {r.peaks.length > 0 && (
                  <div className="px-2 pb-2">
                    <WaveformPreview peaks={r.peaks} color="#8b5cf6" height={24} playbackProgress={isPlaying ? progress : 0} data-testid={`result-waveform-${idx}`} />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Mini player */}
      {results.length > 0 && (
        <div className="border-t border-[#3a3a3a] px-3 py-2.5" data-testid="mini-player">
          <div className="flex items-center gap-2">
            <button data-testid="mini-prev-btn" onClick={onMiniPrev} disabled={miniPlayerIdx <= 0} className={`transition-colors ${miniPlayerIdx <= 0 ? 'text-zinc-700' : 'text-zinc-500 hover:text-zinc-300'}`} aria-label="Previous">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
            </button>
            <button data-testid="mini-play-btn" onClick={onMiniPlay} className={`transition-colors ${miniIsPlaying ? 'text-violet-400' : 'text-zinc-300 hover:text-white'}`} aria-label={miniIsPlaying ? 'Pause' : 'Play'}>
              {miniIsPlaying ? (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>
            <button data-testid="mini-next-btn" onClick={onMiniNext} disabled={miniPlayerIdx >= results.length - 1} className={`transition-colors ${miniPlayerIdx >= results.length - 1 ? 'text-zinc-700' : 'text-zinc-500 hover:text-zinc-300'}`} aria-label="Next">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M16 18h2V6h-2zm-2-6L5.5 6v12z" /></svg>
            </button>
            <div data-testid="mini-progress-bar" className="flex-1 mx-1.5 cursor-pointer" onClick={onMiniSeek}>
              <div className="h-1 bg-[#2a2a2e] rounded-full relative">
                <div className="h-1 bg-violet-600 rounded-full transition-[width] duration-75" style={{ width: `${miniProgress * 100}%` }} />
              </div>
            </div>
            {miniResult && <span className="text-[9px] text-zinc-600 font-mono whitespace-nowrap">{miniResult.duration !== '--:--' ? miniResult.duration : ''}</span>}
          </div>
          {miniResult && <p className="text-[9px] text-zinc-500 truncate mt-1">{miniResult.title}</p>}
        </div>
      )}
    </div>
  );
}

export type { ResultEntry };
