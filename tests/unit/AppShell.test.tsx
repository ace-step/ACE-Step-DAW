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
vi.mock('../../src/components/dialogs/ShareDialog', () => ({ ShareDialog: () => <div>ShareDialog</div> }));
vi.mock('../../src/components/dialogs/AIAssistantPanel', () => ({ AIAssistantPanel: () => <div>AIAssistantPanel</div> }));
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
    expect(screen.queryByText('AIAssistantPanel')).not.toBeInTheDocument();
  });
});
