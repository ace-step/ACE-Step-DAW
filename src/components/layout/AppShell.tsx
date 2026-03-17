import { useEffect, useCallback } from 'react';
import { Toolbar } from './Toolbar';
import { StatusBar } from './StatusBar';
import { TrackList } from '../tracks/TrackList';
import { Timeline } from '../timeline/Timeline';
import { GenerationPanel } from '../generation/GenerationPanel';
import { NewProjectDialog } from '../dialogs/NewProjectDialog';
import { InstrumentPicker } from '../dialogs/InstrumentPicker';
import { ExportDialog } from '../dialogs/ExportDialog';
import { SettingsDialog } from '../dialogs/SettingsDialog';
import { ProjectListDialog } from '../dialogs/ProjectListDialog';
import { KeyboardShortcutsDialog } from '../dialogs/KeyboardShortcutsDialog';
import { MixerPanel } from '../mixer/MixerPanel';
import { AssetsPanel } from '../assets/AssetsPanel';
import { SequencerEditor } from '../sequencer/SequencerEditor';
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

  useKeyboardShortcuts();

  return (
    <div className="flex flex-col h-screen" onClick={handleClick}>
      <Toolbar />

      <div className="flex flex-1 min-h-0">
        {project && <TrackList />}
        <Timeline />
        {project && <AssetsPanel />}
      </div>

      {project && <SequencerEditor />}
      {project && <MixerPanel />}
      {project && <GenerationPanel />}
      <StatusBar />

      {/* Modals */}
      <NewProjectDialog />
      <InstrumentPicker />
      <ExportDialog />
      <SettingsDialog />
      <ProjectListDialog />
      <KeyboardShortcutsDialog />
    </div>
  );
}
