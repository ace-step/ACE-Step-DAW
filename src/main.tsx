import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { getAudioEngine } from './hooks/useAudioEngine';
import { useProjectStore } from './store/projectStore';
import { useUIStore } from './store/uiStore';
import { useTransportStore } from './store/transportStore';
import { useCollaborationStore } from './store/collaborationStore';
import { useShortcutsStore } from './store/shortcutsStore';
import { useGenerationStore } from './store/generationStore';
import { useSessionStore } from './store/sessionStore';
import { projectActionApi } from './services/actionApi';
import { generateProjectSummary, generateProjectStructure } from './utils/dawStateSummary';
import { getMidiCaptureService } from './services/midiCaptureService';

// Expose stores globally for agent/automation access (typed via src/globals.d.ts)
// Agents can call: window.__store.getState() / window.__store.setState(...)
(window as unknown as Record<string, unknown>).__store = useProjectStore;
(window as unknown as Record<string, unknown>).__actionApi = projectActionApi;
(window as unknown as Record<string, unknown>).__uiStore = useUIStore;
(window as unknown as Record<string, unknown>).__assistantStore = useUIStore;
(window as unknown as Record<string, unknown>).__transportStore = useTransportStore;
(window as unknown as Record<string, unknown>).__collaborationStore = useCollaborationStore;
(window as unknown as Record<string, unknown>).__generationStore = useGenerationStore;
(window as unknown as Record<string, unknown>).__sessionStore = useSessionStore;
(window as unknown as Record<string, unknown>).__getAudioEngine = () => getAudioEngine();
(window as unknown as Record<string, unknown>).__shortcutsStore = useShortcutsStore;
(window as unknown as Record<string, unknown>).__commandPalette = {
  list: (query?: string) => useUIStore.getState().getCommandPaletteRegistry(query),
  search: (query?: string) => useUIStore.getState().searchCommandPalette(query),
  execute: (commandId: string) => useUIStore.getState().executeCommandPaletteCommand(commandId),
  open: (query?: string) => useUIStore.getState().openCommandPalette(query),
  close: () => useUIStore.getState().closeCommandPalette(),
};

// Expose DAW state summary for LLM agents
// Agents can call: window.__dawSummary() for natural language, window.__dawStructure() for JSON
window.__dawSummary = () =>
  generateProjectSummary(useProjectStore.getState().project);
window.__dawStructure = () =>
  generateProjectStructure(useProjectStore.getState().project);
window.__midiCaptureService = getMidiCaptureService();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
