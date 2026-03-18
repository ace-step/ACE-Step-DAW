import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { useProjectStore } from './store/projectStore';

// Expose store globally for agent/automation access
// Agents can call: window.__store.getState() / window.__store.setState(...)
(window as unknown as Record<string, unknown>).__store = useProjectStore;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
