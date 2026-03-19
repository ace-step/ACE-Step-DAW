import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { useProjectStore } from './store/projectStore';
import { useUIStore } from './store/uiStore';
import { useTransportStore } from './store/transportStore';
import { useCollaborationStore } from './store/collaborationStore';
import { generateProjectSummary, generateProjectStructure } from './utils/dawStateSummary';

// Expose stores globally for agent/automation access
// Agents can call: window.__store.getState() / window.__store.setState(...)
(window as unknown as Record<string, unknown>).__store = useProjectStore;
(window as unknown as Record<string, unknown>).__uiStore = useUIStore;
(window as unknown as Record<string, unknown>).__transportStore = useTransportStore;
(window as unknown as Record<string, unknown>).__collaborationStore = useCollaborationStore;

// Expose DAW state summary for LLM agents
// Agents can call: window.__dawSummary() for natural language, window.__dawStructure() for JSON
(window as unknown as Record<string, unknown>).__dawSummary = () =>
  generateProjectSummary(useProjectStore.getState().project);
(window as unknown as Record<string, unknown>).__dawStructure = () =>
  generateProjectStructure(useProjectStore.getState().project);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
