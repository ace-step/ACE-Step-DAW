import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildCommandPaletteCommands,
  buildCommandPaletteRegistry,
  searchCommandsForQuery,
  type CommandPaletteContext,
} from '../../src/services/commandPalette';
import { useProjectStore } from '../../src/store/projectStore';
import { useTransportStore } from '../../src/store/transportStore';
import { useUIStore } from '../../src/store/uiStore';

function createContext(): CommandPaletteContext {
  const projectStore = useProjectStore.getState();
  const transportStore = useTransportStore.getState();
  const uiStore = useUIStore.getState();

  return {
    project: projectStore.project,
    selectedClipIds: [],
    currentTime: transportStore.currentTime,
    isPlaying: transportStore.isPlaying,
    showMixer: false,
    showLibrary: false,
    showSmartControls: false,
    showAIAssistant: false,
    loopBrowserOpen: false,
    showTempoLane: false,
    loopEnabled: transportStore.loopEnabled,
    metronomeEnabled: transportStore.metronomeEnabled,
    expandedTrackId: null,
    openPianoRollTrackId: null,
    openSequencerTrackId: null,
    openDrumMachineTrackId: null,
    actions: {
      play: transportStore.play,
      pause: transportStore.pause,
      stop: transportStore.stop,
      toggleLoop: transportStore.toggleLoop,
      toggleMetronome: transportStore.toggleMetronome,
      setShowNewProjectDialog: () => {},
      setShowProjectListDialog: () => {},
      openGenerationSettings: () => {},
      setShowExportDialog: () => {},
      setShowKeyboardShortcutsDialog: () => {},
      setShowLibrary: () => {},
      setShowMixer: () => {},
      setShowSmartControls: () => {},
      toggleLoopBrowser: () => {},
      toggleTempoLane: () => {},
      toggleAIAssistant: () => {},
      zoomTimelineToSelection: uiStore.zoomTimelineToSelection,
      zoomTimelineToProject: uiStore.zoomTimelineToProject,
      setBatchGenerateMode: () => {},
      addTrack: projectStore.addTrack,
      addTrackEffect: projectStore.addTrackEffect,
      updateProject: projectStore.updateProject,
      updateTrack: projectStore.updateTrack,
      updateTrackMixer: projectStore.updateTrackMixer,
      updateTrackEffect: projectStore.updateTrackEffect,
      duplicateClip: () => {},
      splitClip: () => {},
      splitClipAtZeroCrossing: async () => {},
      removeClip: () => {},
      setEditingClip: () => {},
      deselectAll: () => {},
    },
  };
}

describe('commandPalette', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'Palette Test', bpm: 120 });
  });

  it('matches natural-language effect intents against track names', () => {
    useProjectStore.getState().addTrack('drums');
    const vocalsTrack = useProjectStore.getState().addTrack('vocals');
    const results = searchCommandsForQuery('add reverb to vocals', createContext(), []);

    expect(results[0]?.id).toBe(`track:${vocalsTrack.id}:effect:reverb`);
    expect(results[0]?.title).toBe(`Add Reverb to ${vocalsTrack.displayName}`);
  });

  it('adds parsed BPM commands for parameter search', async () => {
    const context = createContext();
    const results = searchCommandsForQuery('tempo 140', context, []);
    const tempoCommand = results.find((result) => result.id === 'project:set-tempo:140');

    expect(tempoCommand).not.toBeUndefined();
    if (!tempoCommand) {
      throw new Error('Expected tempo command to be available');
    }

    await tempoCommand.execute();

    expect(useProjectStore.getState().project?.bpm).toBe(140);
  });

  it('executes dynamic track volume parameter commands from natural language', async () => {
    const vocalsTrack = useProjectStore.getState().addTrack('vocals');
    const results = searchCommandsForQuery('set vocals volume to 65', createContext(), []);
    const volumeCommand = results.find((result) => result.id === `track:${vocalsTrack.id}:volume:65`);

    expect(volumeCommand).not.toBeUndefined();
    if (!volumeCommand) {
      throw new Error('Expected a dynamic volume command');
    }

    await volumeCommand.execute();

    const updatedTrack = useProjectStore.getState().project?.tracks.find((track) => track.id === vocalsTrack.id);
    expect(updatedTrack?.volume).toBeCloseTo(0.65);
  });

  it('executes dynamic reverb decay commands and updates the matching effect parameter', async () => {
    const vocalsTrack = useProjectStore.getState().addTrack('vocals');
    const existingEffectId = useProjectStore.getState().addTrackEffect(vocalsTrack.id, 'reverb');

    expect(typeof existingEffectId).toBe('string');

    const results = searchCommandsForQuery('vocals reverb decay 4.2', createContext(), []);
    const decayCommand = results.find((result) => result.id === `track:${vocalsTrack.id}:reverb-decay:4.2`);

    expect(decayCommand).not.toBeUndefined();
    if (!decayCommand) {
      throw new Error('Expected a dynamic reverb decay command');
    }

    await decayCommand.execute();

    const updatedTrack = useProjectStore.getState().project?.tracks.find((track) => track.id === vocalsTrack.id);
    const updatedReverb = updatedTrack?.effects?.find((effect) => effect.type === 'reverb');
    expect(updatedReverb?.params.decay).toBe(4.2);
  });

  it('builds dynamic effect commands for all project tracks', () => {
    const drumsTrack = useProjectStore.getState().addTrack('drums');
    const bassTrack = useProjectStore.getState().addTrack('bass');
    const commandIds = buildCommandPaletteCommands(createContext()).map((command) => command.id);

    expect(commandIds).toContain(`track:${drumsTrack.id}:effect:reverb`);
    expect(commandIds).toContain(`track:${bassTrack.id}:effect:compressor`);
  });

  it('builds a normalized registry for agent consumers', () => {
    const vocalsTrack = useProjectStore.getState().addTrack('vocals');
    const registry = buildCommandPaletteRegistry(createContext(), 'vocals volume 80');
    const volumeEntry = registry.find((entry) => entry.id === `track:${vocalsTrack.id}:volume:80`);

    expect(volumeEntry).not.toBeUndefined();
    expect(volumeEntry?.kind).toBe('parameter');
    expect(volumeEntry?.searchText).toContain('vocals');
    expect(volumeEntry?.searchText).toContain('volume');
  });

  it('builds command palette entries for zooming to selection and fitting the project', () => {
    const commands = buildCommandPaletteCommands(createContext());
    const zoomSelection = commands.find((command) => command.id === 'view:zoom-to-selection');
    const fitProject = commands.find((command) => command.id === 'view:zoom-to-fit-project');

    expect(zoomSelection).not.toBeUndefined();
    expect(zoomSelection?.shortcut).toEqual(['Z']);
    expect(fitProject).not.toBeUndefined();
    expect(fitProject?.shortcut).toEqual(['Shift', 'Z']);
  });

  it('executes zoom-to-selection and fit-project through the shared UI action path', async () => {
    const commands = buildCommandPaletteCommands(createContext());
    const zoomSelection = commands.find((command) => command.id === 'view:zoom-to-selection');
    const fitProject = commands.find((command) => command.id === 'view:zoom-to-fit-project');

    expect(zoomSelection).toBeTruthy();
    expect(fitProject).toBeTruthy();

    await zoomSelection?.execute();
    expect(useUIStore.getState().timelineZoomRequest).toEqual({
      id: 1,
      mode: 'selection',
    });

    await fitProject?.execute();
    expect(useUIStore.getState().timelineZoomRequest).toEqual({
      id: 2,
      mode: 'project',
    });
  });
});
