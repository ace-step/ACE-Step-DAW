import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { useProjectStore } from './store/projectStore';
import { useUIStore } from './store/uiStore';
import { useTransportStore } from './store/transportStore';
import { useCollaborationStore } from './store/collaborationStore';
import { useShortcutsStore } from './store/shortcutsStore';
import { useGenerationStore } from './store/generationStore';
import { useSessionStore } from './store/sessionStore';
import { useModelStore } from './store/modelStore';
import { projectActionApi } from './services/actionApi';
import { getDAWApi } from './api/dawApi';
import { cloudStorage } from './services/cloudStorageService';
import { createProjectShare } from './services/projectSharingService';
import { generateProjectSummary, generateProjectStructure } from './utils/dawStateSummary';
import { getMidiCaptureService } from './services/midiCaptureService';
import { executeCoreDawShortcut } from './services/coreDawShortcuts';
import { useAnalysisStore } from './store/analysisStore';
import { analyzeClipLocally } from './services/localAnalysisService';
import { useVoiceStore } from './store/voiceStore';
import { useCustomModelStore } from './store/customModelStore';
import { useVoiceVerificationStore } from './store/voiceVerificationStore';

const agentProjectStore = {
  getState: () => ({
    ...useProjectStore.getState(),
    generationForm: useGenerationStore.getState().generationForm,
    jobs: useGenerationStore.getState().jobs,
    isGenerating: useGenerationStore.getState().isGenerating,
    variationSession: useGenerationStore.getState().variationSession,
    setGenerationPrompt: useGenerationStore.getState().setGenerationPrompt,
    setGenerationStyleTags: useGenerationStore.getState().setGenerationStyleTags,
    toggleGenerationStyleTag: useGenerationStore.getState().toggleGenerationStyleTag,
    setGenerationBpm: useGenerationStore.getState().setGenerationBpm,
    setGenerationKeyScale: useGenerationStore.getState().setGenerationKeyScale,
    setGenerationLengthSeconds: useGenerationStore.getState().setGenerationLengthSeconds,
    setGenerationTemperature: useGenerationStore.getState().setGenerationTemperature,
    setGenerationVariationCount: useGenerationStore.getState().setGenerationVariationCount,
    setGenerationTargetTrack: useGenerationStore.getState().setGenerationTargetTrack,
    setGenerationLyrics: useGenerationStore.getState().setGenerationLyrics,
    setGenerationRequestError: useGenerationStore.getState().setGenerationRequestError,
    applyGenerationPreset: useGenerationStore.getState().applyGenerationPreset,
    getGenerationValidationError: useGenerationStore.getState().getGenerationValidationError,
    canSubmitGeneration: useGenerationStore.getState().canSubmitGeneration,
    activePianoRollTool: useUIStore.getState().activePianoRollTool,
    activePianoRollChordShape: useUIStore.getState().activePianoRollChordShape,
    setActivePianoRollTool: useUIStore.getState().setActivePianoRollTool,
    setActivePianoRollChordShape: useUIStore.getState().setActivePianoRollChordShape,
    togglePianoRollPencilTool: useUIStore.getState().togglePianoRollPencilTool,
    showGenerationPanel: useUIStore.getState().showGenerationPanel,
    setShowGenerationPanel: useUIStore.getState().setShowGenerationPanel,
    toggleGenerationPanel: useUIStore.getState().toggleGenerationPanel,
    zoomTimelineToSelection: useUIStore.getState().zoomTimelineToSelection,
    zoomTimelineToProject: useUIStore.getState().zoomTimelineToProject,
    lastSubmittedRequest: useGenerationStore.getState().lastSubmittedRequest,
    submitGenerationRequest: useGenerationStore.getState().submitGenerationRequest,
    setActiveVariation: useGenerationStore.getState().setActiveVariation,
  }),
  setState: useProjectStore.setState,
  subscribe: useProjectStore.subscribe,
  getInitialState: () => ({
    ...useProjectStore.getInitialState(),
    generationForm: useGenerationStore.getInitialState().generationForm,
    jobs: useGenerationStore.getInitialState().jobs,
    isGenerating: useGenerationStore.getInitialState().isGenerating,
    variationSession: useGenerationStore.getInitialState().variationSession,
    setGenerationPrompt: useGenerationStore.getInitialState().setGenerationPrompt,
    setGenerationStyleTags: useGenerationStore.getInitialState().setGenerationStyleTags,
    toggleGenerationStyleTag: useGenerationStore.getInitialState().toggleGenerationStyleTag,
    setGenerationBpm: useGenerationStore.getInitialState().setGenerationBpm,
    setGenerationKeyScale: useGenerationStore.getInitialState().setGenerationKeyScale,
    setGenerationLengthSeconds: useGenerationStore.getInitialState().setGenerationLengthSeconds,
    setGenerationTemperature: useGenerationStore.getInitialState().setGenerationTemperature,
    setGenerationVariationCount: useGenerationStore.getInitialState().setGenerationVariationCount,
    setGenerationTargetTrack: useGenerationStore.getInitialState().setGenerationTargetTrack,
    setGenerationLyrics: useGenerationStore.getInitialState().setGenerationLyrics,
    setGenerationRequestError: useGenerationStore.getInitialState().setGenerationRequestError,
    applyGenerationPreset: useGenerationStore.getInitialState().applyGenerationPreset,
    getGenerationValidationError: useGenerationStore.getInitialState().getGenerationValidationError,
    canSubmitGeneration: useGenerationStore.getInitialState().canSubmitGeneration,
    activePianoRollTool: useUIStore.getInitialState().activePianoRollTool,
    activePianoRollChordShape: useUIStore.getInitialState().activePianoRollChordShape,
    setActivePianoRollTool: useUIStore.getInitialState().setActivePianoRollTool,
    setActivePianoRollChordShape: useUIStore.getInitialState().setActivePianoRollChordShape,
    togglePianoRollPencilTool: useUIStore.getInitialState().togglePianoRollPencilTool,
    showGenerationPanel: useUIStore.getInitialState().showGenerationPanel,
    setShowGenerationPanel: useUIStore.getInitialState().setShowGenerationPanel,
    toggleGenerationPanel: useUIStore.getInitialState().toggleGenerationPanel,
    zoomTimelineToSelection: useUIStore.getInitialState().zoomTimelineToSelection,
    zoomTimelineToProject: useUIStore.getInitialState().zoomTimelineToProject,
    lastSubmittedRequest: useGenerationStore.getInitialState().lastSubmittedRequest,
    submitGenerationRequest: useGenerationStore.getInitialState().submitGenerationRequest,
    setActiveVariation: useGenerationStore.getInitialState().setActiveVariation,
  }),
};

