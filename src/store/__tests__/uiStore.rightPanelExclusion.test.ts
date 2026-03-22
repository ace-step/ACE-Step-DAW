import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../uiStore';

/**
 * Right-side panels are mutually exclusive: opening one closes all others.
 * Panels: showMixer, loopBrowserOpen, showGenerationPanel,
 *         showModelLibrary, showAIAssistant
 */

const RIGHT_PANEL_KEYS = [
  'showMixer',
  'loopBrowserOpen',
  'showGenerationPanel',
  'showModelLibrary',
  'showAIAssistant',
] as const;

type RightPanelKey = (typeof RIGHT_PANEL_KEYS)[number];

function getRightPanelStates() {
  const state = useUIStore.getState();
  return Object.fromEntries(RIGHT_PANEL_KEYS.map((k) => [k, state[k]])) as Record<
    RightPanelKey,
    boolean
  >;
}

function allPanelsClosed() {
  return Object.values(getRightPanelStates()).every((v) => !v);
}

function onlyOpen(key: RightPanelKey) {
  const states = getRightPanelStates();
  return states[key] === true && Object.entries(states).every(([k, v]) => k === key || !v);
}

describe('right-side panel mutual exclusion', () => {
  beforeEach(() => {
    // Reset all right-panel booleans to false
    useUIStore.setState({
      showMixer: false,
      loopBrowserOpen: false,
      showGenerationPanel: false,
      showGenerationHistoryPanel: false,
      generationPanelView: 'textToMusic',
      showModelLibrary: false,
      showAIAssistant: false,
    });
  });

  it('starts with all right panels closed', () => {
    expect(allPanelsClosed()).toBe(true);
  });

  // --- toggleLoopBrowser ---
  it('toggleLoopBrowser opens loop browser and closes others', () => {
    useUIStore.setState({ showMixer: true });
    useUIStore.getState().toggleLoopBrowser();
    expect(onlyOpen('loopBrowserOpen')).toBe(true);
  });

  it('toggleLoopBrowser off does not open another panel', () => {
    useUIStore.setState({ loopBrowserOpen: true });
    useUIStore.getState().toggleLoopBrowser();
    expect(allPanelsClosed()).toBe(true);
  });

  // --- toggleModelLibrary ---
  it('toggleModelLibrary opens model library and closes others', () => {
    useUIStore.setState({ showGenerationPanel: true });
    useUIStore.getState().toggleModelLibrary();
    expect(onlyOpen('showModelLibrary')).toBe(true);
  });

  it('toggleModelLibrary off does not open another panel', () => {
    useUIStore.setState({ showModelLibrary: true });
    useUIStore.getState().toggleModelLibrary();
    expect(allPanelsClosed()).toBe(true);
  });

  // --- toggleGenerationPanel ---
  it('toggleGenerationPanel opens generation panel and closes others', () => {
    useUIStore.setState({ showMixer: true, loopBrowserOpen: true });
    useUIStore.getState().toggleGenerationPanel();
    expect(onlyOpen('showGenerationPanel')).toBe(true);
  });

  it('toggleGenerationPanel off does not open another panel', () => {
    useUIStore.setState({ showGenerationPanel: true });
    useUIStore.getState().toggleGenerationPanel();
    expect(allPanelsClosed()).toBe(true);
  });

  // --- toggleGenerationHistoryPanel ---
  it('toggleGenerationHistoryPanel opens history and closes others', () => {
    useUIStore.setState({ showAIAssistant: true });
    useUIStore.getState().toggleGenerationHistoryPanel();
    expect(onlyOpen('showGenerationPanel')).toBe(true);
    expect(useUIStore.getState().generationPanelView).toBe('history');
    expect(useUIStore.getState().showGenerationHistoryPanel).toBe(false);
  });

  it('toggleGenerationHistoryPanel off does not open another panel', () => {
    useUIStore.setState({ showGenerationPanel: true, generationPanelView: 'history' });
    useUIStore.getState().toggleGenerationHistoryPanel();
    expect(allPanelsClosed()).toBe(true);
  });

  // --- toggleAIAssistant ---
  it('toggleAIAssistant opens AI assistant and closes others', () => {
    useUIStore.setState({ showMixer: true, showModelLibrary: true });
    useUIStore.getState().toggleAIAssistant();
    expect(onlyOpen('showAIAssistant')).toBe(true);
  });

  it('toggleAIAssistant off does not open another panel', () => {
    useUIStore.setState({ showAIAssistant: true });
    useUIStore.getState().toggleAIAssistant();
    expect(allPanelsClosed()).toBe(true);
  });

  // --- setShowMixer (used by Toolbar as toggle) ---
  it('setShowMixer(true) opens mixer and closes others', () => {
    useUIStore.setState({ loopBrowserOpen: true, showGenerationPanel: true });
    useUIStore.getState().setShowMixer(true);
    expect(onlyOpen('showMixer')).toBe(true);
  });

  it('setShowMixer(false) closes mixer without opening others', () => {
    useUIStore.setState({ showMixer: true });
    useUIStore.getState().setShowMixer(false);
    expect(allPanelsClosed()).toBe(true);
  });

  // --- setShowGenerationPanel ---
  it('setShowGenerationPanel(true) opens generation panel and closes others', () => {
    useUIStore.setState({ showMixer: true });
    useUIStore.getState().setShowGenerationPanel(true);
    expect(onlyOpen('showGenerationPanel')).toBe(true);
  });

  // --- setShowGenerationHistoryPanel ---
  it('setShowGenerationHistoryPanel(true) opens history and closes others', () => {
    useUIStore.setState({ showAIAssistant: true });
    useUIStore.getState().setShowGenerationHistoryPanel(true);
    expect(onlyOpen('showGenerationPanel')).toBe(true);
    expect(useUIStore.getState().generationPanelView).toBe('history');
    expect(useUIStore.getState().showGenerationHistoryPanel).toBe(false);
  });

  // --- setShowModelLibrary ---
  it('setShowModelLibrary(true) opens model library and closes others', () => {
    useUIStore.setState({ showMixer: true });
    useUIStore.getState().setShowModelLibrary(true);
    expect(onlyOpen('showModelLibrary')).toBe(true);
  });

  // --- setShowAIAssistant ---
  it('setShowAIAssistant(true) opens AI assistant and closes others', () => {
    useUIStore.setState({ showGenerationPanel: true });
    useUIStore.getState().setShowAIAssistant(true);
    expect(onlyOpen('showAIAssistant')).toBe(true);
  });

  // --- Idempotent: toggling an already-open panel just closes it ---
  it('toggling the already-open panel closes it', () => {
    useUIStore.getState().toggleGenerationPanel();
    expect(onlyOpen('showGenerationPanel')).toBe(true);
    useUIStore.getState().toggleGenerationPanel();
    expect(allPanelsClosed()).toBe(true);
  });
});
