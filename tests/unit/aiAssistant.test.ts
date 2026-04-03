import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../../src/store/uiStore';

describe('AI Assistant panel state', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('assistant panel is closed by default', () => {
    expect(useUIStore.getState().showAIAssistant).toBe(false);
  });

  it('toggles assistant panel open and closed', () => {
    useUIStore.getState().toggleAIAssistant();
    expect(useUIStore.getState().showAIAssistant).toBe(true);

    useUIStore.getState().toggleAIAssistant();
    expect(useUIStore.getState().showAIAssistant).toBe(false);
  });

  it('persists assistant panel open state', () => {
    useUIStore.getState().setShowAIAssistant(true);
    const persisted = JSON.parse(localStorage.getItem('ace-step-daw-ui') || '{}');
    expect(persisted.state.showAIAssistant).toBe(true);
  });

  it('closes other right panels when opening assistant', () => {
    useUIStore.setState({ showMixer: true });
    useUIStore.getState().setShowAIAssistant(true);
    expect(useUIStore.getState().showMixer).toBe(false);
    expect(useUIStore.getState().showAIAssistant).toBe(true);
  });
});
