import { useEffect, useCallback } from 'react';
import { Toolbar } from './Toolbar';
import { StatusBar } from './StatusBar';
import { TrackList } from '../tracks/TrackList';
import { Timeline } from '../timeline/Timeline';
import { GenerationPanel } from '../generation/GenerationPanel';
import { CoverModal } from '../generation/CoverModal';
import { RepaintModal } from '../generation/RepaintModal';
import { Vocal2BGMModal } from '../generation/Vocal2BGMModal';
import { AudioAnalysisPanel } from '../generation/AudioAnalysisPanel';
import { NewProjectDialog } from '../dialogs/NewProjectDialog';
import { InstrumentPicker } from '../dialogs/InstrumentPicker';
import { ExportDialog } from '../dialogs/ExportDialog';
import { SettingsDialog } from '../dialogs/SettingsDialog';
import { ProjectListDialog } from '../dialogs/ProjectListDialog';
import { KeyboardShortcutsDialog } from '../dialogs/KeyboardShortcutsDialog';
import { MixerPanel } from '../mixer/MixerPanel';
import { AssetsPanel } from '../assets/AssetsPanel';
import { LoopBrowser } from '../assets/LoopBrowser';
import { SequencerEditor } from '../sequencer/SequencerEditor';
import { SmartControlsPanel } from '../controls/SmartControlsPanel';
import { PianoRoll } from '../pianoroll/PianoRoll';
import { EffectChain } from '../mixer/EffectChain';
import { ToastContainer } from '../ui/Toast';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';

export function AppShell() {
  const { resumeOnGesture } = useAudioEngine();
  const project = useProjectStore((s) => s.project);
  const setShowNewProjectDialog = useUIStore((s) => s.setShowNewProjectDialog);

  const handleClick = useCallback(() => {
    resumeOnGesture();
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

  return (
    <div className="flex flex-col h-screen bg-daw-bg text-zinc-300" onClick={handleClick}>
      <Toolbar />

      <div className="flex flex-1 min-h-0">
        {project && <TrackList />}
        <Timeline />
        {project && <LoopBrowser />}
      </div>

      {project && <SmartControlsPanel />}
      {project && <SequencerEditor />}
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
    </div>
  );
}
