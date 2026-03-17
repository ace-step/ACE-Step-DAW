import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useTransportStore } from '../../store/transportStore';
import { useAudioImport } from '../../hooks/useAudioImport';
import { TransportBar } from '../transport/TransportBar';

export function Toolbar() {
  const project = useProjectStore((s) => s.project);
  const splitClip = useProjectStore((s) => s.splitClip);
  const removeClip = useProjectStore((s) => s.removeClip);
  const duplicateClip = useProjectStore((s) => s.duplicateClip);
  const selectedClipIds = useUIStore((s) => s.selectedClipIds);
  const deselectAll = useUIStore((s) => s.deselectAll);
  const currentTime = useTransportStore((s) => s.currentTime);
  const setShowNewProjectDialog = useUIStore((s) => s.setShowNewProjectDialog);
  const setShowSettingsDialog = useUIStore((s) => s.setShowSettingsDialog);
  const setShowExportDialog = useUIStore((s) => s.setShowExportDialog);
  const setShowProjectListDialog = useUIStore((s) => s.setShowProjectListDialog);
  const setShowKeyboardShortcutsDialog = useUIStore((s) => s.setShowKeyboardShortcutsDialog);
  const showMixer = useUIStore((s) => s.showMixer);
  const setShowMixer = useUIStore((s) => s.setShowMixer);
  const showAssetsPanel = useUIStore((s) => s.showAssetsPanel);
  const setShowAssetsPanel = useUIStore((s) => s.setShowAssetsPanel);
  const { openFilePicker } = useAudioImport();

  const hasSelection = selectedClipIds.size > 0;
  const singleSelected = selectedClipIds.size === 1 ? [...selectedClipIds][0] : null;

  return (
    <div className="flex items-center h-10 px-3 gap-2 bg-daw-surface border-b border-daw-border shrink-0">
      {/* Left section */}
      <button
        onClick={() => setShowProjectListDialog(true)}
        className="px-3 py-1 text-xs font-medium bg-daw-surface-2 hover:bg-zinc-600 rounded transition-colors"
      >
        Projects
      </button>
      <button
        onClick={() => setShowNewProjectDialog(true)}
        className="px-3 py-1 text-xs font-medium bg-daw-surface-2 hover:bg-zinc-600 rounded transition-colors"
      >
        New
      </button>
      <button
        onClick={() => setShowExportDialog(true)}
        className="px-3 py-1 text-xs font-medium bg-daw-surface-2 hover:bg-zinc-600 rounded transition-colors"
        disabled={!project}
      >
        Export
      </button>

      <div className="w-px h-5 bg-daw-border" />

      <button
        onClick={openFilePicker}
        disabled={!project}
        className="px-3 py-1 text-xs font-medium bg-daw-surface-2 hover:bg-zinc-600 rounded transition-colors disabled:opacity-40"
        title="Import audio file"
      >
        Import
      </button>

      <div className="w-px h-5 bg-daw-border" />

      {/* Editing tools */}
      <button
        onClick={() => singleSelected && splitClip(singleSelected, currentTime)}
        disabled={!singleSelected}
        className="px-2.5 py-1 text-xs font-medium bg-daw-surface-2 hover:bg-zinc-600 rounded transition-colors disabled:opacity-30"
        title="Split clip at playhead (S)"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="inline -mt-px mr-1">
          <path d="M7 1v12M3 4l4 3-4 3M11 4l-4 3 4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Split
      </button>
      <button
        onClick={() => {
          if (hasSelection) {
            const ids = [...selectedClipIds];
            deselectAll();
            ids.forEach((id) => removeClip(id));
          }
        }}
        disabled={!hasSelection}
        className="px-2.5 py-1 text-xs font-medium bg-daw-surface-2 hover:bg-zinc-600 rounded transition-colors disabled:opacity-30"
        title="Delete selected clips (Del)"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="inline -mt-px mr-1">
          <path d="M2.5 4h9M5 4V2.5h4V4M3.5 4v7.5a1 1 0 001 1h5a1 1 0 001-1V4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Delete
      </button>
      <button
        onClick={() => singleSelected && duplicateClip(singleSelected)}
        disabled={!singleSelected}
        className="px-2.5 py-1 text-xs font-medium bg-daw-surface-2 hover:bg-zinc-600 rounded transition-colors disabled:opacity-30"
        title="Duplicate clip (Cmd+D)"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="inline -mt-px mr-1">
          <rect x="1.5" y="3.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M5.5 3.5V2.5a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1h-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
        Duplicate
      </button>

      {/* Center section: Transport controls */}
      <div className="flex-1 flex items-center justify-center">
        <TransportBar />
      </div>

      {/* Right section: panel toggles + settings */}
      <button
        onClick={() => setShowMixer(!showMixer)}
        disabled={!project}
        className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
          showMixer
            ? 'bg-indigo-600 text-white hover:bg-indigo-500'
            : 'bg-daw-surface-2 hover:bg-zinc-600 text-zinc-300 disabled:opacity-40'
        }`}
        title="Toggle Mixer (M)"
      >
        Mixer
      </button>
      <button
        onClick={() => setShowAssetsPanel(!showAssetsPanel)}
        disabled={!project}
        className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
          showAssetsPanel
            ? 'bg-indigo-600 text-white hover:bg-indigo-500'
            : 'bg-daw-surface-2 hover:bg-zinc-600 text-zinc-300 disabled:opacity-40'
        }`}
        title="Toggle Assets Panel"
      >
        Assets
      </button>

      <div className="w-px h-5 bg-daw-border" />

      <button
        onClick={() => setShowSettingsDialog(true)}
        className="px-3 py-1 text-xs font-medium bg-daw-surface-2 hover:bg-zinc-600 rounded transition-colors"
      >
        Settings
      </button>
      <button
        onClick={() => setShowKeyboardShortcutsDialog(true)}
        title="Keyboard shortcuts (?)"
        className="w-6 h-6 text-xs font-bold bg-daw-surface-2 hover:bg-zinc-600 text-zinc-400 hover:text-zinc-200 rounded transition-colors flex items-center justify-center"
      >
        ?
      </button>
    </div>
  );
}
