import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../uiStore';

/**
 * Modal dialogs are mutually exclusive: opening one closes all others.
 * This tests the ALL_MODALS_CLOSED spread pattern in uiStore setters.
 */

const MODAL_OPENERS: Array<{
  name: string;
  open: () => void;
  key: string;
}> = [
  { name: 'Settings', open: () => useUIStore.getState().setShowSettingsDialog(true), key: 'showSettingsDialog' },
  { name: 'KeyboardShortcuts', open: () => useUIStore.getState().setShowKeyboardShortcutsDialog(true), key: 'showKeyboardShortcutsDialog' },
  { name: 'ShortcutEditor', open: () => useUIStore.getState().setShowShortcutEditorDialog(true), key: 'showShortcutEditorDialog' },
  { name: 'Export', open: () => useUIStore.getState().setShowExportDialog(true), key: 'showExportDialog' },
  { name: 'ProjectList', open: () => useUIStore.getState().setShowProjectListDialog(true), key: 'showProjectListDialog' },
  { name: 'NewProject', open: () => useUIStore.getState().setShowNewProjectDialog(true), key: 'showNewProjectDialog' },
  { name: 'InstrumentPicker', open: () => useUIStore.getState().setShowInstrumentPicker(true), key: 'showInstrumentPicker' },
  { name: 'CommandPalette', open: () => useUIStore.getState().openCommandPalette(), key: 'showCommandPalette' },
];

describe('modal dialog mutual exclusion', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  for (const opener of MODAL_OPENERS) {
    it(`opening ${opener.name} closes all other modals`, () => {
      // First open all modals via direct setState
      useUIStore.setState({
        showSettingsDialog: true,
        showKeyboardShortcutsDialog: true,
        showShortcutEditorDialog: true,
        showExportDialog: true,
        showProjectListDialog: true,
        showNewProjectDialog: true,
        showInstrumentPicker: true,
        showCommandPalette: true,
      });

      // Now open this specific modal through its setter
      opener.open();

      const state = useUIStore.getState();
      // The opened modal should be true
      expect(state[opener.key as keyof typeof state]).toBe(true);

      // All other modals should be false
      for (const other of MODAL_OPENERS) {
        if (other.key !== opener.key) {
          expect(state[other.key as keyof typeof state]).toBe(false);
        }
      }
    });
  }

  it('closing a modal does not re-open others', () => {
    useUIStore.getState().setShowSettingsDialog(true);
    useUIStore.getState().setShowSettingsDialog(false);

    const state = useUIStore.getState();
    expect(state.showSettingsDialog).toBe(false);
    expect(state.showKeyboardShortcutsDialog).toBe(false);
    expect(state.showExportDialog).toBe(false);
  });

  it('toggleCommandPalette opens with mutual exclusion', () => {
    useUIStore.getState().setShowSettingsDialog(true);
    expect(useUIStore.getState().showSettingsDialog).toBe(true);

    useUIStore.getState().toggleCommandPalette();
    expect(useUIStore.getState().showCommandPalette).toBe(true);
    expect(useUIStore.getState().showSettingsDialog).toBe(false);
  });
});
