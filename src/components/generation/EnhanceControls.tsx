import type { Clip, Track } from '../../types/project';
import type { Project } from '../../types/project';
import type { RepaintMode } from '../../types/api';
import { WaveformPreview } from './WaveformPreview';
import { WaveformRangeSelector } from './WaveformRangeSelector';
import { ENHANCE_PRESETS, surpriseMe } from '../../constants/enhancePresets';
import { useState } from 'react';

type ConsistencyLevel = 'low' | 'medium' | 'high';
type ABSide = 'A' | 'B';

function fmt(s: number) {
  const val = Number.isFinite(s) ? s : 0;
  return `${val.toFixed(2)}s`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface EnhanceControlsProps {
  mode: 'cover' | 'repaint';
  setMode: (m: 'cover' | 'repaint') => void;
  clip: Clip | null;
  track: Track | null;
  project: Project | null;
  hasAudio: boolean;
  chainedSourceAudioKey: string | null;
  canAB: boolean;
  abSide: ABSide;
  onABToggle: () => void;
  // Source waveform
  sourcePeaks: number[];
  sourceIsPlaying: boolean;
  sourceProgress: number;
  onSourcePlay: () => void;
  onSourceSeek: (progress: number) => void;
  // Cover fields
  caption: string;
  setCaption: (v: string) => void;
  lyrics: string;
  setLyrics: (v: string) => void;
  consistency: ConsistencyLevel;
  setConsistency: (v: ConsistencyLevel) => void;
  createNew: boolean;
  setCreateNew: (v: boolean) => void;
  // Repaint fields
  selStart: number;
  selEnd: number;
  onRangeChange: (s: number, e: number) => void;
  prompt: string;
  setPrompt: (v: string) => void;
  globalCaption: string;
  setGlobalCaption: (v: string) => void;
  repaintMode: RepaintMode;
  setRepaintMode: (v: RepaintMode) => void;
  repaintStrength: number;
  setRepaintStrength: (v: number) => void;
  // Generate
  canGenerate: boolean;
  isGenerating: boolean;
  isSubmitting: boolean;
  onGenerate: () => void;
  onClose: () => void;
  // Status messages
  inventoryLoaded: boolean;
  modelReady: boolean;
  modeSupported: boolean;
}

export function EnhanceControls(props: EnhanceControlsProps) {
  const {
    mode, setMode, clip, track, project, hasAudio,
    chainedSourceAudioKey, canAB, abSide, onABToggle,
    sourcePeaks, sourceIsPlaying, sourceProgress, onSourcePlay, onSourceSeek,
    caption, setCaption, lyrics, setLyrics, consistency, setConsistency, createNew, setCreateNew,
    selStart, selEnd, onRangeChange, prompt, setPrompt, globalCaption, setGlobalCaption,
    repaintMode, setRepaintMode, repaintStrength, setRepaintStrength,
    canGenerate, isGenerating, isSubmitting, onGenerate, onClose,
    inventoryLoaded, modelReady, modeSupported,
  } = props;

  const [quickStylesOpen, setQuickStylesOpen] = useState(false);

  const accentColor = mode === 'cover' ? '#14b8a6' : '#f43f5e';
  const accentBg = mode === 'cover' ? 'bg-teal-600' : 'bg-rose-600';
  const accentBgHover = mode === 'cover' ? 'hover:bg-teal-500' : 'hover:bg-rose-500';
  const clipStart = clip?.startTime ?? 0;

  return (
    <div data-testid="enhance-controls" className="flex-1 min-w-0 flex flex-col border-r border-[#3a3a3a]">
      {/* Header with mode toggle */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#3a3a3a]">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-white">Enhance</span>
          <div className="flex bg-[#161618] rounded-md p-0.5" data-testid="enhance-mode-toggle">
            <button
              data-testid="enhance-mode-cover"
              onClick={() => setMode('cover')}
              className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wide transition-colors ${
                mode === 'cover' ? 'bg-teal-700/60 text-teal-200' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >Cover</button>
            <button
              data-testid="enhance-mode-repaint"
              onClick={() => setMode('repaint')}
              className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wide transition-colors ${
                mode === 'repaint' ? 'bg-rose-700/60 text-rose-200' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >Repaint</button>
          </div>
        </div>
        <button data-testid="enhance-close-btn" onClick={onClose} className="text-zinc-400 hover:text-zinc-200 transition-colors text-base leading-none">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {/* Source audio preview */}
        <div className="bg-[#161618] rounded-lg px-3 py-3 border border-[#333]">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wide">
              Source
              {chainedSourceAudioKey && <span className="ml-1 text-teal-400 normal-case" data-testid="chained-source-indicator">(chained)</span>}
              {canAB && <span className={`ml-1.5 ${abSide === 'A' ? 'text-teal-400 font-bold' : 'text-zinc-600'}`}>A</span>}
            </p>
            {clip && <span className="text-[9px] text-zinc-600 font-mono">{formatDuration(clip.duration)}</span>}
          </div>
          {clip && track ? (
            <>
              <div className="flex items-center gap-2">
                <button
                  data-testid="source-play-btn"
                  onClick={onSourcePlay}
                  className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors flex-shrink-0 ${
                    sourceIsPlaying ? 'bg-teal-600 text-white' : 'bg-[#2a2a2e] text-zinc-400 hover:text-zinc-200'
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
                  <p className="text-[11px] font-medium text-zinc-200 truncate">{track.displayName ?? track.trackName}</p>
                  <p className="text-[10px] text-zinc-500 truncate">{clip.prompt || '(no prompt)'}</p>
                </div>
              </div>
              <div className="mt-2">
                <WaveformPreview peaks={sourcePeaks} color={accentColor} height={40} playbackProgress={sourceProgress} onSeek={hasAudio ? onSourceSeek : undefined} data-testid="source-waveform" />
              </div>
            </>
          ) : (
            <p className="text-[11px] text-zinc-500">No clip found</p>
          )}
          {clip && !hasAudio && <p className="text-[10px] text-amber-400 mt-2">No audio generated yet — generate the clip first before enhancing.</p>}
          {!inventoryLoaded && <p className="text-[10px] text-amber-400 mt-2">Connecting to server...</p>}
          {inventoryLoaded && !modelReady && <p className="text-[10px] text-amber-400 mt-2">No model loaded on server. Load a model in Settings before enhancing.</p>}
          {inventoryLoaded && modelReady && !modeSupported && <p className="text-[10px] text-amber-400 mt-2">The currently loaded model does not support {mode} generation.</p>}
        </div>

        {/* A/B Comparison Toggle */}
        {canAB && (
          <div className="flex items-center justify-center" data-testid="ab-toggle-section">
            <button
              data-testid="ab-toggle-btn"
              onClick={onABToggle}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[11px] font-semibold transition-colors border ${
                abSide === 'A' ? 'border-teal-500/50 bg-teal-900/30 text-teal-300' : 'border-violet-500/50 bg-violet-900/30 text-violet-300'
              }`}
            >
              <span className={abSide === 'A' ? 'text-teal-300' : 'text-zinc-500'}>A</span>
              <svg className="w-3.5 h-3.5 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 16l5-5-5-5M17 8l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span className={abSide === 'B' ? 'text-violet-300' : 'text-zinc-500'}>B</span>
            </button>
          </div>
        )}

        {/* COVER MODE CONTROLS */}
        {mode === 'cover' && (
          <>
            <div>
              <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wide mb-1">Lyrics</label>
              <textarea data-testid="enhance-lyrics-input" value={lyrics} onChange={(e) => setLyrics(e.target.value)} placeholder="Override lyrics for this enhancement..." rows={3} className="w-full bg-[#161618] border border-[#333] rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-teal-500/60 font-mono" />
            </div>

            <div>
              <button data-testid="quick-styles-toggle" onClick={() => setQuickStylesOpen((v) => !v)} className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-500 uppercase tracking-wide mb-1 hover:text-zinc-300 transition-colors">
                <svg className={`w-3 h-3 transition-transform ${quickStylesOpen ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Quick Styles
              </button>
              {quickStylesOpen && (
                <div data-testid="quick-styles-grid" className="flex flex-wrap gap-1.5 mb-2">
                  {ENHANCE_PRESETS.map((preset) => (
                    <button key={preset.id} data-testid={`preset-${preset.id}`} onClick={() => { setCaption(preset.caption); setConsistency(preset.consistency); }} className="px-2.5 py-1 rounded-full bg-[#2a2a2e] hover:bg-[#3a3a3e] text-[10px] text-zinc-300 transition-colors whitespace-nowrap border border-[#3a3a3a] hover:border-teal-500/40">
                      {preset.icon} {preset.label}
                    </button>
                  ))}
                  <button data-testid="preset-surprise-me" onClick={() => { const result = surpriseMe(); setCaption(result.caption); setConsistency(result.consistency); }} className="px-2.5 py-1 rounded-full bg-gradient-to-r from-purple-600/30 to-pink-600/30 hover:from-purple-600/50 hover:to-pink-600/50 text-[10px] text-zinc-200 transition-all whitespace-nowrap border border-purple-500/30 hover:border-purple-400/60 font-medium">
                    {'\u{1F3B2}'} Surprise Me
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wide mb-1">Styles</label>
              <textarea data-testid="enhance-styles-input" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="e.g. jazz arrangement, acoustic guitar, slow tempo..." rows={2} className="w-full bg-[#161618] border border-[#333] rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-teal-500/60" />
            </div>

            <div>
              <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wide mb-2">Consistency</label>
              <div className="flex gap-1" data-testid="enhance-consistency-toggle">
                {(['low', 'medium', 'high'] as ConsistencyLevel[]).map((level) => (
                  <button key={level} onClick={() => setConsistency(level)} className={`flex-1 py-1.5 rounded-md text-[11px] font-medium capitalize transition-colors ${consistency === level ? 'bg-teal-600 text-white' : 'bg-[#161618] text-zinc-500 hover:bg-[#2a2a2e] hover:text-zinc-300'}`}>{level}</button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={createNew} onChange={(e) => setCreateNew(e.target.checked)} className="w-3.5 h-3.5 rounded border-[#444] bg-[#222] accent-teal-500" />
                <span className="text-[10px] text-zinc-400">Create new clip (leave original intact)</span>
              </label>
            </div>
          </>
        )}

        {/* REPAINT MODE CONTROLS */}
        {mode === 'repaint' && clip && (
          <>
            <div className="bg-[#222]/60 rounded px-3 pt-2 pb-2 border border-[#3a3a3a]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-medium text-zinc-300">Repaint range</span>
                <span className="text-[10px] font-mono text-rose-300">{fmt(selStart)} — {fmt(selEnd)}</span>
              </div>
              <WaveformRangeSelector
                peaks={sourcePeaks}
                duration={clip.duration || 0}
                rangeStart={clip.duration > 0 ? (selStart - clipStart) / clip.duration : 0}
                rangeEnd={clip.duration > 0 ? (selEnd - clipStart) / clip.duration : 1}
                onRangeChange={(s, e) => onRangeChange(clipStart + s * clip.duration, clipStart + e * clip.duration)}
                bpm={project?.bpm}
                snapToGrid={true}
              />
              <div className="flex gap-4 mt-1">
                <span className="flex items-center gap-1 text-[8px] text-zinc-400"><span className="inline-block w-3 h-2 rounded-sm bg-black/55 border border-zinc-600/50" />Keep</span>
                <span className="flex items-center gap-1 text-[8px] text-rose-400"><span className="inline-block w-3 h-2 rounded-sm bg-rose-600/20 border border-rose-500/60" />Regenerate</span>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">Prompt for this section</label>
              <textarea data-testid="enhance-repaint-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe how this section should sound..." rows={3} className="w-full bg-[#222] border border-[#444] rounded px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-rose-500/60" />
            </div>

            <div>
              <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">Global song description<span className="ml-1 normal-case font-normal text-zinc-600">(optional)</span></label>
              <textarea data-testid="enhance-global-caption" value={globalCaption} onChange={(e) => setGlobalCaption(e.target.value)} placeholder="e.g. upbeat pop song..." rows={2} className="w-full bg-[#222] border border-[#444] rounded px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-rose-500/60" />
            </div>

            <div className="bg-[#222]/60 rounded px-3 py-2.5 border border-[#3a3a3a] space-y-2.5">
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">Repaint mode</label>
                <div className="flex gap-1" data-testid="enhance-repaint-mode-toggle">
                  {(['conservative', 'balanced', 'aggressive'] as const).map((rm) => (
                    <button key={rm} onClick={() => setRepaintMode(rm)} className={`flex-1 px-2 py-1.5 rounded text-[10px] font-medium transition-colors ${repaintMode === rm ? 'bg-rose-600/80 text-white border border-rose-500' : 'bg-[#333] text-zinc-400 border border-[#444] hover:bg-[#3a3a3a]'}`}>
                      {rm.charAt(0).toUpperCase() + rm.slice(1)}
                    </button>
                  ))}
                </div>
                <p className="text-[8px] text-zinc-600 mt-1">
                  {repaintMode === 'conservative' && 'Maximum source preservation — subtle changes only.'}
                  {repaintMode === 'balanced' && 'Tunable blend between source preservation and fresh generation.'}
                  {repaintMode === 'aggressive' && 'Pure diffusion — fully regenerates the region.'}
                </p>
              </div>
              {repaintMode === 'balanced' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-medium text-zinc-400">Repaint strength</label>
                    <span className="text-[10px] font-mono text-rose-300">{repaintStrength.toFixed(2)}</span>
                  </div>
                  <input type="range" min={0} max={1} step={0.01} value={repaintStrength} onChange={(e) => setRepaintStrength(Number(e.target.value))} className="w-full h-1.5 accent-rose-500 cursor-pointer" />
                  <div className="flex justify-between text-[8px] text-zinc-600 mt-0.5"><span>Preserve source</span><span>Fresh generation</span></div>
                </div>
              )}
            </div>

            {mode === 'repaint' && <p className="text-[10px] text-zinc-600">Only the selected range will be regenerated. Audio outside the repaint region is preserved.</p>}
          </>
        )}

        {/* Enhance button */}
        <button
          data-testid="enhance-btn"
          onClick={onGenerate}
          disabled={!canGenerate}
          className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-colors ${canGenerate ? `${accentBg} ${accentBgHover} text-white` : 'bg-[#2a2a2e] text-zinc-500 cursor-not-allowed'}`}
        >
          {isGenerating || isSubmitting ? (mode === 'cover' ? 'Enhancing...' : 'Repainting...') : (mode === 'cover' ? 'Enhance' : 'Repaint Selection')}
        </button>
      </div>
    </div>
  );
}
