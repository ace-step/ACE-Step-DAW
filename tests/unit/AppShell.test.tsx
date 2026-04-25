import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppShell } from '../../src/components/layout/AppShell';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';

vi.mock('../../src/components/layout/Toolbar', () => ({ Toolbar: () => <div>Toolbar</div> }));
vi.mock('../../src/components/layout/StatusBar', () => ({ StatusBar: () => <div>StatusBar</div> }));
vi.mock('../../src/components/tracks/TrackList', () => ({ TrackList: () => <div>TrackList</div> }));
vi.mock('../../src/components/timeline/Timeline', () => ({ Timeline: () => <div>Timeline</div> }));
vi.mock('../../src/components/generation/GenerationPanel', () => ({ GenerationPanel: () => <div>GenerationPanel</div> }));
vi.mock('../../src/components/generation/GenerationSidePanel', () => ({ GenerationSidePanel: () => <div>GenerationSidePanel</div> }));
vi.mock('../../src/components/generation/GenerationHistoryPanel', () => ({ GenerationHistoryPanel: () => <div>GenerationHistoryPanel</div> }));
vi.mock('../../src/components/generation/CoverModal', () => ({ CoverModal: () => <div>CoverModal</div> }));
vi.mock('../../src/components/generation/RepaintModal', () => ({ RepaintModal: () => <div>RepaintModal</div> }));
vi.mock('../../src/components/generation/Vocal2BGMModal', () => ({ Vocal2BGMModal: () => <div>Vocal2BGMModal</div> }));
vi.mock('../../src/components/generation/AudioAnalysisPanel', () => ({ AudioAnalysisPanel: () => <div>AudioAnalysisPanel</div> }));
vi.mock('../../src/components/generation/StemSeparationModal', () => ({ StemSeparationModal: () => <div>StemSeparationModal</div> }));
vi.mock('../../src/components/generation/AudioToMidiModal', () => ({ AudioToMidiModal: () => <div>AudioToMidiModal</div> }));
vi.mock('../../src/components/dialogs/NewProjectDialog', () => ({ NewProjectDialog: () => <div>NewProjectDialog</div> }));
vi.mock('../../src/components/dialogs/InstrumentPicker', () => ({ InstrumentPicker: () => <div>InstrumentPicker</div> }));
vi.mock('../../src/components/dialogs/ExportDialog', () => ({ ExportDialog: () => <div>ExportDialog</div> }));
vi.mock('../../src/components/dialogs/SettingsDialog', () => ({ SettingsDialog: () => <div>SettingsDialog</div> }));
vi.mock('../../src/components/dialogs/ProjectListDialog', () => ({ ProjectListDialog: () => <div>ProjectListDialog</div> }));
vi.mock('../../src/components/dialogs/KeyboardShortcutsDialog', () => ({ KeyboardShortcutsDialog: () => <div>KeyboardShortcutsDialog</div> }));
vi.mock('../../src/components/dialogs/ShortcutEditorDialog', () => ({ ShortcutEditorDialog: () => <div>ShortcutEditorDialog</div> }));
vi.mock('../../src/components/dialogs/CommandPalette', () => ({ CommandPalette: () => <div>CommandPalette</div> }));
vi.mock('../../src/components/dialogs/BounceInPlaceDialog', () => ({ BounceInPlaceDialog: () => <div>BounceInPlaceDialog</div> }));
vi.mock('../../src/components/dialogs/DeleteTracksConfirmDialog', () => ({ DeleteTracksConfirmDialog: () => <div>DeleteTracksConfirmDialog</div> }));
vi.mock('../../src/components/dialogs/ShareDialog', () => ({ ShareDialog: () => <div>ShareDialog</div> }));
vi.mock('../../src/components/terminal/ClaudeTerminal', () => ({ ClaudeTerminal: () => <div>ClaudeTerminal</div> }));
vi.mock('../../src/components/mixer/MixerPanel', () => ({ MixerPanel: () => <div>MixerPanel</div> }));
vi.mock('../../src/components/assets/LoopBrowser', () => ({ LoopBrowser: () => <div>LoopBrowser</div> }));
vi.mock('../../src/components/sequencer/SequencerEditor', () => ({ SequencerEditor: () => <div>SequencerEditor</div> }));
vi.mock('../../src/components/sequencer/DrumMachineEditor', () => ({ DrumMachineEditor: () => <div>DrumMachineEditor</div> }));
vi.mock('../../src/components/controls/SmartControlsPanel', () => ({ SmartControlsPanel: () => <div>SmartControlsPanel</div> }));
vi.mock('../../src/components/pianoroll/PianoRoll', () => ({ PianoRoll: () => <div>PianoRoll</div> }));
vi.mock('../../src/components/mixer/EffectChain', () => ({ EffectChain: () => <div>EffectChain</div> }));
vi.mock('../../src/components/session/SessionView', () => ({ SessionView: () => <div>SessionView</div> }));
vi.mock('../../src/components/midi/VirtualKeyboard', () => ({ VirtualKeyboard: () => <div>VirtualKeyboard</div> }));
vi.mock('../../src/components/ui/Toast', () => ({ ToastContainer: () => <div>ToastContainer</div> }));
vi.mock('../../src/components/layout/UndoHistoryPanel', () => ({ UndoHistoryPanel: () => <div>UndoHistoryPanel</div> }));
vi.mock('../../src/hooks/useAudioEngine', () => ({ useAudioEngine: () => ({ resumeOnGesture: vi.fn().mockResolvedValue(undefined) }) }));
vi.mock('../../src/hooks/useKeyboardShortcuts', () => ({ useKeyboardShortcuts: vi.fn() }));
vi.mock('../../src/hooks/useEffectsSync', () => ({ useEffectsSync: vi.fn() }));
vi.mock('../../src/hooks/useShareLink', () => ({ useShareLink: vi.fn() }));
vi.mock('../../src/hooks/useReducedMotion', () => ({ useReducedMotionSync: vi.fn() }));
vi.mock('../../src/hooks/useAccessibilitySync', () => ({ useAccessibilitySync: vi.fn() }));
vi.mock('../../src/hooks/useVST3Connection', () => ({ useVST3Connection: vi.fn() }));
vi.mock('../../src/hooks/useVST3Sync', () => ({ useVST3Sync: vi.fn() }));
vi.mock('../../src/hooks/useAutoSave', () => ({ useAutoSave: () => ({ status: 'saved', saveNow: vi.fn(), lastSavedAt: null }) }));
vi.mock('../../src/hooks/useOnboardingTracking', () => ({ useOnboardingTracking: vi.fn() }));
vi.mock('../../src/components/layout/AudioContextOverlay', () => ({ AudioContextOverlay: () => null }));
vi.mock('../../src/components/dialogs/WelcomeOverlay', () => ({ WelcomeOverlay: () => null }));
vi.mock('../../src/components/ui/BottomPanelTransition', () => ({ BottomPanelTransition: ({ show, children }: { show: boolean; children: React.ReactNode }) => show ? <>{children}</> : null }));
vi.mock('../../src/components/ui/PanelSkeleton', () => ({ PanelSkeleton: () => null }));
vi.mock('../../src/components/ui/SkipLinks', () => ({ SkipLinks: () => null }));
vi.mock('../../src/components/sharing/SharedProjectPage', () => ({ SharedProjectPage: () => null }));
vi.mock('../../src/components/arrangement/ArrangementAssistantPanel', () => ({ ArrangementAssistantPanel: () => null }));
vi.mock('../../src/components/timeline/ClipInspectorPanel', () => ({ ClipInspectorPanel: () => null }));
vi.mock('../../src/components/plugins/VST3SidePanel', () => ({ VST3SidePanel: () => null }));
vi.mock('../../src/components/generation/AddLayerPanel', () => ({ AddLayerPanel: () => null }));
vi.mock('../../src/components/generation/EnhancePanel', () => ({ EnhancePanel: () => null }));
vi.mock('../../src/components/generation/HumToSongModal', () => ({ HumToSongModal: () => null }));
vi.mock('../../src/components/generation/VocalReplacementModal', () => ({ VocalReplacementModal: () => null }));
vi.mock('../../src/components/dialogs/VideoExportDialog', () => ({ VideoExportDialog: () => null }));
vi.mock('../../src/components/recording/RecordingOverlay', () => ({ RecordingOverlay: () => null }));
vi.mock('../../src/components/strudel/StrudelEditor', () => ({ StrudelEditor: () => null }));
vi.mock('../../src/components/models/ModelLibraryPanel', () => ({ ModelLibraryPanel: () => null }));
vi.mock('../../src/components/models/CustomModelsPanel', () => ({ CustomModelsPanel: () => null }));

