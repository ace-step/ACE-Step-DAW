import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildCommandPaletteCommands,
  buildCommandPaletteRegistry,
  searchCommandPaletteCommands,
  searchCommandsForQuery,
  type CommandPaletteContext,
} from '../../src/services/commandPalette';
import { useProjectStore } from '../../src/store/projectStore';
import { useTransportStore } from '../../src/store/transportStore';
import { useMidiControllerStore } from '../../src/store/midiControllerStore';
import { useUIStore } from '../../src/store/uiStore';

function createContext(overrides: Partial<CommandPaletteContext> = {}): CommandPaletteContext {
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
    ...overrides,
  };
}

describe('commandPalette', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
    useMidiControllerStore.setState(useMidiControllerStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'Palette Test', bpm: 120 });
  });

  // ── Effect intents ──

  it('matches natural-language effect intents against track names', () => {
    useProjectStore.getState().addTrack('drums');
    const vocalsTrack = useProjectStore.getState().addTrack('vocals');
    const results = searchCommandsForQuery('add reverb to vocals', createContext(), []);

    expect(results[0]?.id).toBe(`track:${vocalsTrack.id}:effect:reverb`);
    expect(results[0]?.title).toBe(`Add Reverb to ${vocalsTrack.displayName}`);
  });

  it('builds dynamic effect commands for all project tracks', () => {
    const drumsTrack = useProjectStore.getState().addTrack('drums');
    const bassTrack = useProjectStore.getState().addTrack('bass');
    const commandIds = buildCommandPaletteCommands(createContext()).map((c) => c.id);

    expect(commandIds).toContain(`track:${drumsTrack.id}:effect:reverb`);
    expect(commandIds).toContain(`track:${bassTrack.id}:effect:compressor`);
  });

  it('does not crash saving a mix snapshot when no project is loaded', async () => {
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    const saveSnapshot = buildCommandPaletteCommands(createContext()).find(
      (command) => command.id === 'mixer:save-snapshot',
    );

    await expect(saveSnapshot?.execute()).resolves.toBeUndefined();
    expect(useProjectStore.getState().project).toBeNull();
  });

  it('does not assign duplicate shortcuts to per-snapshot A/B commands', () => {
    useProjectStore.getState().saveMixSnapshot('Mix A');
    useProjectStore.getState().saveMixSnapshot('Mix B');

    const abCommands = buildCommandPaletteCommands(createContext()).filter((command) =>
      command.id.startsWith('mixer:ab-snapshot:'),
    );

    expect(abCommands).toHaveLength(2);
    expect(abCommands.every((command) => command.shortcut === undefined)).toBe(true);
  });

  // ── BPM / Tempo ──

  it('adds parsed BPM commands for parameter search', async () => {
    const context = createContext();
    const results = searchCommandsForQuery('tempo 140', context, []);
    const tempoCommand = results.find((r) => r.id === 'project:set-tempo:140');

    expect(tempoCommand).not.toBeUndefined();
    await tempoCommand!.execute();
    expect(useProjectStore.getState().project?.bpm).toBe(140);
  });

  it('ignores BPM values outside valid range', () => {
    const results = searchCommandsForQuery('tempo 999', createContext(), []);
    const tempoCommand = results.find((r) => r.id?.startsWith('project:set-tempo'));
    expect(tempoCommand).toBeUndefined();
  });

  // ── Volume commands ──

  it('executes dynamic track volume parameter commands from natural language', async () => {
    const vocalsTrack = useProjectStore.getState().addTrack('vocals');
    const results = searchCommandsForQuery('set vocals volume to 65', createContext(), []);
    const volumeCommand = results.find((r) => r.id === `track:${vocalsTrack.id}:volume:65`);

    expect(volumeCommand).not.toBeUndefined();
    await volumeCommand!.execute();

    const updatedTrack = useProjectStore.getState().project?.tracks.find((t) => t.id === vocalsTrack.id);
    expect(updatedTrack?.volume).toBeCloseTo(0.65);
  });

  // ── Pan commands ──

  it('executes dynamic pan commands from natural language', async () => {
    const drumsTrack = useProjectStore.getState().addTrack('drums');
    const results = searchCommandsForQuery('drums pan left', createContext(), []);
    const panCommand = results.find((r) => r.id?.includes(':pan:'));

    expect(panCommand).not.toBeUndefined();
    await panCommand!.execute();

    const updatedTrack = useProjectStore.getState().project?.tracks.find((t) => t.id === drumsTrack.id);
    expect(updatedTrack?.pan).toBeLessThan(0);
  });

  // ── Reverb decay commands ──

  it('executes dynamic reverb decay commands and updates the matching effect parameter', async () => {
    const vocalsTrack = useProjectStore.getState().addTrack('vocals');
    useProjectStore.getState().addTrackEffect(vocalsTrack.id, 'reverb');

    const results = searchCommandsForQuery('vocals reverb decay 4.2', createContext(), []);
    const decayCommand = results.find((r) => r.id === `track:${vocalsTrack.id}:reverb-decay:4.2`);

    expect(decayCommand).not.toBeUndefined();
    await decayCommand!.execute();

    const updatedTrack = useProjectStore.getState().project?.tracks.find((t) => t.id === vocalsTrack.id);
    const updatedReverb = updatedTrack?.effects?.find((e) => e.type === 'reverb');
    expect(updatedReverb?.params.decay).toBe(4.2);
  });

  // ── Registry ──

  it('builds a normalized registry for agent consumers', () => {
    const vocalsTrack = useProjectStore.getState().addTrack('vocals');
    const registry = buildCommandPaletteRegistry(createContext(), 'vocals volume 80');
    const volumeEntry = registry.find((e) => e.id === `track:${vocalsTrack.id}:volume:80`);

    expect(volumeEntry).not.toBeUndefined();
    expect(volumeEntry?.kind).toBe('parameter');
    expect(volumeEntry?.searchText).toContain('vocals');
    expect(volumeEntry?.searchText).toContain('volume');
  });

  it('deduplicates registry entries by id', () => {
    const registry = buildCommandPaletteRegistry(createContext());
    const ids = registry.map((e) => e.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  // ── Zoom commands ──

  it('builds command palette entries for zooming to selection and fitting the project', () => {
    const commands = buildCommandPaletteCommands(createContext());
    const zoomSelection = commands.find((c) => c.id === 'view:zoom-to-selection');
    const fitProject = commands.find((c) => c.id === 'view:zoom-to-fit-project');

    expect(zoomSelection).not.toBeUndefined();
    expect(zoomSelection?.shortcut).toEqual(['Z']);
    expect(fitProject).not.toBeUndefined();
    expect(fitProject?.shortcut).toEqual(['Shift', 'Z']);
  });

  it('executes zoom-to-selection and fit-project through the shared UI action path', async () => {
    const commands = buildCommandPaletteCommands(createContext());
    const zoomSelection = commands.find((c) => c.id === 'view:zoom-to-selection');
    const fitProject = commands.find((c) => c.id === 'view:zoom-to-fit-project');

    await zoomSelection?.execute();
    expect(useUIStore.getState().timelineZoomRequest).toEqual({ id: 1, mode: 'selection' });

    await fitProject?.execute();
    expect(useUIStore.getState().timelineZoomRequest).toEqual({ id: 2, mode: 'project' });
  });

  // ── MIDI controller commands ──

  it('arms MIDI Learn for a concrete master-volume target', async () => {
    const commands = buildCommandPaletteCommands(createContext());
    const midiLearn = commands.find((c) => c.id === 'midi:learn');

    await midiLearn?.execute();

    expect(useUIStore.getState().showMidiControllerPanel).toBe(true);
    expect(useMidiControllerStore.getState().learnMode).toEqual({
      active: true,
      targetParam: 'master:volume',
      targetLabel: 'Master Volume',
    });
    expect(useMidiControllerStore.getState().enabled).toBe(true);
  });

  // ── Search scoring ──

  it('returns results scored by relevance', () => {
    useProjectStore.getState().addTrack('drums');
    const results = searchCommandsForQuery('play', createContext(), []);

    expect(results.length).toBeGreaterThan(0);
    // Results should be sorted by score descending
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it('boosts recent commands in search results', () => {
    const context = createContext();
    const allCommands = buildCommandPaletteCommands(context);
    const playCommand = allCommands.find((c) => c.id === 'transport:play-pause');
    expect(playCommand).toBeDefined();

    const withRecent = searchCommandPaletteCommands('play', allCommands, [playCommand!.id]);
    const withoutRecent = searchCommandPaletteCommands('play', allCommands, []);

    const recentResult = withRecent.find((r) => r.id === playCommand!.id);
    const nonRecentResult = withoutRecent.find((r) => r.id === playCommand!.id);

    expect(recentResult).toBeDefined();
    expect(nonRecentResult).toBeDefined();
    expect(recentResult!.score).toBeGreaterThan(nonRecentResult!.score);
    expect(recentResult!.isRecent).toBe(true);
  });

  it('returns all transport commands when query is empty', () => {
    const results = searchCommandsForQuery('', createContext(), []);
    expect(results.length).toBeGreaterThan(0);
  });

  // ── Transport commands ──

  it('builds transport commands (play/pause, stop, loop, metronome)', () => {
    const commands = buildCommandPaletteCommands(createContext());
    const commandIds = commands.map((c) => c.id);

    expect(commandIds).toContain('transport:play-pause');
    expect(commandIds).toContain('transport:stop');
    expect(commandIds).toContain('transport:toggle-loop');
    expect(commandIds).toContain('transport:toggle-metronome');
  });

  // ── Track add commands ──

  it('builds add-track commands for various instrument types', () => {
    const commands = buildCommandPaletteCommands(createContext());
    const commandIds = commands.map((c) => c.id);

    expect(commandIds).toContain('track:add-drums');
    expect(commandIds).toContain('track:add-bass');
    expect(commandIds).toContain('track:add-piano');
  });

  // ── Search with limit ──

  it('respects the limit parameter', () => {
    const results = searchCommandsForQuery('track', createContext(), [], 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });
});
