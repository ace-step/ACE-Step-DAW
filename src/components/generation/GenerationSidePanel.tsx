import { useCallback, useEffect, useRef, useState } from 'react';
import { useUIStore, getBottomPanelHeight } from '../../store/uiStore';
import { Z } from '../../utils/zIndex';
import { useGenerationStore } from '../../store/generationStore';
import { useProjectStore } from '../../store/projectStore';
import { MultiTrackGenerateSection } from './MultiTrackGenerateSection';
import { GenerationSettingsSection } from './GenerationSettingsSection';
import { FullSongForm } from './FullSongForm';
import { SimpleModeForm } from './SimpleModeForm';
import { Button } from '../ui/Button';

export type MixSubMode = 'simple' | 'custom';

export function GenerationSidePanel() {
  const mainView = useUIStore((s) => s.mainView);
  const show = useUIStore((s) => s.showGenerationPanel);
  const setShow = useUIStore((s) => s.setShowGenerationPanel);
  const openGenerationPanelView = useUIStore((s) => s.openGenerationPanelView);
  const generationPanelView = useUIStore((s) => s.generationPanelView);
  const loopBrowserOpen = useUIStore((s) => s.loopBrowserOpen);
  const toggleLoopBrowser = useUIStore((s) => s.toggleLoopBrowser);
  const showMixer = useUIStore((s) => s.showMixer);
  const setShowMixer = useUIStore((s) => s.setShowMixer);
  const showAIAssistant = useUIStore((s) => s.showAIAssistant);
  const toggleAIAssistant = useUIStore((s) => s.toggleAIAssistant);
  const setGenerationPanelView = useUIStore((s) => s.setGenerationPanelView);
  const batchGenerateMode = useUIStore((s) => s.batchGenerateMode);
  const setBatchGenerateMode = useUIStore((s) => s.setBatchGenerateMode);
  const showSmartControls = useUIStore((s) => s.showSmartControls);
  const activeBottomPanel = useUIStore((s) => s.activeBottomPanel);
  const showSettingsDialog = useUIStore((s) => s.showSettingsDialog);
  const trackListWidth = useUIStore((s) => s.trackListWidth);
  const bottomPanelHeight = useUIStore(getBottomPanelHeight);
  const project = useProjectStore((s) => s.project);

  const [renderPanel, setRenderPanel] = useState(show);
  const [mixSubMode, setMixSubMode] = useState<MixSubMode>('simple');

  // Unified footer state — updated by active form child
  interface FooterState {
    label: string;
    disabled: boolean;
    action: () => void;
    thinkingState?: { checked: boolean; onChange: (v: boolean) => void; disabled: boolean };
  }
  const [footerState, setFooterState] = useState<FooterState>({
    label: 'Create Sample', disabled: true, action: () => {},
  });
  const footerActionRef = useRef<() => void>(() => {});
  const thinkingRef = useRef<FooterState['thinkingState']>(undefined);
  const handleFooterChange = useCallback((state: FooterState) => {
    footerActionRef.current = state.action;
    thinkingRef.current = state.thinkingState;
    setFooterState((prev) => {
      if (prev.label === state.label && prev.disabled === state.disabled && prev.thinkingState?.checked === state.thinkingState?.checked) return prev;
      return state;
    });
  }, []);

  // Callback for Simple mode: when Create Sample succeeds, switch to Custom with pre-filled data
  const handleSampleCreated = useCallback((data: {
    caption: string;
    lyrics: string;
    bpm: number | null;
    keyScale: string;
    duration: number;
    timeSignature: string;
    vocalLanguage: string;
  }) => {
    setMixSubMode('custom');
    // FullSongForm will pick up these values via props
    setSampleData(data);
  }, []);

  const [sampleData, setSampleData] = useState<{
    caption: string;
    lyrics: string;
    bpm: number | null;
    keyScale: string;
    duration: number;
    timeSignature: string;
    vocalLanguage: string;
  } | null>(null);

  const openMultiTrackView = useCallback(() => {
    if (batchGenerateMode) {
      setGenerationPanelView('multiTrack');
      return;
    }
    setBatchGenerateMode('silence');
  }, [batchGenerateMode, setBatchGenerateMode, setGenerationPanelView]);

  useEffect(() => {
    if (show) {
      setRenderPanel(true);
      return undefined;
    }
    const timeout = window.setTimeout(() => setRenderPanel(false), 260);
    return () => window.clearTimeout(timeout);
  }, [show]);

  const workspaceLeftInset = mainView === 'arrangement' && Number.isFinite(trackListWidth)
    ? trackListWidth
    : 0;
  const dockLeft = workspaceLeftInset > 0
    ? `calc(50% + ${workspaceLeftInset / 2}px)`
    : '50%';

  if (!project) return null;

  return (
    <>
      <div
        className="fixed -translate-x-1/2 transition-all duration-300 ease-in-out"
        style={{
          left: dockLeft,
          zIndex: Z.toast,
          bottom: showSmartControls ? 208 : 68,
          opacity: activeBottomPanel || showMixer || showSettingsDialog ? 0 : 1,
          pointerEvents: activeBottomPanel || showMixer || showSettingsDialog ? 'none' : 'auto',
          transform: `translateX(-50%) translateY(${activeBottomPanel || showMixer || showSettingsDialog ? '16px' : '0px'})`,
        }}
        data-testid="generation-dock"
      >
        <div className="flex items-center gap-2">
          {/* Left group: Library + Mixer */}
          <div className="flex items-center gap-1 rounded-[12px] px-1.5 py-1.5" style={{ backgroundColor: 'rgb(35, 38, 43)', border: '1px solid rgb(56, 63, 76)', boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
            <button
              type="button"
              onClick={toggleLoopBrowser}
              className={`group relative flex h-10 w-10 items-center justify-center rounded-[10px] transition-all duration-200 ${
                loopBrowserOpen
                  ? 'bg-white/10 text-white'
                  : 'text-white/70 hover:bg-white/[0.06] hover:text-white'
              }`}
              aria-label={loopBrowserOpen ? 'Hide Creative Library' : 'Open Creative Library'}
              title={loopBrowserOpen ? 'Hide Creative Library' : 'Open Creative Library'}
              data-testid="generation-dock-app-library"
            >
              <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#232629]/96 px-2 py-0.5 text-[10px] text-zinc-300 opacity-0 shadow-lg transition-all duration-150 group-hover:-translate-y-0.5 group-hover:opacity-100">
                Library
              </span>
              <svg width="22" height="22" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="9" cy="9" r="5.25" />
                <path d="M3.75 9h10.5" />
                <path d="M9 3.75c1.85 1.32 2.85 3.08 2.85 5.25 0 2.16-1 3.93-2.85 5.25-1.85-1.32-2.85-3.09-2.85-5.25 0-2.17 1-3.93 2.85-5.25Z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setShowMixer(!showMixer)}
              className={`group relative flex h-10 w-10 items-center justify-center rounded-[10px] transition-all duration-200 ${
                showMixer
                  ? 'bg-white/10 text-white'
                  : 'text-white/70 hover:bg-white/[0.06] hover:text-white'
              }`}
              aria-label={showMixer ? 'Hide Mixer' : 'Show Mixer'}
              title={showMixer ? 'Hide Mixer (X)' : 'Show Mixer (X)'}
              data-testid="dock-mixer-toggle"
              data-onboarding-target="mixer-button"
            >
              <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#232629]/96 px-2 py-0.5 text-[10px] text-zinc-300 opacity-0 shadow-lg transition-all duration-150 group-hover:-translate-y-0.5 group-hover:opacity-100">
                Mixer
              </span>
              <svg width="22" height="22" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
                <line x1="4.5" y1="3" x2="4.5" y2="15" />
                <line x1="9" y1="3" x2="9" y2="15" />
                <line x1="13.5" y1="3" x2="13.5" y2="15" />
                <circle cx="4.5" cy="10" r="1.8" fill="currentColor" />
                <circle cx="9" cy="6.5" r="1.8" fill="currentColor" />
                <circle cx="13.5" cy="11.5" r="1.8" fill="currentColor" />
              </svg>
            </button>
          </div>

          {/* Right group: Inspire Me + Chat + Settings */}
          <div className="flex items-center gap-1 rounded-[12px] px-1.5 py-1.5" style={{ backgroundColor: 'rgb(35, 38, 43)', border: '1px solid rgb(56, 63, 76)', boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
            <button
              type="button"
              onClick={() => {
                if (show) {
                  setShow(false);
                  return;
                }
                openGenerationPanelView(generationPanelView);
              }}
              className={`group relative flex h-10 w-10 items-center justify-center rounded-[10px] transition-all duration-200 ${
                show
                  ? 'bg-white/10 text-white'
                  : 'text-white/70 hover:bg-white/[0.06] hover:text-white'
              }`}
              aria-label={show ? 'Hide Generate panel' : 'Open Generate panel'}
              title={show ? 'Hide Inspire Me panel' : 'Open Inspire Me panel'}
              data-testid="generation-dock-app-generate"
            >
              <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#232629]/96 px-2 py-0.5 text-[10px] text-zinc-300 opacity-0 shadow-lg transition-all duration-150 group-hover:-translate-y-0.5 group-hover:opacity-100">
                Inspire Me
              </span>
              <svg width="22" height="22" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 3.1a3.55 3.55 0 0 1 2.12 6.4c-.61.46-1.02 1.12-1.16 1.82H8.04c-.14-.7-.55-1.36-1.16-1.82A3.55 3.55 0 0 1 9 3.1Z" />
                <path d="M7.35 12.5h3.3M7.75 14.15h2.5" />
                <path d="M9.3 6 8.35 7.9h1.05L8.7 9.55" />
              </svg>
            </button>
            <button
              type="button"
              onClick={toggleAIAssistant}
              className={`group relative flex h-10 w-10 items-center justify-center rounded-[10px] transition-all duration-200 ${
                showAIAssistant
                  ? 'bg-white/10 text-white'
                  : 'text-white/70 hover:bg-white/[0.06] hover:text-white'
              }`}
              aria-label={showAIAssistant ? 'Hide Chat' : 'Show Chat'}
              title={showAIAssistant ? 'Hide Chat (Cmd+/)' : 'Show Chat (Cmd+/)'}
              data-testid="dock-ai-assistant-toggle"
              data-onboarding-target="assistant-button"
            >
              <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#232629]/96 px-2 py-0.5 text-[10px] text-zinc-300 opacity-0 shadow-lg transition-all duration-150 group-hover:-translate-y-0.5 group-hover:opacity-100">
                Chat
              </span>
              <svg width="22" height="22" viewBox="50 50 412 412" fill="currentColor" aria-hidden="true">
                <path d="M142.27 316.619l73.655-41.326 1.238-3.589-1.238-1.996-3.589-.001-12.31-.759-42.084-1.138-36.498-1.516-35.361-1.896-8.897-1.895-8.34-10.995.859-5.484 7.482-5.03 10.717.935 23.683 1.617 35.537 2.452 25.782 1.517 38.193 3.968h6.064l.86-2.451-2.073-1.517-1.618-1.517-36.776-24.922-39.81-26.338-20.852-15.166-11.273-7.683-5.687-7.204-2.451-15.721 10.237-11.273 13.75.935 3.513.936 13.928 10.716 29.749 23.027 38.848 28.612 5.687 4.727 2.275-1.617.278-1.138-2.553-4.271-21.13-38.193-22.546-38.848-10.035-16.101-2.654-9.655c-.935-3.968-1.617-7.304-1.617-11.374l11.652-15.823 6.445-2.073 15.545 2.073 6.547 5.687 9.655 22.092 15.646 34.78 24.265 47.291 7.103 14.028 3.791 12.992 1.416 3.968 2.449-.001v-2.275l1.997-26.641 3.69-32.707 3.589-42.084 1.239-11.854 5.863-14.206 11.652-7.683 9.099 4.348 7.482 10.716-1.036 6.926-4.449 28.915-8.72 45.294-5.687 30.331h3.313l3.792-3.791 15.342-20.372 25.782-32.227 11.374-12.789 13.27-14.129 8.517-6.724 16.1-.001 11.854 17.617-5.307 18.199-16.581 21.029-13.75 17.819-19.716 26.54-12.309 21.231 1.138 1.694 2.932-.278 44.536-9.479 24.062-4.347 28.714-4.928 12.992 6.066 1.416 6.167-5.106 12.613-30.71 7.583-36.018 7.204-53.636 12.689-.657.48.758.935 24.164 2.275 10.337.556h25.301l47.114 3.514 12.309 8.139 7.381 9.959-1.238 7.583-18.957 9.655-25.579-6.066-59.702-14.205-20.474-5.106-2.83-.001v1.694l17.061 16.682 31.266 28.233 39.152 36.397 1.997 8.999-5.03 7.102-5.307-.758-34.401-25.883-13.27-11.651-30.053-25.302-1.996-.001v2.654l6.926 10.136 36.574 54.975 1.895 16.859-2.653 5.485-9.479 3.311-10.414-1.895-21.408-30.054-22.092-33.844-17.819-30.331-2.173 1.238-10.515 113.261-4.929 5.788-11.374 4.348-9.478-7.204-5.03-11.652 5.03-23.027 6.066-30.052 4.928-23.886 4.449-29.674 2.654-9.858-.177-.657-2.173.278-22.37 30.71-34.021 45.977-26.919 28.815-6.445 2.553-11.173-5.789 1.037-10.337 6.243-9.2 37.257-47.392 22.47-29.371 14.508-16.961-.101-2.451h-.859l-98.954 64.251-17.618 2.275-7.583-7.103.936-11.652 3.589-3.791 29.749-20.474z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => useUIStore.getState().setShowSettingsDialog(true)}
              className="group relative flex h-10 w-10 items-center justify-center rounded-[10px] text-white/70 transition-all duration-200 hover:bg-white/[0.06] hover:text-white"
              aria-label="Settings"
              title="Settings"
              data-testid="dock-settings-toggle"
            >
              <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#232629]/96 px-2 py-0.5 text-[10px] text-zinc-300 opacity-0 shadow-lg transition-all duration-150 group-hover:-translate-y-0.5 group-hover:opacity-100">
                Settings
              </span>
              <svg width="22" height="22" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="9" cy="9" r="2.5" />
                <path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M14.3 3.7l-1.4 1.4M5.1 12.9l-1.4 1.4" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {renderPanel && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 flex w-[min(560px,calc(100vw-32px))] flex-col bg-[#1e1e22] border border-[#3a3a3a] rounded-xl shadow-2xl text-xs text-zinc-200 overflow-hidden transition-all duration-300 ease-out ${
            show ? 'opacity-100 scale-100' : 'pointer-events-none opacity-0 scale-95'
          }`}
          style={{
            zIndex: Z.toast + 1,
            bottom: `${(showSmartControls ? 224 : 140) + bottomPanelHeight}px`,
            height: `calc(100vh - ${(showSmartControls ? 224 : 140) + bottomPanelHeight + 48}px)`,
            maxHeight: '580px',
          }}
          data-testid="generation-side-panel"
          aria-label="Generate panel"
          aria-hidden={!show}
        >
          {/* Header: Title + Tabs + Close */}
          <div className="flex items-center justify-between border-b border-[#3a3a3a] px-5 py-3">
            <h2 className="text-sm font-semibold text-zinc-100">Generate</h2>
            <div className="flex items-center gap-2">
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-[#3a3a3a] bg-[#161618] p-0.5" data-testid="generation-panel-tabs">
                <button
                  type="button"
                  onClick={() => setGenerationPanelView('textToMusic')}
                  className={`rounded-md px-3 py-1 text-[11px] font-medium transition-colors ${
                    generationPanelView === 'textToMusic'
                      ? 'bg-indigo-600 text-white'
                      : 'text-zinc-400 hover:bg-[#2a2a2a] hover:text-zinc-200'
                  }`}
                  data-testid="generation-panel-tab-text-to-music"
                  aria-pressed={generationPanelView === 'textToMusic'}
                >
                  Mix
                </button>
                <button
                  type="button"
                  onClick={openMultiTrackView}
                  className={`rounded-md px-3 py-1 text-[11px] font-medium transition-colors ${
                    generationPanelView === 'multiTrack'
                      ? 'bg-indigo-600 text-white'
                      : 'text-zinc-400 hover:bg-[#2a2a2a] hover:text-zinc-200'
                  }`}
                  data-testid="generation-panel-tab-multi-track"
                  aria-pressed={generationPanelView === 'multiTrack'}
                >
                  Stems
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShow(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-[#2a2a2e] hover:text-zinc-200"
                aria-label="Close generation panel"
                data-testid="generation-panel-collapse"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>
          </div>

          {/* Body */}
          {generationPanelView === 'multiTrack' ? (
            <MultiTrackGenerateSection
              mode={batchGenerateMode ?? 'silence'}
              onModeChange={setBatchGenerateMode}
              onFooterChange={handleFooterChange}
            />
          ) : generationPanelView === 'settings' ? (
            <GenerationSettingsSection active={generationPanelView === 'settings'} />
          ) : (
            <>
              {/* Sub-mode tabs: Simple | Custom */}
              <div className="border-b border-[#3a3a3a] px-4 py-2">
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#161618] p-0.5">
                  <button
                    type="button"
                    onClick={() => setMixSubMode('simple')}
                    className={`rounded-md py-1.5 text-[11px] font-medium transition-colors ${
                      mixSubMode === 'simple'
                        ? 'bg-[#2a2a2e] text-zinc-100'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                    data-testid="mix-submode-simple"
                  >
                    Simple
                  </button>
                  <button
                    type="button"
                    onClick={() => setMixSubMode('custom')}
                    className={`rounded-md py-1.5 text-[11px] font-medium transition-colors ${
                      mixSubMode === 'custom'
                        ? 'bg-[#2a2a2e] text-zinc-100'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                    data-testid="mix-submode-custom"
                  >
                    Custom
                  </button>
                </div>
              </div>

              {/* Form content (scrollable body, no footer) */}
              {mixSubMode === 'simple' ? (
                <SimpleModeForm onSampleCreated={handleSampleCreated} onFooterChange={handleFooterChange} />
              ) : (
                <FullSongForm initialData={sampleData} onFooterChange={handleFooterChange} />
              )}
            </>
          )}

          {/* Unified footer — always at bottom, same position for all views */}
          {generationPanelView !== 'settings' && (
            <div className="border-t border-[#3a3a3a] px-4 py-3 flex-shrink-0" data-testid="generation-dialog-footer">
              <div className="flex items-center gap-3">
                {footerState.thinkingState && (
                  <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={footerState.thinkingState.checked}
                      onChange={(e) => thinkingRef.current?.onChange(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-[#444] bg-[#2a2a2a] accent-indigo-500"
                      disabled={footerState.thinkingState.disabled}
                    />
                    <span className="text-[10px] text-zinc-400">Thinking</span>
                  </label>
                )}
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => footerActionRef.current()}
                  disabled={footerState.disabled}
                  className="flex-1"
                  data-testid="generation-footer-btn"
                >
                  {footerState.label}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
