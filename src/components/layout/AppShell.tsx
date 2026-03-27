import { lazy, Suspense, useEffect } from 'react';
import { Toolbar } from './Toolbar';
import { Timeline } from '../timeline/Timeline';
import { GenerationPanel } from '../generation/GenerationPanel';
import { AddLayerPanel } from '../generation/AddLayerPanel';
import { GenerationSidePanel } from '../generation/GenerationSidePanel';
import { NewProjectDialog } from '../dialogs/NewProjectDialog';
import { LoopBrowser } from '../assets/LoopBrowser';
import { SmartControlsPanel } from '../controls/SmartControlsPanel';
import { SharedProjectPage } from '../sharing/SharedProjectPage';
import { ToastContainer } from '../ui/Toast';
import { UndoHistoryPanel } from './UndoHistoryPanel';
import { StatusBar } from './StatusBar';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useEffectsSync } from '../../hooks/useEffectsSync';
import { useVST3Connection } from '../../hooks/useVST3Connection';
import { useVST3Sync } from '../../hooks/useVST3Sync';
import { VST3SidePanel } from '../plugins/VST3SidePanel';
import { useShareLink } from '../../hooks/useShareLink';
import { AudioContextOverlay } from './AudioContextOverlay';

// Lazy-loaded dialogs (code-split, loaded on first use)
const InstrumentPicker = lazy(() => import('../dialogs/InstrumentPicker').then(m => ({ default: m.InstrumentPicker })));
const ExportDialog = lazy(() => import('../dialogs/ExportDialog').then(m => ({ default: m.ExportDialog })));
const SettingsDialog = lazy(() => import('../dialogs/SettingsDialog').then(m => ({ default: m.SettingsDialog })));
const ProjectListDialog = lazy(() => import('../dialogs/ProjectListDialog').then(m => ({ default: m.ProjectListDialog })));
const KeyboardShortcutsDialog = lazy(() => import('../dialogs/KeyboardShortcutsDialog').then(m => ({ default: m.KeyboardShortcutsDialog })));
const ShortcutEditorDialog = lazy(() => import('../dialogs/ShortcutEditorDialog').then(m => ({ default: m.ShortcutEditorDialog })));
const CommandPalette = lazy(() => import('../dialogs/CommandPalette').then(m => ({ default: m.CommandPalette })));
const BounceInPlaceDialog = lazy(() => import('../dialogs/BounceInPlaceDialog').then(m => ({ default: m.BounceInPlaceDialog })));
const DeleteTracksConfirmDialog = lazy(() => import('../dialogs/DeleteTracksConfirmDialog').then(m => ({ default: m.DeleteTracksConfirmDialog })));
const ShareDialog = lazy(() => import('../dialogs/ShareDialog').then(m => ({ default: m.ShareDialog })));
const AIAssistantPanel = lazy(() => import('../dialogs/AIAssistantPanel').then(m => ({ default: m.AIAssistantPanel })));
const EnhancePanel = lazy(() => import('../generation/EnhancePanel').then(m => ({ default: m.EnhancePanel })));
const Vocal2BGMModal = lazy(() => import('../generation/Vocal2BGMModal').then(m => ({ default: m.Vocal2BGMModal })));
const AudioAnalysisPanel = lazy(() => import('../generation/AudioAnalysisPanel').then(m => ({ default: m.AudioAnalysisPanel })));
const StemSeparationModal = lazy(() => import('../generation/StemSeparationModal').then(m => ({ default: m.StemSeparationModal })));
const AudioToMidiModal = lazy(() => import('../generation/AudioToMidiModal').then(m => ({ default: m.AudioToMidiModal })));

