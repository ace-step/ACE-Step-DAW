import { useUIStore } from '../store/uiStore';
import { useProjectStore } from '../store/projectStore';
import { useTransportStore } from '../store/transportStore';
import { DEFAULT_TIMELINE_PIXELS_PER_SECOND } from './timelineZoom';

export interface Command {
  id: string;
  label: string;
  category: string;
  shortcut?: string;
  action: () => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl+';

export function buildCommandList(): Command[] {
  return [
    // Transport
    {
      id: 'play-pause',
      label: 'Play / Pause',
      category: 'Transport',
      shortcut: 'Space',
      action: () => {
        const t = useTransportStore.getState();
        if (t.isPlaying) t.pause();
        else t.play();
      },
    },
    {
      id: 'stop',
      label: 'Stop',
      category: 'Transport',
      shortcut: 'Enter',
      action: () => useTransportStore.getState().stop(),
    },
    {
      id: 'toggle-loop',
      label: 'Toggle Loop',
      category: 'Transport',
      shortcut: 'L',
      action: () => useTransportStore.getState().toggleLoop(),
    },
    {
      id: 'toggle-metronome',
      label: 'Toggle Metronome',
      category: 'Transport',
      shortcut: 'K',
      action: () => useTransportStore.getState().toggleMetronome(),
    },
    // Project
    {
      id: 'new-project',
      label: 'New Project',
      category: 'Project',
      shortcut: `${mod}N`,
      action: () => useUIStore.getState().setShowNewProjectDialog(true),
    },
    {
      id: 'open-project',
      label: 'Open Project',
      category: 'Project',
      shortcut: `${mod}O`,
      action: () => useUIStore.getState().setShowProjectListDialog(true),
    },
    {
      id: 'settings',
      label: 'Generate Settings',
      category: 'Project',
      shortcut: `${mod},`,
      action: () => useUIStore.getState().openGenerationPanelView('settings'),
    },
    {
      id: 'export',
      label: 'Export',
      category: 'Project',
      shortcut: `${mod}⇧E`,
      action: () => useUIStore.getState().setShowExportDialog(true),
    },
    {
      id: 'add-track',
      label: 'Add Track',
      category: 'Project',
      shortcut: `${mod}⇧I`,
      action: () => useUIStore.getState().setShowInstrumentPicker(true),
    },

    // View / Panels
    {
      id: 'toggle-mixer',
      label: 'Toggle Mixer',
      category: 'View',
      shortcut: 'X',
      action: () => {
        const ui = useUIStore.getState();
        ui.setShowMixer(!ui.showMixer);
      },
    },
    {
      id: 'toggle-library',
      label: 'Toggle Library',
      category: 'View',
      shortcut: 'Y',
      action: () => {
        const ui = useUIStore.getState();
        ui.setShowLibrary(!ui.showLibrary);
      },
    },
    {
      id: 'toggle-smart-controls',
      label: 'Toggle Smart Controls',
      category: 'View',
      shortcut: 'B',
      action: () => {
        const ui = useUIStore.getState();
        ui.setShowSmartControls(!ui.showSmartControls);
      },
    },
    {
      id: 'toggle-tempo-lane',
      label: 'Toggle Tempo Lane',
      category: 'View',
      shortcut: 'T',
      action: () => useUIStore.getState().toggleTempoLane(),
    },
    {
      id: 'toggle-ai-assistant',
      label: 'Toggle AI Assistant',
      category: 'View',
      shortcut: `${mod}/`,
      action: () => useUIStore.getState().toggleAIAssistant(),
    },
    {
      id: 'toggle-spectrum-analyzer',
      label: 'Toggle Spectrum Analyzer',
      category: 'View',
      action: () => useUIStore.getState().toggleSpectrumAnalyzer(),
    },
    {
      id: 'toggle-clip-inspector',
      label: 'Toggle Clip Inspector',
      category: 'View',
      shortcut: '⇧I',
      action: () => useUIStore.getState().toggleClipInspector(),
    },

    // Zoom
    {
      id: 'zoom-in',
      label: 'Zoom In',
      category: 'View',
      shortcut: `${mod}=`,
      action: () => useUIStore.getState().zoomIn(),
    },
    {
      id: 'zoom-out',
      label: 'Zoom Out',
      category: 'View',
      shortcut: `${mod}-`,
      action: () => useUIStore.getState().zoomOut(),
    },
    {
      id: 'zoom-reset',
      label: 'Reset Zoom',
      category: 'View',
      shortcut: `${mod}0`,
      action: () => {
        const ui = useUIStore.getState();
        if (ui.keyboardContext.scope === 'timeline') ui.zoomReset();
        else ui.setPixelsPerSecond(DEFAULT_TIMELINE_PIXELS_PER_SECOND);
      },
    },

    // Edit
    {
      id: 'undo',
      label: 'Undo',
      category: 'Edit',
      shortcut: `${mod}Z`,
      action: () => useProjectStore.getState().undo(),
    },
    {
      id: 'redo',
      label: 'Redo',
      category: 'Edit',
      shortcut: `${mod}⇧Z`,
      action: () => useProjectStore.getState().redo(),
    },
    {
      id: 'select-all-clips',
      label: 'Select All Clips',
      category: 'Edit',
      shortcut: `${mod}A`,
      action: () => {
        const project = useProjectStore.getState().project;
        if (!project) return;
        const allClips = project.tracks.flatMap((t) => t.clips);
        if (allClips.length > 0) {
          useUIStore.getState().selectClips(allClips.map((c) => c.id));
        }
      },
    },
    {
      id: 'deselect-all',
      label: 'Deselect All',
      category: 'Edit',
      shortcut: 'Esc',
      action: () => useUIStore.getState().deselectAll(),
    },
    {
      id: 'toggle-snap',
      label: 'Toggle Snap to Grid',
      category: 'Edit',
      shortcut: 'N',
      action: () => useUIStore.getState().toggleSnap(),
    },

    // Generation
    {
      id: 'generate-silence',
      label: 'Generate from Silence',
      category: 'Generation',
      shortcut: `${mod}G`,
      action: () => useUIStore.getState().setBatchGenerateMode('silence'),
    },
    {
      id: 'generate-context',
      label: 'Generate from Context',
      category: 'Generation',
      shortcut: `${mod}⇧G`,
      action: () => useUIStore.getState().setBatchGenerateMode('context'),
    },

    // Help
    {
      id: 'keyboard-shortcuts',
      label: 'Keyboard Shortcuts',
      category: 'Help',
      shortcut: '?',
      action: () => useUIStore.getState().setShowKeyboardShortcutsDialog(true),
    },
  ];
}

export function filterCommands(commands: Command[], query: string): Command[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return commands;

  const words = trimmed.split(/\s+/);

  return commands.filter((cmd) => {
    const haystack = `${cmd.label} ${cmd.category}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}