// Expose stores globally for agent/automation access (typed via src/globals.d.ts)
// Agents can call: window.__store.getState() / window.__store.setState(...)
(window as unknown as Record<string, unknown>).__store = agentProjectStore;
(window as unknown as Record<string, unknown>).__actionApi = projectActionApi;
(window as unknown as Record<string, unknown>).__uiStore = useUIStore;
(window as unknown as Record<string, unknown>).__assistantStore = useUIStore;
(window as unknown as Record<string, unknown>).__transportStore = useTransportStore;
(window as unknown as Record<string, unknown>).__collaborationStore = useCollaborationStore;
(window as unknown as Record<string, unknown>).__generationStore = useGenerationStore;
(window as unknown as Record<string, unknown>).__analysisStore = useAnalysisStore;
(window as unknown as Record<string, unknown>).__analyzeClipLocally = analyzeClipLocally;
(window as unknown as Record<string, unknown>).__sessionStore = useSessionStore;
(window as unknown as Record<string, unknown>).__modelStore = useModelStore;
(window as unknown as Record<string, unknown>).__voiceStore = useVoiceStore;
(window as unknown as Record<string, unknown>).__customModelStore = useCustomModelStore;
(window as unknown as Record<string, unknown>).__voiceVerificationStore = useVoiceVerificationStore;
// Keep synchronous — callers (uiStore video recording) expect immediate return.
// Module is pre-loaded via dynamic import so it's available by user interaction time.
let _cachedGetAudioEngine: (() => unknown) | null = null;
void import('./hooks/useAudioEngine').then(m => { _cachedGetAudioEngine = m.getAudioEngine; });
(window as unknown as Record<string, unknown>).__getAudioEngine = () => {
  if (!_cachedGetAudioEngine) throw new Error('Audio engine module not yet loaded');
  return _cachedGetAudioEngine();
};
(window as unknown as Record<string, unknown>).__shortcutsStore = useShortcutsStore;

