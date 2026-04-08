import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../uiStore';
import { getBottomPanelHeight } from '../uiStore';

describe('getBottomPanelHeight', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('returns 0 when no bottom panel is active', () => {
    useUIStore.setState({ activeBottomPanel: null });
    expect(getBottomPanelHeight(useUIStore.getState())).toBe(0);
  });

  it('returns drumMachineEditorHeight when drumMachine is active', () => {
    useUIStore.setState({ activeBottomPanel: 'drumMachine', drumMachineEditorHeight: 450 });
    expect(getBottomPanelHeight(useUIStore.getState())).toBe(450);
  });

  it('returns sequencerEditorHeight when editor is active', () => {
    useUIStore.setState({ activeBottomPanel: 'editor', sequencerEditorHeight: 350 });
    expect(getBottomPanelHeight(useUIStore.getState())).toBe(350);
  });

  it('returns pianoRollHeight when pianoRoll is active', () => {
    useUIStore.setState({ activeBottomPanel: 'pianoRoll', pianoRollHeight: 400 });
    expect(getBottomPanelHeight(useUIStore.getState())).toBe(400);
  });

  it('returns effectChainHeight when effects is active', () => {
    useUIStore.setState({ activeBottomPanel: 'effects', effectChainHeight: 280 });
    expect(getBottomPanelHeight(useUIStore.getState())).toBe(280);
  });

  it('returns 140 for smart controls panel', () => {
    useUIStore.setState({ activeBottomPanel: 'smart' });
    expect(getBottomPanelHeight(useUIStore.getState())).toBe(140);
  });

  it('returns 300 for strudel editor', () => {
    useUIStore.setState({ activeBottomPanel: 'strudel' });
    expect(getBottomPanelHeight(useUIStore.getState())).toBe(300);
  });

  it('adds mixer height when mixer is visible', () => {
    useUIStore.setState({ activeBottomPanel: null, showMixer: true, mixerHeight: 420 });
    expect(getBottomPanelHeight(useUIStore.getState())).toBe(420);
  });

  it('clamps mixer height to minimum visible height (360)', () => {
    useUIStore.setState({ activeBottomPanel: null, showMixer: true, mixerHeight: 160 });
    expect(getBottomPanelHeight(useUIStore.getState())).toBe(360);
  });

  it('combines bottom panel and mixer heights', () => {
    useUIStore.setState({
      activeBottomPanel: 'drumMachine',
      drumMachineEditorHeight: 400,
      showMixer: true,
      mixerHeight: 420,
    });
    expect(getBottomPanelHeight(useUIStore.getState())).toBe(400 + 420);
  });

  it('adds clip inspector height (280) when inspector is visible', () => {
    useUIStore.setState({ activeBottomPanel: null, showClipInspector: true });
    expect(getBottomPanelHeight(useUIStore.getState())).toBe(280);
  });

  it('combines clip inspector with mixer height', () => {
    useUIStore.setState({ showClipInspector: true, showMixer: true, mixerHeight: 420 });
    expect(getBottomPanelHeight(useUIStore.getState())).toBe(280 + 420);
  });
});
