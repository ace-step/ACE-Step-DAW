import { useEffect, useCallback, useState } from 'react';
import { Toolbar } from './Toolbar';
import { StatusBar } from './StatusBar';
import { TrackList } from '../tracks/TrackList';
import { Timeline } from '../timeline/Timeline';
import { GenerationPanel } from '../generation/GenerationPanel';
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
import { ShareDialog } from '../dialogs/ShareDialog';
import { MixerPanel } from '../mixer/MixerPanel';
import { AssetsPanel } from '../assets/AssetsPanel';
import { LoopBrowser } from '../assets/LoopBrowser';
import { SequencerEditor } from '../sequencer/SequencerEditor';
import { DrumMachineEditor } from '../sequencer/DrumMachineEditor';
import { SmartControlsPanel } from '../controls/SmartControlsPanel';
import { PianoRoll } from '../pianoroll/PianoRoll';
import { EffectChain } from '../mixer/EffectChain';
import { ToastContainer } from '../ui/Toast';
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
  const [audioResumed, setAudioResumed] = useState(false);

  const handleClick = useCallback(async () => {
    await resumeOnGesture();
    setAudioResumed(true);
  }, [resumeOnGesture]);

  useEffect(() => {
    if (!project) {
      setShowNewProjectDialog(true);
    }
  }, []);

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
    <div className="flex flex-col h-screen bg-daw-bg text-zinc-300" onClick={handleClick}>
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

      <div className="flex flex-1 min-h-0">
        {project && <TrackList />}
        <Timeline />
        {project && <LoopBrowser />}
      </div>

      {project && <SmartControlsPanel />}
      {project && <SequencerEditor />}
      {project && <DrumMachineEditor />}
      {project && <PianoRoll />}
      {project && <EffectChain />}
      {project && <MixerPanel />}
      {project && <GenerationPanel />}
      <StatusBar />
      <ToastContainer />

      {/* Modals */}
      <NewProjectDialog />
      <InstrumentPicker />
      <ExportDialog />
      <SettingsDialog />
      <ProjectListDialog />
      <KeyboardShortcutsDialog />
      <CoverModal />
      <RepaintModal />
      <Vocal2BGMModal />
      <AudioAnalysisPanel />
      <StemSeparationModal />
      <ShareDialog />
    </div>
  );
}