// Strudel Agent API — lazy-loaded to avoid pulling strudel deps into main bundle
type StrudelApi = ReturnType<Awaited<typeof import('./services/strudelAgentApi')>['createStrudelAgentApi']>;
let _strudelApi: StrudelApi | null = null;
let _strudelApiPromise: Promise<StrudelApi> | null = null;
function ensureStrudelApi(): Promise<StrudelApi> {
  if (_strudelApi) return Promise.resolve(_strudelApi);
  if (!_strudelApiPromise) {
    _strudelApiPromise = import('./services/strudelAgentApi').then(m => {
      _strudelApi = m.createStrudelAgentApi();
      return _strudelApi;
    });
  }
  return _strudelApiPromise;
}
const strudelApiProxy = new Proxy({} as Record<string, unknown>, {
  get(_target, prop) {
    if (_strudelApi) return (_strudelApi as Record<string, unknown>)[prop as string];
    // Return async wrapper that awaits module load
    return async (...args: unknown[]) => {
      const api = await ensureStrudelApi();
      const fn = (api as Record<string, unknown>)[prop as string];
      if (typeof fn !== 'function') return fn;
      return (fn as (...a: unknown[]) => unknown)(...args);
    };
  },
});
(window as unknown as Record<string, unknown>).__strudelApi = strudelApiProxy;
(window as unknown as Record<string, unknown>).__coreDawShortcuts = {
  execute: (actionId: Parameters<typeof executeCoreDawShortcut>[0]) => executeCoreDawShortcut(actionId),
};
(window as unknown as Record<string, unknown>).__commandPalette = {
  list: (query?: string) => useUIStore.getState().getCommandPaletteRegistry(query),
  search: (query?: string) => useUIStore.getState().searchCommandPalette(query),
  execute: (commandId: string) => useUIStore.getState().executeCommandPaletteCommand(commandId),
  open: (query?: string) => useUIStore.getState().openCommandPalette(query),
  close: () => useUIStore.getState().closeCommandPalette(),
};
(window as unknown as Record<string, unknown>).__keyboardCommands = {
  execute: (actionId: Parameters<ReturnType<typeof getDAWApi>['commands']['executeCoreShortcut']>[0]) =>
    getDAWApi().commands.executeCoreShortcut(actionId),
};
(window as unknown as Record<string, unknown>).__sharingApi = {
  createLink: async () => {
    const project = useProjectStore.getState().project;
    if (!project) {
      throw new Error('Create or open a project before sharing');
    }

    return createProjectShare(project, `${window.location.origin}${window.location.pathname}`);
  },
  loadSharedProject: (token: string) => cloudStorage.loadSharedProject(token),
  listSharedProjects: () => cloudStorage.listSharedProjects(),
};

// Expose DAW state summary for LLM agents
// Agents can call: window.__dawSummary() for natural language, window.__dawStructure() for JSON
window.__dawSummary = () =>
  generateProjectSummary(useProjectStore.getState().project);
window.__dawStructure = () =>
  generateProjectStructure(useProjectStore.getState().project);
window.__midiCaptureService = getMidiCaptureService();

// Start MCP bridge for Claude Code integration (lazy — not needed for initial render)
void import('./services/mcpBridge')
  .then(m => m.startMcpBridge())
  .catch(err => console.error('Failed to start MCP bridge', err));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
