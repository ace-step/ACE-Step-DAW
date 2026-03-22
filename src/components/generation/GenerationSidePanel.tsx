import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { Z } from '../../utils/zIndex';
import {
  getGenerationValidationError,
  useGenerationStore,
  type VariationStatus,
} from '../../store/generationStore';
import { useProjectStore } from '../../store/projectStore';
import { useModelStore } from '../../store/modelStore';
import { KEY_SCALES } from '../../constants/tracks';
import { MAX_BPM, MAX_DURATION, MIN_BPM, MIN_DURATION } from '../../constants/defaults';
import { GENERATION_PRESETS, PRESET_CATEGORIES } from '../../constants/generationPresets';
import type { PresetCategory } from '../../constants/generationPresets';
import { generateVariationSession } from '../../services/generationPipeline';
import { PromptAutocompleteTextarea } from './PromptAutocompleteTextarea';
import { computeEta, formatEtaDisplay } from '../../utils/generationProgress';
import { MultiTrackGenerateSection } from './MultiTrackGenerateSection';
import { GenerationHistorySection } from './GenerationHistorySection';
import { GenerationSettingsSection } from './GenerationSettingsSection';

const VARIATION_STATUS_LABELS: Record<VariationStatus, string> = {
  pending: 'Waiting',
  generating: 'Generating',
  processing: 'Processing',
  done: 'Ready',
  error: 'Error',
  cancelled: 'Cancelled',
};

const VARIATION_STATUS_COLORS: Record<VariationStatus, string> = {
  pending: 'bg-zinc-700 text-zinc-400',
  generating: 'bg-indigo-900/60 text-indigo-300',
  processing: 'bg-amber-900/60 text-amber-300',
  done: 'bg-emerald-900/60 text-emerald-300',
  error: 'bg-red-900/60 text-red-300',
  cancelled: 'bg-zinc-800 text-zinc-400',
};

