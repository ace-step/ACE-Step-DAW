import { Z } from '../../utils/zIndex';
import { useEnhancePanelState } from '../../hooks/useEnhancePanelState';
import { EnhanceCoverControls } from './EnhanceCoverControls';
import { EnhanceRepaintControls } from './EnhanceRepaintControls';
import { EnhanceSourcePreview } from './EnhanceSourcePreview';
import { EnhanceHistorySidebar } from './EnhanceHistorySidebar';
import { ResultsPanel } from './ResultsPanel';

export function EnhancePanel() {
  const state = useEnhancePanelState();
  const {
    enhancerOpen, enhancerTarget, closeEnhancer, dynamicBottom, panelRef,
    clip, track, project, mode, setMode, isGenerating, isSubmitting,
    caption, setCaption, lyrics, setLyrics, consistency, setConsistency, createNew, setCreateNew,
    quickStylesOpen, setQuickStylesOpen,
    selStart, selEnd, prompt, setPrompt, globalCaption, setGlobalCaption,
    repaintMode, setRepaintMode, repaintStrength, setRepaintStrength,
    sessions, activeSessionId, setActiveSessionId,
    results, selectedResultId, setSelectedResultId, miniPlayerIdx, setMiniPlayerIdx,
    abSide, chainedSourceAudioKey,
    enhancementSession, versionTreeRoots, getNodeChildren,
    hasAudio, inventoryLoaded, modelReady, modeSupported, canGenerate, clipStart,
    accentColor, accentBg, accentBgHover, sourcePeaks, sourceIsPlaying, sourceProgress,
    canAB, miniResult, miniIsPlaying, miniProgress,
    playback,
    handleGenerate, handleSourcePlay, handleSourceSeek, handleResultPlay,
    handleABToggle, handleUseAsSource, handleNewSession, handleRangeChange,
    handleVersionTreeClick, handleVersionTreeOriginal,
    handleMiniPrev, handleMiniNext, handleMiniPlay, handleMiniSeek,
  } = state;

  if (!enhancerOpen) return null;

  // No-selection guidance screen
  if (!enhancerTarget) {
    return (
      <>
      <div data-testid="enhance-backdrop" role="presentation" className="fixed inset-0 bg-black/30" style={{ zIndex: Z.panel - 1 }} onClick={closeEnhancer} />
      <div
        ref={panelRef}
        data-testid="enhance-panel"
        role="dialog"
        aria-label="AI Enhancer"
        className="fixed left-1/2 -translate-x-1/2 w-[780px] max-w-[95vw] daw-glass-subtle rounded-xl daw-shadow-xl text-xs text-zinc-200 p-8 text-center transition-[bottom] duration-200 ease-out"
        style={{ zIndex: Z.panel, bottom: `${dynamicBottom}px` }}
      >
        <div className="flex items-center justify-between mb-6">
          <span className="text-sm font-semibold text-white">Enhance</span>
          <button
            data-testid="enhance-close-btn"
            onClick={closeEnhancer}
            className="text-zinc-400 hover:text-zinc-200 transition-colors text-base leading-none"
          >
            ✕
          </button>
        </div>
        <svg className="w-10 h-10 text-zinc-600 mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="4 2" />
          <path d="M8 12h8M12 8v8" strokeLinecap="round" />
        </svg>
        <p className="text-zinc-400 text-[13px] mb-1">First, create a selection on the canvas</p>
        <p className="text-zinc-600 text-[11px]">Use Cmd/Ctrl+drag on the timeline to select a region, or right-click a clip</p>
        <div className="mt-6">
          <button
            onClick={closeEnhancer}
            className="px-5 py-2 rounded-lg bg-[#2a2a2e] hover:bg-[#333338] text-zinc-300 text-[11px] font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
      </>
    );
  }

  return (
    <>
    <div data-testid="enhance-backdrop" role="presentation" className="fixed inset-0 bg-black/30" style={{ zIndex: Z.panel - 1 }} onClick={closeEnhancer} />
    <div
      ref={panelRef}
      data-testid="enhance-panel"
      role="dialog"
      aria-label="AI Enhancer"
      className="fixed left-1/2 -translate-x-1/2 w-[820px] max-w-[95vw] max-h-[60vh] daw-glass-subtle rounded-xl daw-shadow-xl flex text-xs text-zinc-200 overflow-hidden transition-[bottom] duration-200 ease-out"
      style={{ zIndex: Z.panel, bottom: `${dynamicBottom}px` }}
    >
      {/* Left Sidebar */}
      <EnhanceHistorySidebar
        enhancementSession={enhancementSession}
        versionTreeRoots={versionTreeRoots}
        getNodeChildren={getNodeChildren}
        onVersionTreeOriginal={handleVersionTreeOriginal}
        onVersionTreeClick={handleVersionTreeClick}
        onNewSession={handleNewSession}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
      />

      {/* Center Panel — Controls */}
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
                  mode === 'cover'
                    ? 'bg-teal-700/60 text-teal-200'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Cover
              </button>
              <button
                data-testid="enhance-mode-repaint"
                onClick={() => setMode('repaint')}
                className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wide transition-colors ${
                  mode === 'repaint'
                    ? 'bg-rose-700/60 text-rose-200'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Repaint
              </button>
            </div>
          </div>
          <button
            data-testid="enhance-close-btn"
            onClick={closeEnhancer}
            className="text-zinc-400 hover:text-zinc-200 transition-colors text-base leading-none"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          {/* Source audio preview + A/B toggle */}
          <EnhanceSourcePreview
            clipPrompt={clip?.prompt}
            clipDuration={clip?.duration ?? 0}
            trackDisplayName={track?.displayName ?? track?.trackName ?? ''}
            hasClipAndTrack={!!(clip && track)}
            hasAudio={hasAudio}
            chainedSourceAudioKey={chainedSourceAudioKey}
            canAB={canAB}
            abSide={abSide}
            sourceIsPlaying={sourceIsPlaying}
            sourceProgress={sourceProgress}
            sourcePeaks={sourcePeaks}
            accentColor={accentColor}
            inventoryLoaded={inventoryLoaded}
            modelReady={modelReady}
            modeSupported={modeSupported}
            mode={mode}
            onSourcePlay={handleSourcePlay}
            onSourceSeek={handleSourceSeek}
            handleABToggle={handleABToggle}
          />

          {/* Cover mode controls */}
          {mode === 'cover' && (
            <EnhanceCoverControls
              lyrics={lyrics}
              onLyricsChange={setLyrics}
              caption={caption}
              onCaptionChange={setCaption}
              consistency={consistency}
              onConsistencyChange={setConsistency}
              createNew={createNew}
              onCreateNewChange={setCreateNew}
              quickStylesOpen={quickStylesOpen}
              onQuickStylesToggle={() => setQuickStylesOpen((v) => !v)}
            />
          )}

          {/* Repaint mode controls */}
          {mode === 'repaint' && clip && (
            <EnhanceRepaintControls
              sourcePeaks={sourcePeaks}
              clipDuration={clip.duration}
              clipStart={clipStart}
              selStart={selStart}
              selEnd={selEnd}
              onRangeChange={handleRangeChange}
              prompt={prompt}
              onPromptChange={setPrompt}
              globalCaption={globalCaption}
              onGlobalCaptionChange={setGlobalCaption}
              repaintMode={repaintMode}
              onRepaintModeChange={setRepaintMode}
              repaintStrength={repaintStrength}
              onRepaintStrengthChange={setRepaintStrength}
              bpm={project?.bpm}
            />
          )}

          {/* Enhance button */}
          <button
            data-testid="enhance-btn"
            onClick={handleGenerate}
            disabled={!canGenerate}
            className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              canGenerate
                ? `${accentBg} ${accentBgHover} text-white`
                : 'bg-[#2a2a2e] text-zinc-500 cursor-not-allowed'
            }`}
          >
            {isGenerating || isSubmitting
              ? (mode === 'cover' ? 'Enhancing...' : 'Repainting...')
              : (mode === 'cover' ? 'Enhance' : 'Repaint Selection')
            }
          </button>
        </div>
      </div>

      {/* Right Panel — Results */}
      <ResultsPanel
        results={results}
        selectedResultId={selectedResultId}
        onSelectResult={(id, idx) => { setSelectedResultId(id); setMiniPlayerIdx(idx); }}
        onResultPlay={handleResultPlay}
        onUseAsSource={handleUseAsSource}
        playingId={playback.playingId}
        playbackProgress={playback.progress}
        canAB={canAB}
        abSide={abSide}
        miniResult={miniResult}
        miniPlayerIdx={miniPlayerIdx}
        miniIsPlaying={miniIsPlaying}
        miniProgress={miniProgress}
        onMiniPrev={handleMiniPrev}
        onMiniNext={handleMiniNext}
        onMiniPlay={handleMiniPlay}
        onMiniSeek={handleMiniSeek}
      />
    </div>
    </>
  );
}
