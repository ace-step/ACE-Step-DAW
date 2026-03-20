import { useEffect, useCallback, useState } from 'react';
import { Toolbar } from './Toolbar';
import { StatusBar } from './StatusBar';
import { TrackList } from '../tracks/TrackList';
import { Timeline } from '../timeline/Timeline';
import { Z } from '../../utils/zIndex';
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
import { AssetsPanel } from '../assets/AssetsPanel';
import { LoopBrowser } from '../assets/LoopBrowser';
import { SequencerEditor } from '../sequencer/SequencerEditor';
import { DrumMachineEditor } from '../sequencer/DrumMachineEditor';
import { SmartControlsPanel } from '../controls/SmartControlsPanel';
import { PianoRoll } from '../pianoroll/PianoRoll';
import { EffectChain } from '../mixer/EffectChain';
import { SessionView } from '../session/SessionView';
import { ModelLibraryPanel } from '../models/ModelLibraryPanel';
import { ToastContainer } from '../ui/Toast';
import { UndoHistoryPanel } from './UndoHistoryPanel';
import { FirstRunOnboarding } from '../onboarding/FirstRunOnboarding';
import { GuidedTutorialOverlay } from '../onboarding/GuidedTutorialOverlay';
import { ContextualTips } from '../onboarding/ContextualTips';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useEffectsSync } from '../../hooks/useEffectsSync';
import { useShareLink } from '../../hooks/useShareLink';

export function AppShell() {
  const { resumeOnGesture } = useAudioEngine();
  const project = useProjectStore((s) => s.project);
  const setShowNewProjectDialog = useUIStore((s) => s.setShowNewProjectDialog);
  const setHistoryFocusScope = useUIStore((s) => s.setHistoryFocusScope);
  const showOnboarding = useUIStore((s) => s.showOnboarding);
  const activeTutorialStep = useUIStore((s) => s.activeTutorialStep);
  const onboardingCompleted = useUIStore((s) => s.onboardingCompleted);
  const onboardingSkipped = useUIStore((s) => s.onboardingSkipped);
  const setShowOnboarding = useUIStore((s) => s.setShowOnboarding);
  const mainView = useUIStore((s) => s.mainView);
  const showCommandPalette = useUIStore((s) => s.showCommandPalette);
  const showAIAssistant = useUIStore((s) => s.showAIAssistant);
  const showNewProjectDialog = useUIStore((s) => s.showNewProjectDialog);
  const showInstrumentPicker = useUIStore((s) => s.showInstrumentPicker);
  const showExportDialog = useUIStore((s) => s.showExportDialog);
  const showSettingsDialog = useUIStore((s) => s.showSettingsDialog);
  const showProjectListDialog = useUIStore((s) => s.showProjectListDialog);
  const bounceInPlaceTrackId = useUIStore((s) => s.bounceInPlaceTrackId);
  const showKeyboardShortcutsDialog = useUIStore((s) => s.showKeyboardShortcutsDialog);
  const showShortcutEditorDialog = useUIStore((s) => s.showShortcutEditorDialog);
  const [audioResumed, setAudioResumed] = useState(false);

  const handleClick = useCallback(async () => {
    await resumeOnGesture();
    setAudioResumed(true);
  }, [resumeOnGesture]);

  const hasPriorityBlocker = showOnboarding || activeTutorialStep !== null;
  const hasForegroundInteractiveSurface = showCommandPalette || showAIAssistant;
  const hasBlockingDialog =
    showNewProjectDialog ||
    showInstrumentPicker ||
    showExportDialog ||
    showSettingsDialog ||
    showProjectListDialog ||
    bounceInPlaceTrackId !== null ||
    showKeyboardShortcutsDialog ||
    showShortcutEditorDialog;
  const showAudioResumeOverlay =
    !audioResumed &&
    !!project &&
    !hasPriorityBlocker &&
    !hasForegroundInteractiveSurface &&
    !hasBlockingDialog;

  useEffect(() => {
    if (!project) {
      if (!onboardingCompleted && !onboardingSkipped) {
        setShowOnboarding(true);
        setShowNewProjectDialog(false);
      } else {
        setShowOnboarding(false);
        setShowNewProjectDialog(true);
      }
    }
  }, [onboardingCompleted, onboardingSkipped, project, setShowNewProjectDialog, setShowOnboarding]);

  // Warn before closing tab with unsaved project
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (project) {
        e.preventDefault();
        // Modern browsers ignore custom messages, but still show the dialog
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [project]);

  useKeyboardShortcuts();
  useEffectsSync(); // Keep effects chain synced with store — always, not just when Mixer is open
  useShareLink(); // Check URL for share parameters on mount

  return (
    <div
      className="flex flex-col h-screen bg-daw-bg text-zinc-300"
      onClick={handleClick}
      role="application"
      aria-label="ACE-Step DAW"
      tabIndex={-1}
    >
      {/* Audio context overlay — shown until user's first click resumes audio */}
      {showAudioResumeOverlay && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm cursor-pointer"
          style={{ zIndex: Z.appOverlay }}
          role="button"
          tabIndex={0}
          aria-label="Enable audio playback"
          onClick={() => {
            void handleClick();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              void handleClick();
            }
          }}
        >
          <div className="text-center">
            <div className="text-4xl mb-3">🎵</div>
            <div className="text-lg font-medium text-white mb-1">Click anywhere to enable audio</div>
            <div className="text-xs text-zinc-400">Browser requires a user gesture to start the audio engine</div>
          </div>
        </div>
      )}
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
      {project && <AddLayerPanel />}
      <StatusBar />
      <ToastContainer />
      <UndoHistoryPanel />
      {project && !showOnboarding && <ContextualTips />}
      <GuidedTutorialOverlay />
      <FirstRunOnboarding />

      {/* Modals */}
      <NewProjectDialog />
      <InstrumentPicker />
      <ExportDialog />
      <SettingsDialog />
      <ProjectListDialog />
      <BounceInPlaceDialog />
      <KeyboardShortcutsDialog />
      {!hasPriorityBlocker && !hasBlockingDialog && <CommandPalette />}
      <ShortcutEditorDialog />
      <CoverModal />
      <MusicEnhancerPanel />
      <RepaintModal />
      <Vocal2BGMModal />
      <AudioAnalysisPanel />
      <StemSeparationModal />
      <AudioToMidiModal />
      <ShareDialog />
      {!hasPriorityBlocker && !hasBlockingDialog && <AIAssistantPanel />}
    </div>
  );
}
