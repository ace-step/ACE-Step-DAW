import { useEffect } from 'react';
import { Toolbar } from './Toolbar';
import { StatusBar } from './StatusBar';
import { TrackList } from '../tracks/TrackList';
import { Timeline } from '../timeline/Timeline';
import { GenerationPanel } from '../generation/GenerationPanel';
import { AddLayerPanel } from '../generation/AddLayerPanel';
import { GenerationSidePanel } from '../generation/GenerationSidePanel';
import { GenerationHistoryPanel } from '../generation/GenerationHistoryPanel';
import { CoverModal } from '../generation/CoverModal';
import { MusicEnhancerPanel } from '../generation/MusicEnhancerPanel';
import { RepaintModal } from '../generation/RepaintModal';
import { Vocal2BGMModal } from '../generation/Vocal2BGMModal';
import { AudioAnalysisPanel } from '../generation/AudioAnalysisPanel';
import { StemSeparationModal } from '../generation/StemSeparationModal';
import { AudioToMidiModal } from '../generation/AudioToMidiModal';
import { NewProjectDialog } from '../dialogs/NewProjectDialog';
import { InstrumentPicker } from '../dialogs/InstrumentPicker';
import { ExportDialog } from '../dialogs/ExportDialog';
import { SettingsDialog } from '../dialogs/SettingsDialog';
import { ProjectListDialog } from '../dialogs/ProjectListDialog';
import { KeyboardShortcutsDialog } from '../dialogs/KeyboardShortcutsDialog';
import { ShortcutEditorDialog } from '../dialogs/ShortcutEditorDialog';
import { CommandPalette } from '../dialogs/CommandPalette';
import { BounceInPlaceDialog } from '../dialogs/BounceInPlaceDialog';
import { ShareDialog } from '../dialogs/ShareDialog';
import { AIAssistantPanel } from '../dialogs/AIAssistantPanel';
import { MixerPanel } from '../mixer/MixerPanel';
import { LoopBrowser } from '../assets/LoopBrowser';
import { SequencerEditor } from '../sequencer/SequencerEditor';
import { DrumMachineEditor } from '../sequencer/DrumMachineEditor';
import { SmartControlsPanel } from '../controls/SmartControlsPanel';
import { PianoRoll } from '../pianoroll/PianoRoll';
import { EffectChain } from '../mixer/EffectChain';
import { SessionView } from '../session/SessionView';
import { ModelLibraryPanel } from '../models/ModelLibraryPanel';
import { SharedProjectPage } from '../sharing/SharedProjectPage';
import { VirtualKeyboard } from '../midi/VirtualKeyboard';
import { ToastContainer } from '../ui/Toast';
import { UndoHistoryPanel } from './UndoHistoryPanel';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useEffectsSync } from '../../hooks/useEffectsSync';
import { useShareLink } from '../../hooks/useShareLink';

function EditorShell() {
  useAudioEngine();
  const project = useProjectStore((s) => s.project);
  const setShowNewProjectDialog = useUIStore((s) => s.setShowNewProjectDialog);
  const setHistoryFocusScope = useUIStore((s) => s.setHistoryFocusScope);
  const mainView = useUIStore((s) => s.mainView);
  const showNewProjectDialog = useUIStore((s) => s.showNewProjectDialog);
  const showInstrumentPicker = useUIStore((s) => s.showInstrumentPicker);
  const showExportDialog = useUIStore((s) => s.showExportDialog);
  const showSettingsDialog = useUIStore((s) => s.showSettingsDialog);
  const showProjectListDialog = useUIStore((s) => s.showProjectListDialog);
  const bounceInPlaceTrackId = useUIStore((s) => s.bounceInPlaceTrackId);
  const showKeyboardShortcutsDialog = useUIStore((s) => s.showKeyboardShortcutsDialog);
  const showShortcutEditorDialog = useUIStore((s) => s.showShortcutEditorDialog);

  const hasBlockingDialog =
    showNewProjectDialog ||
    showInstrumentPicker ||
    showExportDialog ||
    showSettingsDialog ||
    showProjectListDialog ||
    bounceInPlaceTrackId !== null ||
    showKeyboardShortcutsDialog ||
    showShortcutEditorDialog;

  // Show new-project dialog on first load when no project exists
  useEffect(() => {
    if (!project) {
      setShowNewProjectDialog(true);
    }
  }, [project, setShowNewProjectDialog]);

  // Warn before closing tab with unsaved project
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (project) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [project]);

  useKeyboardShortcuts();
  useEffectsSync();

  return (
    <div
      className="flex flex-col h-screen bg-daw-bg text-zinc-300"
      role="application"
      aria-label="ACE-Step DAW"
      tabIndex={-1}
    >
      <Toolbar />

      <div
        className="flex flex-1 min-h-0"
        onMouseDownCapture={() => {
          if (mainView === 'arrangement') {
            setHistoryFocusScope('arrangement');
          }
        }}
      >
        {project && mainView === 'arrangement' && <TrackList />}
        {mainView === 'arrangement' ? <Timeline /> : <SessionView />}
        {project && <LoopBrowser />}
      </div>

      {project && <SmartControlsPanel />}
      {project && <SequencerEditor />}
      {project && <DrumMachineEditor />}
      {project && <PianoRoll />}
      {project && <EffectChain />}
      {project && <MixerPanel />}
      {project && <GenerationPanel />}
      {project && <GenerationSidePanel />}
      {project && <GenerationHistoryPanel />}
      {project && <ModelLibraryPanel />}
      {project && <VirtualKeyboard />}
      {project && <AddLayerPanel />}
      <StatusBar />
      <ToastContainer />
      <UndoHistoryPanel />

      {/* Modals */}
      <NewProjectDialog />
      <InstrumentPicker />
      <ExportDialog />
      <SettingsDialog />
      <ProjectListDialog />
      <BounceInPlaceDialog />
      <KeyboardShortcutsDialog />
      {!hasBlockingDialog && <CommandPalette />}
      <ShortcutEditorDialog />
      <CoverModal />
      <MusicEnhancerPanel />
      <RepaintModal />
      <Vocal2BGMModal />
      <AudioAnalysisPanel />
      <StemSeparationModal />
      <AudioToMidiModal />
      <ShareDialog />
      {!hasBlockingDialog && <AIAssistantPanel />}
    </div>
  );
}

export function AppShell() {
  const shareLinkState = useShareLink() ?? { sharedProject: null, loadingSharedProject: false };
  const { sharedProject, loadingSharedProject } = shareLinkState;

  if (loadingSharedProject) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-daw-bg text-zinc-200">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-5 text-sm">
          Loading shared stem player...
        </div>
      </div>
    );
  }

  if (sharedProject) {
    return <SharedProjectPage sharedProject={sharedProject} />;
  }

  return <EditorShell />;
}