describe('AppShell overlay orchestration', () => {
  beforeEach(() => {
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'Overlay Test' });
  });

  it('hides command surfaces while a blocking dialog is open', () => {
    useUIStore.setState({
      showCommandPalette: true,
      showAIAssistant: true,
      showSettingsDialog: true,
    });

    render(<AppShell />);

    expect(screen.queryByText('CommandPalette')).not.toBeInTheDocument();
    expect(screen.queryByText('ClaudeTerminal')).not.toBeInTheDocument();
  });
});

describe('AppShell dialog lazy loading', () => {
  beforeEach(() => {
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'Lazy Test' });
  });

  it('uses React.lazy for dialog components (not static imports)', async () => {
    // EditorShell now contains lazy loading — AppShell lazy-loads EditorShell itself
    const editorShellModule = await import('../../src/components/layout/EditorShell?raw');
    const source = editorShellModule.default as string;

    // NewProjectDialog should remain eager (needed on first load)
    expect(source).toMatch(/import\s*\{\s*NewProjectDialog\s*\}/);

    // All other dialogs should be lazy-loaded
    const lazyDialogs = [
      'ExportDialog',
      'SettingsDialog',
      'InstrumentPicker',
      'ProjectListDialog',
      'KeyboardShortcutsDialog',
      'ShortcutEditorDialog',
      'CommandPalette',
      'BounceInPlaceDialog',
      'DeleteTracksConfirmDialog',
      'ShareDialog',
      'ClaudeTerminal',
      'EnhancePanel',
      'Vocal2BGMModal',
      'AudioAnalysisPanel',
      'StemSeparationModal',
      'AudioToMidiModal',
    ];

    for (const name of lazyDialogs) {
      expect(source, `${name} should use lazy()`).toMatch(
        new RegExp(`const\\s+${name}\\s*=\\s*lazy\\(`)
      );
    }
  });

  it('uses React.lazy for heavy panels', async () => {
    const editorShellModule = await import('../../src/components/layout/EditorShell?raw');
    const source = editorShellModule.default as string;

    const lazyPanels = [
      'PianoRoll',
      'StrudelEditor',
      'EffectChain',
      'MixerPanel',
      'SequencerEditor',
      'DrumMachineEditor',
      'ModelLibraryPanel',
      'VirtualKeyboard',
      'SessionView',
    ];

    for (const name of lazyPanels) {
      expect(source, `${name} should use lazy()`).toMatch(
        new RegExp(`const\\s+${name}\\s*=\\s*lazy\\(`)
      );
    }
  });

  it('wraps lazy components in Suspense', async () => {
    const editorShellModule = await import('../../src/components/layout/EditorShell?raw');
    const source = editorShellModule.default as string;

    // Should import Suspense and lazy from react
    expect(source).toMatch(/import\s*\{[^}]*lazy[^}]*\}\s*from\s*['"]react['"]/);
    expect(source).toMatch(/import\s*\{[^}]*Suspense[^}]*\}\s*from\s*['"]react['"]/);

    // Should have Suspense wrappers
    expect(source).toContain('<Suspense');
  });

  it('lazy-loads EditorShell from AppShell', async () => {
    const appShellModule = await import('../../src/components/layout/AppShell?raw');
    const source = appShellModule.default as string;

    // AppShell should lazy-load EditorShell
    expect(source).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(['"]\.\/EditorShell['"]\)/);
  });

  it('still renders the app shell structure correctly', async () => {
    render(<AppShell />);

    // EditorShell is lazy-loaded, need to wait for it
    expect(await screen.findByText('Toolbar')).toBeInTheDocument();
    expect(screen.getByText('StatusBar')).toBeInTheDocument();
    expect(screen.getByRole('application')).toHaveAttribute('aria-label', 'ACE-Step DAW');
  });
});
