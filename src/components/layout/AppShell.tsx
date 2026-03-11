import { useEffect, useCallback } from 'react';
import { Toolbar } from './Toolbar';
import { StatusBar } from './StatusBar';
import { TransportBar } from '../transport/TransportBar';
import { TrackList } from '../tracks/TrackList';
import { Timeline } from '../timeline/Timeline';
import { GenerationPanel } from '../generation/GenerationPanel';
import { ClipPromptEditor } from '../generation/ClipPromptEditor';
import { NewProjectDialog } from '../dialogs/NewProjectDialog';
import { InstrumentPicker } from '../dialogs/InstrumentPicker';
import { ExportDialog } from '../dialogs/ExportDialog';
import { SettingsDialog } from '../dialogs/SettingsDialog';
import { ProjectListDialog } from '../dialogs/ProjectListDialog';
import { KeyboardShortcutsDialog } from '../dialogs/KeyboardShortcutsDialog';
import { MixerPanel } from '../mixer/MixerPanel';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';

export function AppShell() {
  const { resumeOnGesture } = useAudioEngine();
  const project = useProjectStore((s) => s.project);
  const setShowNewProjectDialog = useUIStore((s) => s.setShowNewProjectDialog);

  // Resume AudioContext on first user interaction
  const handleClick = useCallback(() => {
    resumeOnGesture();
  }, [resumeOnGesture]);

  // Show new project dialog on first load if no project
  useEffect(() => {
    if (!project) {
      setShowNewProjectDialog(true);
    }
  }, []);

  // All keyboard shortcuts
  useKeyboardShortcuts();

  return (
    <div className="flex flex-col h-screen" onClick={handleClick}>
      <Toolbar />
      <TransportBar />

      <div className="flex flex-1 min-h-0">
        {project && <TrackList />}
        <Timeline />
      </div>

      {project && <MixerPanel />}
      {project && <GenerationPanel />}
      <StatusBar />

      {/* Modals */}
      <ClipPromptEditor />
      <NewProjectDialog />
      <InstrumentPicker />
      <ExportDialog />
      <SettingsDialog />
      <ProjectListDialog />
      <KeyboardShortcutsDialog />
    </div>
  );
}
