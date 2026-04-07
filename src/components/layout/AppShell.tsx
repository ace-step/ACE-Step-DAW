import { lazy, Suspense, useEffect } from 'react';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { Toolbar } from './Toolbar';
import { Timeline } from '../timeline/Timeline';
import { GenerationPanel } from '../generation/GenerationPanel';
import { AddLayerPanel } from '../generation/AddLayerPanel';
import { GenerationSidePanel } from '../generation/GenerationSidePanel';
import { ArrangementAssistantPanel } from '../arrangement/ArrangementAssistantPanel';
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
import { useAutoSave } from '../../hooks/useAutoSave';
import { WelcomeOverlay } from '../dialogs/WelcomeOverlay';
import { useOnboardingTracking } from '../../hooks/useOnboardingTracking';
import { BottomPanelTransition } from '../ui/BottomPanelTransition';
import { PanelSkeleton } from '../ui/PanelSkeleton';

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
const VideoExportDialog = lazy(() => import('../dialogs/VideoExportDialog').then(m => ({ default: m.VideoExportDialog })));
const RecordingOverlay = lazy(() => import('../recording/RecordingOverlay').then(m => ({ default: m.RecordingOverlay })));
const ClaudeTerminal = lazy(() => import('../terminal/ClaudeTerminal').then(m => ({ default: m.ClaudeTerminal })));
const EnhancePanel = lazy(() => import('../generation/EnhancePanel').then(m => ({ default: m.EnhancePanel })));
const Vocal2BGMModal = lazy(() => import('../generation/Vocal2BGMModal').then(m => ({ default: m.Vocal2BGMModal })));
const AudioAnalysisPanel = lazy(() => import('../generation/AudioAnalysisPanel').then(m => ({ default: m.AudioAnalysisPanel })));
const StemSeparationModal = lazy(() => import('../generation/StemSeparationModal').then(m => ({ default: m.StemSeparationModal })));
const AudioToMidiModal = lazy(() => import('../generation/AudioToMidiModal').then(m => ({ default: m.AudioToMidiModal })));
const HumToSongModal = lazy(() => import('../generation/HumToSongModal').then(m => ({ default: m.HumToSongModal })));
const VocalReplacementModal = lazy(() => import('../generation/VocalReplacementModal').then(m => ({ default: m.VocalReplacementModal })));

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
  useOnboardingTracking();
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

  // Auto-save to IndexedDB with dirty detection and beforeunload warning
  const { status: saveStatus, saveNow, lastSavedAt } = useAutoSave();

  // Cmd/Ctrl+S — immediate save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        void saveNow();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [saveNow]);

  // Unsaved changes indicator in document title
  useEffect(() => {
    const projectName = project?.name ?? 'ACE-Step DAW';
    document.title = saveStatus === 'unsaved' ? `● ${projectName}` : projectName;
    return () => { document.title = 'ACE-Step DAW'; };
  }, [saveStatus, project?.name]);

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
        <ErrorBoundary name="Timeline">
          {mainView === 'arrangement' ? <Timeline /> : <Suspense fallback={null}><SessionView /></Suspense>}
        </ErrorBoundary>
        {project && <LoopBrowser />}
      </div>

      <StatusBar saveStatus={saveStatus} lastSavedAt={lastSavedAt} />

      {project && showSmartControls && <SmartControlsPanel />}
      <BottomPanelTransition show={!!project && !!openSequencerTrackId}>
        <ErrorBoundary name="Sequencer"><Suspense fallback={<PanelSkeleton variant="editor" />}><SequencerEditor /></Suspense></ErrorBoundary>
      </BottomPanelTransition>
      <BottomPanelTransition show={!!project && !!openDrumMachineTrackId}>
        <ErrorBoundary name="DrumMachine"><Suspense fallback={<PanelSkeleton variant="editor" />}><DrumMachineEditor /></Suspense></ErrorBoundary>
      </BottomPanelTransition>
      <BottomPanelTransition show={!!project && !!openPianoRollTrackId}>
        <ErrorBoundary name="PianoRoll"><Suspense fallback={<PanelSkeleton variant="pianoRoll" />}><PianoRoll /></Suspense></ErrorBoundary>
      </BottomPanelTransition>
      <BottomPanelTransition show={!!project && strudelPanelOpen}>
        <ErrorBoundary name="StrudelEditor"><Suspense fallback={null}><StrudelEditor /></Suspense></ErrorBoundary>
      </BottomPanelTransition>
      <BottomPanelTransition show={!!project && !!(openEffectChainTrackId || openMidiEffectChainTrackId)}>
        <ErrorBoundary name="EffectChain"><Suspense fallback={<PanelSkeleton variant="effects" />}><EffectChain /></Suspense></ErrorBoundary>
      </BottomPanelTransition>
      <BottomPanelTransition show={!!project && showMixer}>
        <ErrorBoundary name="Mixer"><Suspense fallback={<PanelSkeleton variant="mixer" />}><MixerPanel /></Suspense></ErrorBoundary>
      </BottomPanelTransition>
      {project && <ErrorBoundary name="Generation"><GenerationPanel /></ErrorBoundary>}
      {project && <ErrorBoundary name="GenerationSidePanel"><GenerationSidePanel /></ErrorBoundary>}
      {project && <ErrorBoundary name="ArrangementAssistant"><ArrangementAssistantPanel /></ErrorBoundary>}
      {project && <VST3SidePanel />}
      {project && showModelLibrary && <Suspense fallback={null}><ModelLibraryPanel /></Suspense>}
      {project && showVirtualKeyboard && <Suspense fallback={null}><VirtualKeyboard /></Suspense>}
      {project && <AddLayerPanel />}
      <ToastContainer />
      <UndoHistoryPanel />
      <WelcomeOverlay />

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
        <HumToSongModal />
        <VocalReplacementModal />
        <ShareDialog />
        <VideoExportDialog />
        <RecordingOverlay />
      </Suspense>
      {!hasBlockingDialog && <Suspense fallback={null}><CommandPalette /></Suspense>}
      {!hasBlockingDialog && <Suspense fallback={null}><ClaudeTerminal /></Suspense>}
    </div>
  );
}

export function AppShell() {
  const shareLinkState = useShareLink() ?? { sharedProject: null, loadingSharedProject: false };
  const { sharedProject, loadingSharedProject } = shareLinkState;

  if (loadingSharedProject) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-daw-bg text-zinc-200">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-8 py-6">
          <svg className="w-5 h-5 animate-spin text-daw-accent" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
            <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="text-sm text-zinc-300">Loading shared stem player...</span>
        </div>
      </div>
    );
  }

  if (sharedProject) {
    return <SharedProjectPage sharedProject={sharedProject} />;
  }

  return (
    <ErrorBoundary name="DAW">
      <EditorShell />
    </ErrorBoundary>
  );
}