export function GenerationSidePanel() {
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
  const selectClip = useUIStore((s) => s.selectClip);
  const project = useProjectStore((s) => s.project);

  const generationForm = useGenerationStore((s) => s.generationForm);
  const isGenerating = useGenerationStore((s) => s.isGenerating);
  const variationSession = useGenerationStore((s) => s.variationSession);
  const jobs = useGenerationStore((s) => s.jobs);
  const promptHistory = useGenerationStore((s) => s.promptHistory);
  const setGenerationPrompt = useGenerationStore((s) => s.setGenerationPrompt);
  const setGenerationStyleTags = useGenerationStore((s) => s.setGenerationStyleTags);
  const toggleGenerationStyleTag = useGenerationStore((s) => s.toggleGenerationStyleTag);
  const setGenerationBpm = useGenerationStore((s) => s.setGenerationBpm);
  const setGenerationKeyScale = useGenerationStore((s) => s.setGenerationKeyScale);
  const setGenerationLengthSeconds = useGenerationStore((s) => s.setGenerationLengthSeconds);
  const setGenerationTemperature = useGenerationStore((s) => s.setGenerationTemperature);
  const setGenerationVariationCount = useGenerationStore((s) => s.setGenerationVariationCount);
  const setGenerationTargetTrack = useGenerationStore((s) => s.setGenerationTargetTrack);
  const setGenerationLyrics = useGenerationStore((s) => s.setGenerationLyrics);
  const applyGenerationPreset = useGenerationStore((s) => s.applyGenerationPreset);
  const getPromptAutocompleteSuggestions = useGenerationStore((s) => s.getPromptAutocompleteSuggestions);
  const applyPromptAutocompleteSuggestion = useGenerationStore((s) => s.applyPromptAutocompleteSuggestion);
  const submitGenerationRequest = useGenerationStore((s) => s.submitGenerationRequest);
  const setActiveVariation = useGenerationStore((s) => s.setActiveVariation);
  const cancelVariationSession = useGenerationStore((s) => s.cancelVariationSession);
  const clearVariationSession = useGenerationStore((s) => s.clearVariationSession);

  const setGenerationInferenceSteps = useGenerationStore((s) => s.setGenerationInferenceSteps);
  const setGenerationGuidanceScale = useGenerationStore((s) => s.setGenerationGuidanceScale);
  const setGenerationShift = useGenerationStore((s) => s.setGenerationShift);
  const setGenerationThinking = useGenerationStore((s) => s.setGenerationThinking);
  const setGenerationSeed = useGenerationStore((s) => s.setGenerationSeed);
  const setGenerationUseRandomSeed = useGenerationStore((s) => s.setGenerationUseRandomSeed);
  const setCompareModelsEnabled = useGenerationStore((s) => s.setCompareModelsEnabled);
  const setCompareModelOverrides = useGenerationStore((s) => s.setCompareModelOverrides);

  const availableModels = useModelStore((s) => s.availableModels);

  const [showPromptHistory, setShowPromptHistory] = useState(false);
  const [presetCategory, setPresetCategory] = useState<PresetCategory | 'All'>('All');
  const [showLyrics, setShowLyrics] = useState(false);
  const [styleTagsInput, setStyleTagsInput] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [renderPanel, setRenderPanel] = useState(show);

  const stemsTracks = useMemo(
    () => project?.tracks.filter((track) => track.trackType === 'stems') ?? [],
    [project?.tracks],
  );
  const projectBpm = project?.bpm;
  const projectKeyScale = project?.keyScale;
  const projectGuidanceScale = project?.generationDefaults.guidanceScale;

  useEffect(() => {
    const selectedTrackStillExists = stemsTracks.some((track) => track.id === generationForm.selectedTrackId);
    if (!selectedTrackStillExists) {
      setGenerationTargetTrack(stemsTracks[0]?.id ?? '');
    }
  }, [generationForm.selectedTrackId, setGenerationTargetTrack, stemsTracks]);

  useEffect(() => {
    if (generationForm.lyrics.trim()) setShowLyrics(true);
  }, [generationForm.lyrics]);

  useEffect(() => {
    setStyleTagsInput(generationForm.styleTags.join(', '));
  }, [generationForm.styleTags]);

  useEffect(() => {
    if (projectBpm === undefined || !projectKeyScale || projectGuidanceScale === undefined) return;

    const isPristine =
      generationForm.prompt.trim() === ''
      && generationForm.styleTags.length === 0
      && generationForm.bpm === 120
      && generationForm.keyScale === 'C major';

    if (isPristine) {
      useGenerationStore.getState().hydrateGenerationForm({
        bpm: projectBpm,
        keyScale: projectKeyScale,
        temperature: projectGuidanceScale,
      });
    }
  }, [
    generationForm.bpm,
    generationForm.keyScale,
    generationForm.prompt,
    generationForm.styleTags.length,
    projectBpm,
    projectGuidanceScale,
    projectKeyScale,
  ]);
  const filteredPresets = presetCategory === 'All'
    ? GENERATION_PRESETS
    : GENERATION_PRESETS.filter((preset) => preset.category === presetCategory);

  const validationError = useMemo(() => getGenerationValidationError({
    prompt: generationForm.prompt,
    selectedTrackId: generationForm.selectedTrackId,
    bpm: generationForm.bpm,
    lengthSeconds: generationForm.lengthSeconds,
    temperature: generationForm.temperature,
    variationCount: generationForm.variationCount,
  }), [generationForm]);

  const variationError = useMemo(
    () => variationSession?.variations.find((variation) => variation.error)?.error ?? null,
    [variationSession],
  );

  const statusMessage = generationForm.requestError
    ?? variationError
    ?? jobs.find((job) => job.status === 'error')?.actionableMessage
    ?? validationError;
  const isSessionActive = isGenerating || variationSession?.status === 'generating';

  const handleGenerate = useCallback(() => {
    const params = submitGenerationRequest({ globalCaption: project?.globalCaption });
    if (!params) return;
    void generateVariationSession(params);
  }, [project?.globalCaption, submitGenerationRequest]);

  const handleHistorySelect = useCallback((historyPrompt: string) => {
    setGenerationPrompt(historyPrompt);
    setShowPromptHistory(false);
  }, [setGenerationPrompt]);

  const commitStyleTagsInput = useCallback(() => {
    const nextTags = styleTagsInput
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    setGenerationStyleTags(nextTags);
  }, [setGenerationStyleTags, styleTagsInput]);

  const panelCopy = useMemo(() => {
    switch (generationPanelView) {
      case 'multiTrack':
        return {
          title: 'Generate',
          description: 'Generate several tracks together with shared context, prompts, and seed control.',
        };
      case 'history':
        return {
          title: 'Generate',
          description: 'Browse, preview, and reuse earlier AI generations from one place.',
        };
      case 'settings':
        return {
          title: 'Generate',
          description: 'Tune models, backend, and generation defaults without leaving the generation workflow.',
        };
      default:
        return {
          title: 'Generate',
          description: 'Create a full-song text-to-music idea without leaving the arrangement.',
        };
    }
  }, [generationPanelView]);

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

  if (!project) return null;

  return (
    <>
      <div
        className="fixed bottom-[68px] left-1/2 z-[120] -translate-x-1/2"
        style={{ zIndex: Z.panel + 1 }}
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
        <aside
          className={`fixed right-0 top-10 bottom-6 flex w-88 flex-col border-l border-[#333] bg-[#1e1e1e] shadow-2xl transition-all duration-300 ease-out ${
            show ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-[calc(100%+28px)] opacity-0'
          }`}
          style={{ zIndex: Z.panel }}
          data-testid="generation-side-panel"
          aria-label="Generate panel"
          aria-hidden={!show}
        >
          <div className="flex items-start justify-between border-b border-[#333] px-5 py-2">
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">{panelCopy.title}</h2>
              <p className="text-[11px] text-zinc-400">{panelCopy.description}</p>
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShow(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#404040] bg-[#262626] text-zinc-400 transition-colors hover:border-[#555] hover:text-zinc-200"
                aria-label="Collapse generation panel"
                title="Collapse Generate panel"
                data-testid="generation-panel-collapse"
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 3.5L10 8L5 12.5" />
                </svg>
              </button>
            </div>
          </div>

          <div className="border-b border-[#333] px-3 py-2">
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-[#3a3a3a] bg-[#202020] p-1" data-testid="generation-panel-tabs">
          <button
            type="button"
            onClick={() => setGenerationPanelView('textToMusic')}
            className={`rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${
              generationPanelView === 'textToMusic'
                ? 'bg-indigo-600 text-white'
                : 'text-zinc-400 hover:bg-[#2a2a2a] hover:text-zinc-200'
            }`}
            data-testid="generation-panel-tab-text-to-music"
            aria-pressed={generationPanelView === 'textToMusic'}
          >
            Full Song
          </button>
          <button
            type="button"
            onClick={openMultiTrackView}
            className={`rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${
              generationPanelView === 'multiTrack'
                ? 'bg-indigo-600 text-white'
                : 'text-zinc-400 hover:bg-[#2a2a2a] hover:text-zinc-200'
            }`}
            data-testid="generation-panel-tab-multi-track"
            aria-pressed={generationPanelView === 'multiTrack'}
          >
            Multi-Track
          </button>
          <button
            type="button"
            onClick={() => setGenerationPanelView('history')}
            className={`rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${
              generationPanelView === 'history'
                ? 'bg-indigo-600 text-white'
                : 'text-zinc-400 hover:bg-[#2a2a2a] hover:text-zinc-200'
            }`}
            data-testid="generation-panel-tab-history"
            aria-pressed={generationPanelView === 'history'}
          >
            History
          </button>
        </div>
      </div>

      {generationPanelView === 'multiTrack' ? (
        <MultiTrackGenerateSection
          mode={batchGenerateMode ?? 'silence'}
          onModeChange={setBatchGenerateMode}
        />
      ) : generationPanelView === 'history' ? (
        <GenerationHistorySection />
      ) : generationPanelView === 'settings' ? (
        <GenerationSettingsSection active={generationPanelView === 'settings'} />
      ) : (
        <div className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
          {statusMessage && (
          <div
            className={`rounded-md border px-3 py-2 text-xs ${
              generationForm.requestError || variationError
                ? 'border-red-500/40 bg-red-950/30 text-red-200'
                : 'border-amber-500/30 bg-amber-950/30 text-amber-100'
            }`}
            role="status"
            aria-live="polite"
            data-testid="generation-panel-message"
          >
            {statusMessage}
          </div>
        )}

        <section className="space-y-2">
          <label className="block text-[11px] font-medium uppercase text-zinc-400" htmlFor="generation-track-select">
            Target Track
          </label>
          <select
            id="generation-track-select"
            value={generationForm.selectedTrackId}
            onChange={(event) => setGenerationTargetTrack(event.target.value)}
            className="w-full rounded border border-[#444] bg-[#2a2a2a] px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
            disabled={isSessionActive}
            aria-label="Generation target track"
            data-testid="generation-track-select"
          >
            {stemsTracks.length === 0 && <option value="">No stems tracks available</option>}
            {stemsTracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.displayName}
              </option>
            ))}
          </select>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-[11px] font-medium uppercase text-zinc-400" htmlFor="generation-prompt-input">
              Prompt
            </label>
            {promptHistory.length > 0 && (
              <button
                onClick={() => setShowPromptHistory((value) => !value)}
                className="text-[10px] text-indigo-400 transition-colors hover:text-indigo-300"
                type="button"
              >
                {showPromptHistory ? 'Hide history' : 'Prompt history'}
              </button>
            )}
          </div>
          <PromptAutocompleteTextarea
            value={generationForm.prompt}
            onChange={setGenerationPrompt}
            disabled={isSessionActive}
            getSuggestions={getPromptAutocompleteSuggestions}
            applySuggestion={applyPromptAutocompleteSuggestion}
          />

          {showPromptHistory && promptHistory.length > 0 && (
            <div className="max-h-32 overflow-y-auto rounded border border-[#444] bg-[#2a2a2a]">
              {promptHistory.slice(0, 10).map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => handleHistorySelect(entry.prompt)}
                  className="block w-full truncate px-2 py-1 text-left text-xs text-zinc-300 transition-colors hover:bg-[#333]"
                  title={entry.prompt}
                  type="button"
                >
                  {entry.prompt}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase text-zinc-400">Style Tags</span>
            <span className="text-[10px] text-zinc-600">
              {generationForm.styleTags.length}/6 selected
            </span>
          </div>
          <input
            value={styleTagsInput}
            onChange={(event) => setStyleTagsInput(event.target.value)}
            onBlur={commitStyleTagsInput}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitStyleTagsInput();
              }
            }}
            placeholder="Add comma-separated style tags"
            className="w-full rounded border border-[#444] bg-[#2a2a2a] px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
            disabled={isSessionActive}
            aria-label="Generation style tags"
            data-testid="generation-style-tags-input"
          />
          <div className="flex flex-wrap gap-1.5" data-testid="generation-style-tags">
            {PRESET_CATEGORIES.map((category) => {
              const selected = generationForm.styleTags.some((tag) => tag.toLowerCase() === category.toLowerCase());
              return (
                <button
                  key={category}
                  onClick={() => toggleGenerationStyleTag(category)}
                  className={`rounded-full border px-2 py-1 text-[11px] transition-colors ${
                    selected
                      ? 'border-indigo-400 bg-indigo-500/20 text-indigo-100'
                      : 'border-[#444] bg-[#2a2a2a] text-zinc-400 hover:border-[#555] hover:text-zinc-200'
                  }`}
                  type="button"
                  disabled={isSessionActive}
                  aria-pressed={selected}
                >
                  {category}
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase text-zinc-400">Quick Presets</span>
            <span className="text-[10px] text-zinc-600">Apply prompt + defaults</span>
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setPresetCategory('All')}
              className={`rounded-full px-2 py-0.5 text-[10px] ${
                presetCategory === 'All' ? 'bg-indigo-600 text-white' : 'bg-[#333] text-zinc-400 hover:bg-[#444]'
              }`}
              type="button"
            >
              All
            </button>
            {PRESET_CATEGORIES.map((category) => (
              <button
                key={category}
                onClick={() => setPresetCategory(category)}
                className={`rounded-full px-2 py-0.5 text-[10px] ${
                  presetCategory === category ? 'bg-indigo-600 text-white' : 'bg-[#333] text-zinc-400 hover:bg-[#444]'
                }`}
                type="button"
              >
                {category}
              </button>
            ))}
          </div>
          <div className="max-h-28 space-y-1 overflow-y-auto">
            {filteredPresets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => applyGenerationPreset(preset)}
                className="block w-full rounded bg-[#2a2a2a] px-2 py-1 text-left text-xs text-zinc-300 transition-colors hover:bg-[#333]"
                disabled={isSessionActive}
                type="button"
              >
                {preset.name}
              </button>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] font-medium uppercase text-zinc-400" htmlFor="generation-bpm-input">
              BPM
            </label>
            <input
              id="generation-bpm-input"
              type="number"
              value={generationForm.bpm}
              onChange={(event) => setGenerationBpm(Number(event.target.value))}
              className="mt-1 w-full rounded border border-[#444] bg-[#2a2a2a] px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
              min={MIN_BPM}
              max={MAX_BPM}
              disabled={isSessionActive}
              aria-label="Generation BPM"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium uppercase text-zinc-400" htmlFor="generation-key-select">
              Key
            </label>
            <select
              id="generation-key-select"
              value={generationForm.keyScale}
              onChange={(event) => setGenerationKeyScale(event.target.value)}
              className="mt-1 w-full rounded border border-[#444] bg-[#2a2a2a] px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
              disabled={isSessionActive}
              aria-label="Generation key"
            >
              {KEY_SCALES.map((keyScale) => (
                <option key={keyScale} value={keyScale}>
                  {keyScale}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium uppercase text-zinc-400" htmlFor="generation-length-input">
              Length (s)
            </label>
            <input
              id="generation-length-input"
              type="number"
              value={generationForm.lengthSeconds}
              onChange={(event) => setGenerationLengthSeconds(Number(event.target.value))}
              className="mt-1 w-full rounded border border-[#444] bg-[#2a2a2a] px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
              min={MIN_DURATION}
              max={MAX_DURATION}
              disabled={isSessionActive}
              aria-label="Generation length"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium uppercase text-zinc-400" htmlFor="generation-variation-count">
              Variations
            </label>
            <select
              id="generation-variation-count"
              value={generationForm.variationCount}
              onChange={(event) => setGenerationVariationCount(Number(event.target.value))}
              className="mt-1 w-full rounded border border-[#444] bg-[#2a2a2a] px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
              disabled={isSessionActive}
              aria-label="Generation variation count"
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-medium uppercase text-zinc-400" htmlFor="generation-temperature-slider">
              Temperature
            </label>
            <span className="text-xs text-zinc-300">{generationForm.temperature.toFixed(2)}</span>
          </div>
          <input
            id="generation-temperature-slider"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={generationForm.temperature}
            onChange={(event) => setGenerationTemperature(Number(event.target.value))}
            className="w-full accent-indigo-500"
            disabled={isSessionActive}
            aria-label="Generation temperature"
            data-testid="generation-temperature-slider"
          />
          <div className="flex justify-between text-[10px] text-zinc-600">
            <span>Stable</span>
            <span>Experimental</span>
          </div>
        </section>

        <section className="space-y-2">
          <button
            onClick={() => setShowLyrics((value) => !value)}
            className="text-[11px] font-medium uppercase text-zinc-400 transition-colors hover:text-zinc-300"
            type="button"
          >
            Lyrics {showLyrics ? '[-]' : '[+]'}
          </button>
          {showLyrics && (
            <textarea
              value={generationForm.lyrics}
              onChange={(event) => setGenerationLyrics(event.target.value)}
              placeholder="[verse]\nYour lyrics here..."
              className="w-full resize-none rounded border border-[#444] bg-[#2a2a2a] px-2 py-1.5 font-mono text-xs focus:border-indigo-500 focus:outline-none"
              rows={4}
              disabled={isSessionActive}
              aria-label="Generation lyrics"
            />
          )}
        </section>

        <section className="space-y-2" data-testid="advanced-params-section">
          <button onClick={() => setShowAdvanced((v) => !v)} className="text-[11px] font-medium uppercase text-zinc-400 transition-colors hover:text-zinc-300" type="button">
            Advanced Parameters {showAdvanced ? '[-]' : '[+]'}
          </button>
          {showAdvanced && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium uppercase text-zinc-400" htmlFor="generation-inference-steps">Inference Steps</label>
                  <span className="text-xs text-zinc-300">{generationForm.inferenceSteps}</span>
                </div>
                <input id="generation-inference-steps" type="range" min={1} max={200} step={1} value={generationForm.inferenceSteps} onChange={(e) => setGenerationInferenceSteps(Number(e.target.value))} className="mt-1 w-full accent-indigo-500" disabled={isSessionActive} aria-label="Inference steps" data-testid="generation-inference-steps" />
                <div className="flex justify-between text-[10px] text-zinc-600"><span>Fast</span><span>Quality</span></div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium uppercase text-zinc-400" htmlFor="generation-guidance-scale">Guidance Scale</label>
                  <span className="text-xs text-zinc-300">{generationForm.guidanceScale.toFixed(1)}</span>
                </div>
                <input id="generation-guidance-scale" type="range" min={0} max={20} step={0.1} value={generationForm.guidanceScale} onChange={(e) => setGenerationGuidanceScale(Number(e.target.value))} className="mt-1 w-full accent-indigo-500" disabled={isSessionActive} aria-label="Guidance scale" data-testid="generation-guidance-scale" />
                <div className="flex justify-between text-[10px] text-zinc-600"><span>Creative</span><span>Faithful</span></div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium uppercase text-zinc-400" htmlFor="generation-shift">Shift</label>
                  <span className="text-xs text-zinc-300">{generationForm.shift.toFixed(1)}</span>
                </div>
                <input id="generation-shift" type="range" min={0} max={10} step={0.1} value={generationForm.shift} onChange={(e) => setGenerationShift(Number(e.target.value))} className="mt-1 w-full accent-indigo-500" disabled={isSessionActive} aria-label="Shift" data-testid="generation-shift" />
              </div>
              <div className="flex items-center gap-2">
                <input id="generation-thinking" type="checkbox" checked={generationForm.thinking} onChange={(e) => setGenerationThinking(e.target.checked)} className="h-3.5 w-3.5 rounded border-[#444] bg-[#2a2a2a] accent-indigo-500" disabled={isSessionActive} aria-label="Thinking" data-testid="generation-thinking" />
                <label htmlFor="generation-thinking" className="text-[11px] font-medium uppercase text-zinc-400">Thinking</label>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium uppercase text-zinc-400" htmlFor="generation-seed">Seed</label>
                  <label className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                    <input type="checkbox" checked={generationForm.useRandomSeed} onChange={(e) => setGenerationUseRandomSeed(e.target.checked)} className="h-3 w-3 rounded border-[#444] bg-[#2a2a2a] accent-indigo-500" disabled={isSessionActive} aria-label="Random seed" data-testid="generation-random-seed" />
                    Random
                  </label>
                </div>
                <input id="generation-seed" type="text" value={generationForm.seed} onChange={(e) => setGenerationSeed(e.target.value)} placeholder="Enter seed value" className="w-full rounded border border-[#444] bg-[#2a2a2a] px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none disabled:opacity-50" disabled={isSessionActive || generationForm.useRandomSeed} aria-label="Seed" data-testid="generation-seed" />
              </div>
            </div>
          )}
        </section>

        <section className="space-y-2" data-testid="compare-models-section">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase text-zinc-400">Compare Models</span>
            <button
              type="button"
              onClick={() => setCompareModelsEnabled(!generationForm.compareModelsEnabled)}
              className={`relative h-5 w-9 rounded-full transition-colors ${
                generationForm.compareModelsEnabled ? 'bg-indigo-600' : 'bg-zinc-600'
              }`}
              disabled={isSessionActive}
              aria-label="Toggle compare models"
              data-testid="compare-models-toggle"
            >
              <span
                className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  generationForm.compareModelsEnabled ? 'translate-x-4' : ''
                }`}
              />
            </button>
          </div>
          {generationForm.compareModelsEnabled && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-zinc-500">Assign a model to each variation slot</p>
              {Array.from({ length: generationForm.variationCount }, (_, slotIndex) => {
                const currentOverride = generationForm.compareModelOverrides[slotIndex];
                return (
                  <div key={slotIndex} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#333] text-[10px] font-bold text-zinc-400">
                        {slotIndex + 1}
                      </span>
                      <select
                        value={currentOverride?.modelName ?? ''}
                        onChange={(e) => {
                          const newOverrides = [...generationForm.compareModelOverrides];
                          // Pad array to have enough entries
                          while (newOverrides.length <= slotIndex) {
                            newOverrides.push({ modelName: '' });
                          }
                          newOverrides[slotIndex] = {
                            ...newOverrides[slotIndex],
                            modelName: e.target.value,
                          };
                          setCompareModelOverrides(newOverrides);
                        }}
                        className="flex-1 rounded border border-[#444] bg-[#2a2a2a] px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
                        disabled={isSessionActive}
                        aria-label={`Model for variation ${slotIndex + 1}`}
                        data-testid={`compare-model-select-${slotIndex}`}
                      >
                        <option value="">Default model</option>
                        {availableModels.map((model) => (
                          <option key={model.name} value={model.name}>
                            {model.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    {currentOverride?.modelName && (
                      <div className="ml-7 flex gap-2">
                        <div className="flex-1">
                          <label className="text-[9px] text-zinc-500" htmlFor={`compare-steps-${slotIndex}`}>Steps</label>
                          <input
                            id={`compare-steps-${slotIndex}`}
                            type="number"
                            min={1}
                            max={200}
                            value={currentOverride.inferenceSteps ?? ''}
                            placeholder="Default"
                            onChange={(e) => {
                              const newOverrides = [...generationForm.compareModelOverrides];
                              newOverrides[slotIndex] = {
                                ...newOverrides[slotIndex],
                                inferenceSteps: e.target.value ? Number(e.target.value) : undefined,
                              };
                              setCompareModelOverrides(newOverrides);
                            }}
                            className="w-full rounded border border-[#444] bg-[#2a2a2a] px-1.5 py-0.5 text-[10px] focus:border-indigo-500 focus:outline-none"
                            disabled={isSessionActive}
                            data-testid={`compare-steps-${slotIndex}`}
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-[9px] text-zinc-500" htmlFor={`compare-guidance-${slotIndex}`}>Guidance</label>
                          <input
                            id={`compare-guidance-${slotIndex}`}
                            type="number"
                            min={0}
                            max={20}
                            step={0.1}
                            value={currentOverride.guidanceScale ?? ''}
                            placeholder="Default"
                            onChange={(e) => {
                              const newOverrides = [...generationForm.compareModelOverrides];
                              newOverrides[slotIndex] = {
                                ...newOverrides[slotIndex],
                                guidanceScale: e.target.value ? Number(e.target.value) : undefined,
                              };
                              setCompareModelOverrides(newOverrides);
                            }}
                            className="w-full rounded border border-[#444] bg-[#2a2a2a] px-1.5 py-0.5 text-[10px] focus:border-indigo-500 focus:outline-none"
                            disabled={isSessionActive}
                            data-testid={`compare-guidance-${slotIndex}`}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <button
          onClick={handleGenerate}
          disabled={Boolean(validationError) || isSessionActive}
          className="w-full rounded bg-indigo-600 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-400"
          data-testid="generation-generate-btn"
        >
          {isSessionActive ? 'Generating...' : `Generate ${generationForm.variationCount} Variation${generationForm.variationCount === 1 ? '' : 's'}`}
        </button>

        {jobs.length > 0 && (
          <section className="space-y-2" data-testid="generation-live-jobs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase text-zinc-400">Live Progress</span>
              <span className="text-[10px] text-zinc-600">
                Store-backed backend stages
              </span>
            </div>

            {jobs.map((job) => {
              const eta = job.etaSeconds != null && (job.etaConfidence === 'medium' || job.etaConfidence === 'high')
                ? formatEtaDisplay(job.etaSeconds)
                : null;
              const progressLabel = job.progressPercent != null
                ? `${Math.round(job.progressPercent)}%`
                : job.status === 'queued'
                  ? 'Queued'
                  : null;

              return (
                <div
                  key={job.id}
                  className="rounded border border-[#333] bg-[#252525] px-2 py-2"
                  data-testid={`generation-job-${job.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium uppercase text-zinc-200">{job.trackName}</div>
                      <div className="mt-0.5 text-[10px] text-zinc-400">
                        {job.stage ?? 'Generation update pending'}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${VARIATION_STATUS_COLORS[job.status === 'queued' ? 'pending' : job.status]}`}>
                      {progressLabel ?? VARIATION_STATUS_LABELS[job.status === 'queued' ? 'pending' : job.status]}
                    </span>
                  </div>

                  {job.progressPercent != null && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#1b1b1b]">
                      <div
                        className="h-full rounded-full bg-indigo-500 transition-[width] duration-300"
                        style={{ width: `${job.progressPercent}%` }}
                        aria-label={`${job.trackName} progress ${Math.round(job.progressPercent)} percent`}
                      />
                    </div>
                  )}

                  <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-zinc-400">
                    <span>{job.progress}</span>
                    {eta ? <span>ETA: {eta}</span> : <span>{job.stage ? 'ETA pending' : 'Waiting for backend'}</span>}
                  </div>

                  {job.status === 'error' && job.actionableMessage && (
                    <div className="mt-1 text-[10px] text-red-300">{job.actionableMessage}</div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {variationSession && (
          <section className="space-y-2" data-testid="variation-cards">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase text-zinc-400">Variations</span>
              <span className="text-[10px] text-zinc-600">
                Press 1-{variationSession.variations.length} to switch
              </span>
            </div>

            {variationSession.variations.map((variation) => {
              const isActive = variation.index === variationSession.activeVariationIndex;
              const etaSeconds = variation.etaSeconds ?? computeEta(variation.startedAt, variation.progressPercent);
              const etaLabel = formatEtaDisplay(etaSeconds);

              return (
                <button
                  key={variation.index}
                  onClick={() => {
                    setActiveVariation(variation.index);
                    if (variation.clipId) {
                      selectClip(variation.clipId, false);
                    }
                  }}
                  className={`flex w-full items-center gap-2 rounded border px-2 py-1.5 text-left transition-colors ${
                    isActive
                      ? 'border-indigo-500/50 bg-indigo-900/40'
                      : 'border-transparent bg-[#2a2a2a] hover:border-[#444]'
                  }`}
                  type="button"
                  data-testid={`variation-card-${variation.index}`}
                  aria-label={`Variation ${variation.index + 1}`}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold ${
                      isActive ? 'bg-indigo-600 text-white' : 'bg-[#333] text-zinc-400'
                    }`}
                  >
                    {variation.index + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${VARIATION_STATUS_COLORS[variation.status]}`}>
                        {VARIATION_STATUS_LABELS[variation.status]}
                      </span>
                      {variation.modelName && (
                        <span
                          className="rounded bg-cyan-900/40 px-1.5 py-0.5 text-[9px] font-medium text-cyan-300"
                          data-testid={`variation-model-badge-${variation.index}`}
                        >
                          {variation.modelName}
                        </span>
                      )}
                      {variation.status === 'generating' && (
                        <div className="h-2.5 w-2.5 rounded-full border border-indigo-400 border-t-transparent animate-spin" />
                      )}
                    </div>
                    {variation.stage && (
                      <span className="mt-0.5 block text-[10px] text-zinc-400">{variation.stage}</span>
                    )}
                    {variation.progress && !variation.stage && (
                      <span className="mt-0.5 block text-[10px] text-zinc-400">{variation.progress}</span>
                    )}
                    {variation.progressPercent !== undefined && variation.status === 'generating' && (
                      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-zinc-700">
                        <div
                          className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                          style={{ width: `${Math.min(100, variation.progressPercent)}%` }}
                        />
                      </div>
                    )}
                    {etaLabel && (
                      <span className="block text-[10px] text-zinc-600" data-testid={`variation-eta-${variation.index}`}>ETA: {etaLabel}</span>
                    )}
                    {variation.error && (
                      <span className="mt-0.5 block truncate text-[10px] text-red-400">{variation.error}</span>
                    )}
                  </div>
                </button>
              );
            })}

            <div className="flex gap-2">
              {variationSession.status === 'generating' ? (
                <button
                  onClick={cancelVariationSession}
                  className="flex-1 rounded bg-red-900/20 py-1 text-[11px] text-red-400 transition-colors hover:bg-red-900/30 hover:text-red-300"
                  type="button"
                  data-testid="cancel-generation-btn"
                >
                  Cancel
                </button>
              ) : (
                <button
                  onClick={clearVariationSession}
                  className="flex-1 rounded bg-[#333] py-1 text-[11px] text-zinc-400 transition-colors hover:bg-[#444] hover:text-zinc-300"
                  type="button"
                >
                  Clear
                </button>
              )}
            </div>
          </section>
        )}
      </div>
          )}
        </aside>
      )}
    </>
  );
}