// Lazy-loaded heavy panels (code-split, loaded on first use)
const MixerPanel = lazy(() => import('../mixer/MixerPanel').then(m => ({ default: m.MixerPanel })));
const SequencerEditor = lazy(() => import('../sequencer/SequencerEditor').then(m => ({ default: m.SequencerEditor })));
const DrumMachineEditor = lazy(() => import('../sequencer/DrumMachineEditor').then(m => ({ default: m.DrumMachineEditor })));
const PianoRoll = lazy(() => import('../pianoroll/PianoRoll').then(m => ({ default: m.PianoRoll })));
const StrudelEditor = lazy(() => import('../strudel/StrudelEditor').then(m => ({ default: m.StrudelEditor })));
const EffectChain = lazy(() => import('../mixer/EffectChain').then(m => ({ default: m.EffectChain })));
const SessionView = lazy(() => import('../session/SessionView').then(m => ({ default: m.SessionView })));
const ModelLibraryPanel = lazy(() => import('../models/ModelLibraryPanel').then(m => ({ default: m.ModelLibraryPanel })));
const VirtualKeyboard = lazy(() => import('../midi/VirtualKeyboard').then(m => ({ default: m.VirtualKeyboard })));

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
  const showMixer = useUIStore((s) => s.showMixer);
  const showSmartControls = useUIStore((s) => s.showSmartControls);
  const openSequencerTrackId = useUIStore((s) => s.openSequencerTrackId);
  const openDrumMachineTrackId = useUIStore((s) => s.openDrumMachineTrackId);
  const strudelPanelOpen = useUIStore((s) => s.strudelPanelOpen);
  const openPianoRollTrackId = useUIStore((s) => s.openPianoRollTrackId);
  const openEffectChainTrackId = useUIStore((s) => s.openEffectChainTrackId);
  const openMidiEffectChainTrackId = useUIStore((s) => s.openMidiEffectChainTrackId);
  const showModelLibrary = useUIStore((s) => s.showModelLibrary);
  const showVirtualKeyboard = useUIStore((s) => s.showVirtualKeyboard);

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
  useVST3Connection();
  useVST3Sync();

  return (
    <div
      className="flex flex-col h-screen min-w-[900px] bg-daw-bg text-zinc-300"
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
        {mainView === 'arrangement' ? <Timeline /> : <Suspense fallback={null}><SessionView /></Suspense>}
        {project && <LoopBrowser />}
      </div>

      <StatusBar />

      {project && showSmartControls && <SmartControlsPanel />}
      {project && openSequencerTrackId && <Suspense fallback={null}><SequencerEditor /></Suspense>}
      {project && openDrumMachineTrackId && <Suspense fallback={null}><DrumMachineEditor /></Suspense>}
      {project && openPianoRollTrackId && <Suspense fallback={null}><PianoRoll /></Suspense>}
      {project && strudelPanelOpen && <Suspense fallback={null}><StrudelEditor /></Suspense>}
      {project && (openEffectChainTrackId || openMidiEffectChainTrackId) && <Suspense fallback={null}><EffectChain /></Suspense>}
      {project && showMixer && <Suspense fallback={null}><MixerPanel /></Suspense>}
      {project && <GenerationPanel />}
      {project && <GenerationSidePanel />}
      {project && <VST3SidePanel />}
      {project && showModelLibrary && <Suspense fallback={null}><ModelLibraryPanel /></Suspense>}
      {project && showVirtualKeyboard && <Suspense fallback={null}><VirtualKeyboard /></Suspense>}
      {project && <AddLayerPanel />}
      <ToastContainer />
      <UndoHistoryPanel />

      {/* Modals — lazy-loaded, code-split */}
      <NewProjectDialog />
      <Suspense fallback={null}>
        <InstrumentPicker />
        <ExportDialog />
        <SettingsDialog />
        <ProjectListDialog />
        <BounceInPlaceDialog />
        <DeleteTracksConfirmDialog />
        <KeyboardShortcutsDialog />
        <ShortcutEditorDialog />
        <EnhancePanel />
        <Vocal2BGMModal />
        <AudioAnalysisPanel />
        <StemSeparationModal />
        <AudioToMidiModal />
        <ShareDialog />
      </Suspense>
      {!hasBlockingDialog && <Suspense fallback={null}><CommandPalette /></Suspense>}
      {!hasBlockingDialog && <Suspense fallback={null}><AIAssistantPanel /></Suspense>}
      <AudioContextOverlay />
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
