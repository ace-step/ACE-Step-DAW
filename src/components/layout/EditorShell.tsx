import { lazy, Suspense, useEffect } from 'react';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { Toolbar } from './Toolbar';
import { NewProjectDialog } from '../dialogs/NewProjectDialog';
import { ToastContainer } from '../ui/Toast';
import { UndoHistoryPanel } from './UndoHistoryPanel';
import { StatusBar } from './StatusBar';
import { SkipLinks } from '../ui/SkipLinks';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useReducedMotionSync } from '../../hooks/useReducedMotion';
import { useAccessibilitySync } from '../../hooks/useAccessibilitySync';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useEffectsSync } from '../../hooks/useEffectsSync';
import { useVST3Connection } from '../../hooks/useVST3Connection';
import { useVST3Sync } from '../../hooks/useVST3Sync';
import { useAutoSave } from '../../hooks/useAutoSave';
import { WelcomeOverlay } from '../dialogs/WelcomeOverlay';
import { useOnboardingTracking } from '../../hooks/useOnboardingTracking';
import { BottomPanelTransition } from '../ui/BottomPanelTransition';
import { PanelSkeleton } from '../ui/PanelSkeleton';

// Lazy-loaded main views (code-split, loaded when project opens)
const Timeline = lazy(() => import('../timeline/Timeline').then(m => ({ default: m.Timeline })));

// Lazy-loaded panels (code-split, loaded when project opens)
const GenerationPanel = lazy(() => import('../generation/GenerationPanel').then(m => ({ default: m.GenerationPanel })));
const AddLayerPanel = lazy(() => import('../generation/AddLayerPanel').then(m => ({ default: m.AddLayerPanel })));
const GenerationSidePanel = lazy(() => import('../generation/GenerationSidePanel').then(m => ({ default: m.GenerationSidePanel })));
const ArrangementAssistantPanel = lazy(() => import('../arrangement/ArrangementAssistantPanel').then(m => ({ default: m.ArrangementAssistantPanel })));
const ClipInspectorPanel = lazy(() => import('../timeline/ClipInspectorPanel').then(m => ({ default: m.ClipInspectorPanel })));
const LoopBrowser = lazy(() => import('../assets/LoopBrowser').then(m => ({ default: m.LoopBrowser })));
const SmartControlsPanel = lazy(() => import('../controls/SmartControlsPanel').then(m => ({ default: m.SmartControlsPanel })));
const VST3SidePanel = lazy(() => import('../plugins/VST3SidePanel').then(m => ({ default: m.VST3SidePanel })));

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
const CustomModelsPanel = lazy(() => import('../models/CustomModelsPanel').then(m => ({ default: m.CustomModelsPanel })));
const VirtualKeyboard = lazy(() => import('../midi/VirtualKeyboard').then(m => ({ default: m.VirtualKeyboard })));

export function EditorShell() {
  useAudioEngine();
  useReducedMotionSync();
  useAccessibilitySync();
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
  const showCustomModels = useUIStore((s) => s.showCustomModels);
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
      className="flex flex-col h-screen min-w-[900px] overflow-hidden bg-daw-bg text-zinc-300"
      role="application"
      aria-label="ACE-Step DAW"
      tabIndex={-1}
    >
      <SkipLinks />
      <Toolbar />

      <section
        id="main-content"
        className="flex flex-1 min-h-0 min-w-0"
        tabIndex={-1}
        aria-label={mainView === 'arrangement' ? 'Arrangement timeline' : 'Session view'}
        onMouseDownCapture={() => {
          if (mainView === 'arrangement') {
            setHistoryFocusScope('arrangement');
          }
        }}
      >
        <ErrorBoundary name="Timeline">
          <div id="timeline-region" className="flex flex-col flex-1 min-h-0 min-w-0" tabIndex={-1}>
            {mainView === 'arrangement' ? <Suspense fallback={<PanelSkeleton variant="editor" />}><Timeline /></Suspense> : <Suspense fallback={null}><SessionView /></Suspense>}
          </div>
        </ErrorBoundary>
        {project && <Suspense fallback={null}><LoopBrowser /></Suspense>}
      </section>

      <StatusBar saveStatus={saveStatus} lastSavedAt={lastSavedAt} />

      {project && showSmartControls && <Suspense fallback={null}><SmartControlsPanel /></Suspense>}
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
      <div id="mixer-region" tabIndex={-1}>
        <BottomPanelTransition show={!!project && showMixer}>
          <ErrorBoundary name="Mixer"><Suspense fallback={<PanelSkeleton variant="mixer" />}><MixerPanel /></Suspense></ErrorBoundary>
        </BottomPanelTransition>
      </div>
      {project && <ErrorBoundary name="Generation"><Suspense fallback={null}><GenerationPanel /></Suspense></ErrorBoundary>}
      {project && <ErrorBoundary name="GenerationSidePanel"><Suspense fallback={null}><GenerationSidePanel /></Suspense></ErrorBoundary>}
      {project && <ErrorBoundary name="ArrangementAssistant"><Suspense fallback={null}><ArrangementAssistantPanel /></Suspense></ErrorBoundary>}
      {project && <ErrorBoundary name="ClipInspector"><Suspense fallback={null}><ClipInspectorPanel /></Suspense></ErrorBoundary>}
      {project && <Suspense fallback={null}><VST3SidePanel /></Suspense>}
      {project && showModelLibrary && <Suspense fallback={null}><ModelLibraryPanel /></Suspense>}
      {project && showCustomModels && <Suspense fallback={null}><CustomModelsPanel /></Suspense>}
      {project && showVirtualKeyboard && <Suspense fallback={null}><VirtualKeyboard /></Suspense>}
      {project && <Suspense fallback={null}><AddLayerPanel /></Suspense>}
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
