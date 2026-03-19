import { useEffect, useCallback, useMemo, useState } from 'react';
import { Toolbar } from './Toolbar';
import { StatusBar } from './StatusBar';
import { TrackList } from '../tracks/TrackList';
import { Timeline } from '../timeline/Timeline';
import { GenerationPanel } from '../generation/GenerationPanel';
import { GenerationSidePanel } from '../generation/GenerationSidePanel';
import { CoverModal } from '../generation/CoverModal';
import { RepaintModal } from '../generation/RepaintModal';
import { Vocal2BGMModal } from '../generation/Vocal2BGMModal';
import { AudioAnalysisPanel } from '../generation/AudioAnalysisPanel';
import { StemSeparationModal } from '../generation/StemSeparationModal';
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
import { useTransportStore } from '../../store/transportStore';
import { useTransport } from '../../hooks/useTransport';

export function AppShell() {
  const { resumeOnGesture } = useAudioEngine();
  const project = useProjectStore((s) => s.project);
  const commitQueuedSessionLaunches = useProjectStore((s) => s.commitQueuedSessionLaunches);
  const advanceSessionPlaybacks = useProjectStore((s) => s.advanceSessionPlaybacks);
  const commitSessionRecording = useProjectStore((s) => s.commitSessionRecording);
  const mainView = useUIStore((s) => s.mainView);
  const currentTime = useTransportStore((s) => s.currentTime);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const setShowNewProjectDialog = useUIStore((s) => s.setShowNewProjectDialog);
  const setHistoryFocusScope = useUIStore((s) => s.setHistoryFocusScope);
  const { seek } = useTransport();
  const showOnboarding = useUIStore((s) => s.showOnboarding);
  const onboardingCompleted = useUIStore((s) => s.onboardingCompleted);
  const onboardingSkipped = useUIStore((s) => s.onboardingSkipped);
  const setShowOnboarding = useUIStore((s) => s.setShowOnboarding);
  const [audioResumed, setAudioResumed] = useState(false);
  const sessionPlaybackSignature = useMemo(() => JSON.stringify({
    view: mainView,
    active: project?.session?.activeTrackPlaybacks ?? {},
    queued: project?.session?.queuedLaunches ?? [],
  }), [mainView, project?.session?.activeTrackPlaybacks, project?.session?.queuedLaunches]);

  const handleClick = useCallback(async () => {
    await resumeOnGesture();
    setAudioResumed(true);
  }, [resumeOnGesture]);

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

  useEffect(() => {
    if (!project?.session || !isPlaying) return;
    commitQueuedSessionLaunches(currentTime);
    advanceSessionPlaybacks(currentTime);
  }, [advanceSessionPlaybacks, commitQueuedSessionLaunches, currentTime, isPlaying, project?.session]);

  useEffect(() => {
    if (!isPlaying || mainView !== 'session') return;
    seek(useTransportStore.getState().currentTime);
  }, [isPlaying, mainView, seek, sessionPlaybackSignature]);

  useEffect(() => {
    if (!project?.session?.isRecordingToArrangement && !project?.session?.performanceEvents.length) return;
    if (isPlaying) return;
    commitSessionRecording(currentTime);
  }, [commitSessionRecording, currentTime, isPlaying, project?.session?.isRecordingToArrangement, project?.session?.performanceEvents.length]);

  return (
    <div
      className="flex flex-col h-screen bg-daw-bg text-zinc-300"
      onClick={handleClick}
      role="application"
      aria-label="ACE-Step DAW"
    >
      {/* Audio context overlay — shown until user's first click resumes audio */}
      {!audioResumed && project && (
        <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center backdrop-blur-sm cursor-pointer">
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
      <KeyboardShortcutsDialog />
      <CommandPalette />
      <ShortcutEditorDialog />
      <BounceInPlaceDialog />
      <CoverModal />
      <RepaintModal />
      <Vocal2BGMModal />
      <AudioAnalysisPanel />
      <StemSeparationModal />
      <ShareDialog />
      <AIAssistantPanel />
    </div>
  );
}
