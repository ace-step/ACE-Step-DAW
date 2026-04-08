import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildCommandPaletteCommands, type CommandPaletteContext } from '../commandPalette';
import { useExportPresetsStore } from '../../store/exportPresetsStore';

function createMockContext(): CommandPaletteContext {
  return {
    project: {
      id: 'test',
      name: 'Test',
      bpm: 120,
      keyScale: 'C major',
      timeSignature: 4,
      timeSignatureDenominator: 4,
      totalDuration: 30,
      masterVolume: 1,
      measures: 8,
      tracks: [],
      globalCaption: '',
      markers: [],
      markerRanges: [],
      mastering: undefined as never,
      mixSnapshots: [],
    } as never,
    selectedClipIds: [],
    currentTime: 0,
    isPlaying: false,
    showMixer: false,
    showLibrary: false,
    showSmartControls: false,
    showAIAssistant: false,
    loopBrowserOpen: false,
    showTempoLane: false,
    loopEnabled: false,
    metronomeEnabled: false,
    expandedTrackId: null,
    openPianoRollTrackId: null,
    openSequencerTrackId: null,
    openDrumMachineTrackId: null,
    actions: {
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      toggleLoop: vi.fn(),
      toggleMetronome: vi.fn(),
      setShowNewProjectDialog: vi.fn(),
      setShowProjectListDialog: vi.fn(),
      openGenerationSettings: vi.fn(),
      setShowExportDialog: vi.fn(),
      setShowKeyboardShortcutsDialog: vi.fn(),
      setShowLibrary: vi.fn(),
      setShowMixer: vi.fn(),
      setShowSmartControls: vi.fn(),
      toggleLoopBrowser: vi.fn(),
      toggleTempoLane: vi.fn(),
      toggleAIAssistant: vi.fn(),
      zoomTimelineToSelection: vi.fn(),
      zoomTimelineToProject: vi.fn(),
      setBatchGenerateMode: vi.fn(),
      addTrack: vi.fn(),
      addTrackEffect: vi.fn(),
      updateProject: vi.fn(),
      updateTrack: vi.fn(),
      updateTrackMixer: vi.fn(),
      updateTrackEffect: vi.fn(),
      duplicateClip: vi.fn(),
      splitClip: vi.fn(),
      splitClipAtZeroCrossing: vi.fn(),
      removeClip: vi.fn(),
      setEditingClip: vi.fn(),
      deselectAll: vi.fn(),
      openEnhancer: vi.fn(),
    },
  };
}

describe('command palette export preset commands', () => {
  beforeEach(() => {
    useExportPresetsStore.getState().resetToDefaults();
  });

  it('includes export preset commands for built-in presets', () => {
    const context = createMockContext();
    const commands = buildCommandPaletteCommands(context);
    const exportCommands = commands.filter((c) => c.id.startsWith('project:export-preset:'));
    expect(exportCommands.length).toBeGreaterThanOrEqual(4);
  });

  it('has Quick MP3 export command', () => {
    const context = createMockContext();
    const commands = buildCommandPaletteCommands(context);
    const quickMp3 = commands.find((c) => c.title === 'Export: Quick MP3');
    expect(quickMp3).toBeDefined();
    expect(quickMp3!.section).toBe('Export');
  });

  it('has All Formats Bundle export command', () => {
    const context = createMockContext();
    const commands = buildCommandPaletteCommands(context);
    const allFormats = commands.find((c) => c.title === 'Export: All Formats Bundle');
    expect(allFormats).toBeDefined();
  });

  it('export preset command opens export dialog', () => {
    const context = createMockContext();
    const commands = buildCommandPaletteCommands(context);
    const presetCmd = commands.find((c) => c.id.startsWith('project:export-preset:'));
    expect(presetCmd).toBeDefined();
    presetCmd!.execute();
    expect(context.actions.setShowExportDialog).toHaveBeenCalledWith(true);
  });

  it('export preset command sets lastUsedPresetId', () => {
    const context = createMockContext();
    const commands = buildCommandPaletteCommands(context);
    const presetCmd = commands.find((c) => c.title === 'Export: Quick MP3');
    presetCmd!.execute();
    expect(useExportPresetsStore.getState().lastUsedPresetId).toBe('builtin-quick-mp3');
  });
});
