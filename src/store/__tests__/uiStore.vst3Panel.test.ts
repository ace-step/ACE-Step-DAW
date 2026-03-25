import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../uiStore';

describe('uiStore — VST3 panel', () => {
  beforeEach(() => {
    useUIStore.setState({ showVST3Panel: false, showGenerationPanel: false });
  });

  it('starts with showVST3Panel = false', () => {
    expect(useUIStore.getState().showVST3Panel).toBe(false);
  });

  it('toggleVST3Panel opens the panel', () => {
    useUIStore.getState().toggleVST3Panel();
    expect(useUIStore.getState().showVST3Panel).toBe(true);
  });

  it('toggleVST3Panel closes the panel when already open', () => {
    useUIStore.setState({ showVST3Panel: true });
    useUIStore.getState().toggleVST3Panel();
    expect(useUIStore.getState().showVST3Panel).toBe(false);
  });

  it('opening VST3 panel closes GenerationPanel (mutual exclusion)', () => {
    useUIStore.setState({ showGenerationPanel: true });
    useUIStore.getState().toggleVST3Panel();
    expect(useUIStore.getState().showVST3Panel).toBe(true);
    expect(useUIStore.getState().showGenerationPanel).toBe(false);
  });

  it('opening GenerationPanel closes VST3 panel', () => {
    useUIStore.setState({ showVST3Panel: true });
    useUIStore.getState().toggleGenerationPanel();
    expect(useUIStore.getState().showGenerationPanel).toBe(true);
    expect(useUIStore.getState().showVST3Panel).toBe(false);
  });

  it('setShowVST3Panel(true) opens with mutual exclusion', () => {
    useUIStore.setState({ showGenerationPanel: true });
    useUIStore.getState().setShowVST3Panel(true);
    expect(useUIStore.getState().showVST3Panel).toBe(true);
    expect(useUIStore.getState().showGenerationPanel).toBe(false);
  });

  it('setShowVST3Panel(false) closes', () => {
    useUIStore.setState({ showVST3Panel: true });
    useUIStore.getState().setShowVST3Panel(false);
    expect(useUIStore.getState().showVST3Panel).toBe(false);
  });
});
