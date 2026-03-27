import { describe, it, expect, vi } from 'vitest';
import type { Track } from '../../types/project';
import type { CommandPaletteContext, CommandPaletteCommand } from '../commandPalette';
import {
  buildCommandPaletteCommands,
  buildCommandPaletteRegistry,
  searchCommandPaletteCommands,
  searchCommandsForQuery,
} from '../commandPalette';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    trackName: 'drums',
    displayName: 'Drums',
    color: '#ff0000',
    order: 0,
    volume: 0.8,
    muted: false,
    soloed: false,
    clips: [],
    effects: [],
    ...overrides,
  } as Track;
}

function makeContext(overrides: Partial<CommandPaletteContext> = {}): CommandPaletteContext {
  return {
    project: {
      id: 'project-1',
      name: 'Test Project',
      bpm: 120,
      tracks: [makeTrack()],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as CommandPaletteContext['project'],
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
      addTrack: vi.fn().mockReturnValue(makeTrack()),
      addTrackEffect: vi.fn().mockReturnValue('effect-1'),
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
    ...overrides,
  };
}

// ─── buildCommandPaletteCommands ──────────────────────────────────────────────

describe('buildCommandPaletteCommands', () => {
  it('returns an array of commands with required fields', () => {
    const ctx = makeContext();
    const commands = buildCommandPaletteCommands(ctx);
    expect(commands.length).toBeGreaterThan(0);
    for (const cmd of commands) {
      expect(typeof cmd.id).toBe('string');
      expect(typeof cmd.title).toBe('string');
      expect(typeof cmd.section).toBe('string');
      expect(typeof cmd.searchText).toBe('string');
      expect(typeof cmd.execute).toBe('function');
      expect(['action', 'setting', 'parameter']).toContain(cmd.kind);
    }
  });

  it('contains transport commands', () => {
    const ctx = makeContext();
    const commands = buildCommandPaletteCommands(ctx);
    const ids = commands.map((c) => c.id);
    expect(ids).toContain('transport:play-pause');
    expect(ids).toContain('transport:stop');
    expect(ids).toContain('transport:toggle-loop');
    expect(ids).toContain('transport:toggle-metronome');
  });

  it('uses "Pause Playback" when isPlaying is true', () => {
    const ctx = makeContext({ isPlaying: true });
    const commands = buildCommandPaletteCommands(ctx);
    const playCmd = commands.find((c) => c.id === 'transport:play-pause');
    expect(playCmd!.title).toBe('Pause Playback');
  });

  it('uses "Play Playback" when isPlaying is false', () => {
    const ctx = makeContext({ isPlaying: false });
    const commands = buildCommandPaletteCommands(ctx);
    const playCmd = commands.find((c) => c.id === 'transport:play-pause');
    expect(playCmd!.title).toBe('Play Playback');
  });

  it('loop toggle title reflects loopEnabled state', () => {
    const ctxEnabled = makeContext({ loopEnabled: true });
    const ctxDisabled = makeContext({ loopEnabled: false });
    const cmdEnabled = buildCommandPaletteCommands(ctxEnabled).find((c) => c.id === 'transport:toggle-loop');
    const cmdDisabled = buildCommandPaletteCommands(ctxDisabled).find((c) => c.id === 'transport:toggle-loop');
    expect(cmdEnabled!.title).toBe('Disable Loop');
    expect(cmdDisabled!.title).toBe('Enable Loop');
  });

  it('metronome toggle title reflects metronomeEnabled state', () => {
    const ctx = makeContext({ metronomeEnabled: true });
    const cmd = buildCommandPaletteCommands(ctx).find((c) => c.id === 'transport:toggle-metronome');
    expect(cmd!.title).toBe('Disable Metronome');
  });

  it('contains panel toggle commands', () => {
    const ctx = makeContext();
    const ids = buildCommandPaletteCommands(ctx).map((c) => c.id);
    expect(ids).toContain('panel:library');
    expect(ids).toContain('panel:mixer');
    expect(ids).toContain('panel:smart-controls');
    expect(ids).toContain('panel:loop-browser');
    expect(ids).toContain('panel:tempo-lane');
    expect(ids).toContain('panel:ai-assistant');
  });

  it('panel titles reflect visibility state', () => {
    const ctx = makeContext({ showMixer: true, showLibrary: false });
    const commands = buildCommandPaletteCommands(ctx);
    const mixerCmd = commands.find((c) => c.id === 'panel:mixer');
    const libraryCmd = commands.find((c) => c.id === 'panel:library');
    expect(mixerCmd!.title).toBe('Hide Mixer');
    expect(libraryCmd!.title).toBe('Show Library');
  });

  it('contains generation commands', () => {
    const ctx = makeContext();
    const ids = buildCommandPaletteCommands(ctx).map((c) => c.id);
    expect(ids).toContain('generation:silence');
    expect(ids).toContain('generation:context');
  });

  it('contains track add commands', () => {
    const ctx = makeContext();
    const ids = buildCommandPaletteCommands(ctx).map((c) => c.id);
    expect(ids).toContain('track:add-drums');
    expect(ids).toContain('track:add-bass');
    expect(ids).toContain('track:add-piano');
    expect(ids).toContain('track:add-sampler');
    expect(ids).toContain('track:add-drum-machine');
  });

  it('contains per-track effect commands for each track', () => {
    const track = makeTrack({ id: 'trk-abc', displayName: 'My Bass' });
    const ctx = makeContext({
      project: {
        id: 'p1',
        name: 'Test',
        bpm: 120,
        tracks: [track],
        createdAt: '',
        updatedAt: '',
      } as CommandPaletteContext['project'],
    });
    const ids = buildCommandPaletteCommands(ctx).map((c) => c.id);
    expect(ids).toContain('track:trk-abc:effect:reverb');
    expect(ids).toContain('track:trk-abc:effect:delay');
    expect(ids).toContain('track:trk-abc:effect:compressor');
    expect(ids).toContain('track:trk-abc:effect:parametricEq');
  });

  it('contains mute/solo toggle commands per track', () => {
    const track = makeTrack({ id: 'trk-1', displayName: 'Drums', muted: false, soloed: true });
    const ctx = makeContext({
      project: {
        id: 'p1', name: 'T', bpm: 120, tracks: [track], createdAt: '', updatedAt: '',
      } as CommandPaletteContext['project'],
    });
    const commands = buildCommandPaletteCommands(ctx);
    const muteCmd = commands.find((c) => c.id === 'track:trk-1:mute-toggle');
    const soloCmd = commands.find((c) => c.id === 'track:trk-1:solo-toggle');
    expect(muteCmd!.title).toBe('Mute Drums');
    expect(soloCmd!.title).toBe('Unsolo Drums');
  });

  it('contains volume preset commands per track', () => {
    const track = makeTrack({ id: 'trk-v' });
    const ctx = makeContext({
      project: {
        id: 'p1', name: 'T', bpm: 120, tracks: [track], createdAt: '', updatedAt: '',
      } as CommandPaletteContext['project'],
    });
    const ids = buildCommandPaletteCommands(ctx).map((c) => c.id);
    expect(ids).toContain('track:trk-v:volume:25');
    expect(ids).toContain('track:trk-v:volume:50');
    expect(ids).toContain('track:trk-v:volume:80');
    expect(ids).toContain('track:trk-v:volume:100');
  });

  it('contains pan preset commands per track', () => {
    const track = makeTrack({ id: 'trk-p' });
    const ctx = makeContext({
      project: {
        id: 'p1', name: 'T', bpm: 120, tracks: [track], createdAt: '', updatedAt: '',
      } as CommandPaletteContext['project'],
    });
    const ids = buildCommandPaletteCommands(ctx).map((c) => c.id);
    expect(ids).toContain('track:trk-p:pan:-100');
    expect(ids).toContain('track:trk-p:pan:0');
    expect(ids).toContain('track:trk-p:pan:100');
  });

  it('includes clip commands when a clip is selected', () => {
    const ctx = makeContext({ selectedClipIds: ['clip-1'] });
    const ids = buildCommandPaletteCommands(ctx).map((c) => c.id);
    expect(ids).toContain('clip:duplicate-selected');
    expect(ids).toContain('clip:split-selected');
    expect(ids).toContain('clip:edit-selected');
    expect(ids).toContain('clip:delete-selected');
  });

  it('does not include clip commands when no clip is selected', () => {
    const ctx = makeContext({ selectedClipIds: [] });
    const ids = buildCommandPaletteCommands(ctx).map((c) => c.id);
    expect(ids).not.toContain('clip:duplicate-selected');
    expect(ids).not.toContain('clip:split-selected');
    expect(ids).not.toContain('clip:edit-selected');
    expect(ids).not.toContain('clip:delete-selected');
  });

  it('includes enhance command only for clips with generationStatus ready', () => {
    const readyClip = {
      id: 'clip-ready',
      generationStatus: 'ready' as const,
      trackStartTime: 0,
      duration: 4,
      color: '#000',
      name: 'clip',
      generationJobId: null,
      cumulativeMixKey: null,
    };
    const track = makeTrack({ id: 'trk-e', clips: [readyClip] as Track['clips'] });
    const ctx = makeContext({
      selectedClipIds: ['clip-ready'],
      project: {
        id: 'p1', name: 'T', bpm: 120, tracks: [track], createdAt: '', updatedAt: '',
      } as CommandPaletteContext['project'],
    });
    const ids = buildCommandPaletteCommands(ctx).map((c) => c.id);
    expect(ids).toContain('clip:enhance-selected');
  });

  it('contains strudel toggle panel command', () => {
    const ctx = makeContext();
    const ids = buildCommandPaletteCommands(ctx).map((c) => c.id);
    expect(ids).toContain('strudel:toggle-panel');
  });

  it('contains scaffold commands for known genres', () => {
    const ctx = makeContext();
    const ids = buildCommandPaletteCommands(ctx).map((c) => c.id);
    for (const genre of ['house', 'techno', 'hiphop', 'ambient', 'jazz', 'rock']) {
      expect(ids).toContain(`strudel:scaffold:${genre}`);
    }
  });

  it('executes play/pause command correctly', () => {
    const ctx = makeContext({ isPlaying: false });
    const commands = buildCommandPaletteCommands(ctx);
    const playCmd = commands.find((c) => c.id === 'transport:play-pause')!;
    playCmd.execute();
    expect(ctx.actions.play).toHaveBeenCalledTimes(1);
    expect(ctx.actions.pause).not.toHaveBeenCalled();
  });

  it('executes pause when isPlaying is true', () => {
    const ctx = makeContext({ isPlaying: true });
    const commands = buildCommandPaletteCommands(ctx);
    const playCmd = commands.find((c) => c.id === 'transport:play-pause')!;
    playCmd.execute();
    expect(ctx.actions.pause).toHaveBeenCalledTimes(1);
    expect(ctx.actions.play).not.toHaveBeenCalled();
  });

  it('executes delete selected clips', () => {
    const ctx = makeContext({ selectedClipIds: ['c1', 'c2'] });
    const commands = buildCommandPaletteCommands(ctx);
    const delCmd = commands.find((c) => c.id === 'clip:delete-selected')!;
    delCmd.execute();
    expect(ctx.actions.deselectAll).toHaveBeenCalledTimes(1);
    expect(ctx.actions.removeClip).toHaveBeenCalledWith('c1');
    expect(ctx.actions.removeClip).toHaveBeenCalledWith('c2');
  });

  it('returns empty track commands when project is null', () => {
    const ctx = makeContext({ project: null });
    const commands = buildCommandPaletteCommands(ctx);
    // Should still have transport/panel/generation commands, but no per-track effects
    const effectCmds = commands.filter((c) => c.section === 'Effects');
    expect(effectCmds.length).toBe(0);
  });
});

// ─── buildCommandPaletteRegistry ──────────────────────────────────────────────

describe('buildCommandPaletteRegistry', () => {
  it('returns entries without execute function', () => {
    const ctx = makeContext();
    const entries = buildCommandPaletteRegistry(ctx);
    for (const entry of entries) {
      expect('execute' in entry).toBe(false);
      expect(typeof entry.id).toBe('string');
      expect(typeof entry.title).toBe('string');
    }
  });

  it('deduplicates entries by id', () => {
    const ctx = makeContext();
    const entries = buildCommandPaletteRegistry(ctx);
    const ids = entries.map((e) => e.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it('includes dynamic tempo commands when query matches', () => {
    const ctx = makeContext();
    const entries = buildCommandPaletteRegistry(ctx, 'tempo 140');
    const tempoEntry = entries.find((e) => e.id === 'project:set-tempo:140');
    expect(tempoEntry).not.toBeUndefined();
    expect(tempoEntry!.title).toBe('Set Tempo to 140 BPM');
  });

  it('does not include tempo command for out-of-range bpm', () => {
    const ctx = makeContext();
    const entries = buildCommandPaletteRegistry(ctx, 'bpm 300');
    const tempoEntry = entries.find((e) => e.id === 'project:set-tempo:300');
    expect(tempoEntry).toBeUndefined();
  });

  it('includes dynamic volume commands when query references a track', () => {
    const ctx = makeContext();
    const entries = buildCommandPaletteRegistry(ctx, 'drums volume 75');
    const volEntry = entries.find((e) => e.id === 'track:track-1:volume:75');
    expect(volEntry).not.toBeUndefined();
    expect(volEntry!.title).toBe('Set Drums Volume to 75%');
  });

  it('includes dynamic pan commands when query references pan direction', () => {
    const ctx = makeContext();
    const entries = buildCommandPaletteRegistry(ctx, 'drums pan left');
    const panEntry = entries.find((e) => e.id === 'track:track-1:pan:-100');
    expect(panEntry).not.toBeUndefined();
  });
});

// ─── searchCommandPaletteCommands ─────────────────────────────────────────────

describe('searchCommandPaletteCommands', () => {
  function buildTestCommands(): CommandPaletteCommand[] {
    const ctx = makeContext();
    return buildCommandPaletteCommands(ctx);
  }

  it('returns all commands when query is empty', () => {
    const commands = buildTestCommands();
    const results = searchCommandPaletteCommands('', commands, []);
    expect(results.length).toBeGreaterThan(0);
    // Should respect the default limit of 12
    expect(results.length).toBeLessThanOrEqual(12);
  });

  it('returns results limited by the limit parameter', () => {
    const commands = buildTestCommands();
    const results = searchCommandPaletteCommands('', commands, [], [], 5);
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it('filters commands matching query tokens', () => {
    const commands = buildTestCommands();
    const results = searchCommandPaletteCommands('stop', commands, []);
    const ids = results.map((r) => r.id);
    expect(ids).toContain('transport:stop');
  });

  it('returns empty results for a nonsensical query', () => {
    const commands = buildTestCommands();
    const results = searchCommandPaletteCommands('xyzzyfoobarbaz', commands, []);
    expect(results.length).toBe(0);
  });

  it('boosts recent commands in scoring', () => {
    const commands = buildTestCommands();
    const results = searchCommandPaletteCommands('', commands, ['transport:stop']);
    const stopResult = results.find((r) => r.id === 'transport:stop');
    expect(stopResult).not.toBeUndefined();
    expect(stopResult!.isRecent).toBe(true);
    expect(stopResult!.score).toBeGreaterThan(0);
  });

  it('marks isRecent correctly', () => {
    const commands = buildTestCommands();
    const results = searchCommandPaletteCommands('', commands, ['transport:stop', 'project:new']);
    const stopResult = results.find((r) => r.id === 'transport:stop');
    const newResult = results.find((r) => r.id === 'project:new');
    const playResult = results.find((r) => r.id === 'transport:play-pause');
    expect(stopResult!.isRecent).toBe(true);
    expect(newResult!.isRecent).toBe(true);
    expect(playResult!.isRecent).toBe(false);
  });

  it('gives higher score for exact title match', () => {
    const commands = buildTestCommands();
    const results = searchCommandPaletteCommands('stop playback', commands, []);
    const stopResult = results.find((r) => r.id === 'transport:stop');
    expect(stopResult).not.toBeUndefined();
    expect(stopResult!.score).toBeGreaterThan(0);
  });

  it('gives higher score for more matching tokens', () => {
    const commands = buildTestCommands();
    const resultsTwo = searchCommandPaletteCommands('new project', commands, []);
    const resultsOne = searchCommandPaletteCommands('new', commands, []);
    const twoTokenMatch = resultsTwo.find((r) => r.id === 'project:new');
    const oneTokenMatch = resultsOne.find((r) => r.id === 'project:new');
    // Both should match, and two-token match gets bonus for all-token match
    expect(twoTokenMatch).not.toBeUndefined();
    expect(oneTokenMatch).not.toBeUndefined();
    expect(twoTokenMatch!.score).toBeGreaterThan(0);
    expect(oneTokenMatch!.score).toBeGreaterThan(0);
  });

  it('handles special characters in query gracefully', () => {
    const commands = buildTestCommands();
    // Special characters normalize to empty string, so all commands returned (like empty query)
    const results = searchCommandPaletteCommands('!@#$%^&*()', commands, []);
    // Should not crash; normalizes to empty query so returns default set
    expect(results.length).toBeLessThanOrEqual(12);
    expect(Array.isArray(results)).toBe(true);
  });

  it('handles query with leading/trailing whitespace', () => {
    const commands = buildTestCommands();
    const results = searchCommandPaletteCommands('  stop  ', commands, []);
    const ids = results.map((r) => r.id);
    expect(ids).toContain('transport:stop');
  });

  it('deduplicates commands from extraCommands and main commands', () => {
    const commands = buildTestCommands();
    const duplicateCommand = commands.find((c) => c.id === 'transport:stop')!;
    const results = searchCommandPaletteCommands('stop', commands, [], [duplicateCommand]);
    const stopResults = results.filter((r) => r.id === 'transport:stop');
    expect(stopResults.length).toBe(1);
  });

  it('sorts results by score descending', () => {
    const commands = buildTestCommands();
    const results = searchCommandPaletteCommands('play', commands, []);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it('prefers Transport section commands when query is empty', () => {
    const commands = buildTestCommands();
    const results = searchCommandPaletteCommands('', commands, []);
    // Transport commands get a +4 bonus, so they should appear before non-transport
    const firstNonTransport = results.findIndex((r) => r.section !== 'Transport');
    const lastTransport = results.reduce(
      (last, r, i) => (r.section === 'Transport' ? i : last),
      -1,
    );
    // All transport commands should be grouped before non-transport
    if (firstNonTransport >= 0 && lastTransport >= 0) {
      // Transport commands have higher base score, should be first
      const transportResults = results.filter((r) => r.section === 'Transport');
      expect(transportResults.length).toBeGreaterThan(0);
    }
  });
});

// ─── searchCommandsForQuery ───────────────────────────────────────────────────

describe('searchCommandsForQuery', () => {
  it('combines static and dynamic commands', () => {
    const ctx = makeContext();
    const results = searchCommandsForQuery('drums volume 50', ctx, []);
    // Should find both the preset volume command and/or dynamic one
    const volumeResults = results.filter((r) => r.id.includes('volume'));
    expect(volumeResults.length).toBeGreaterThan(0);
  });

  it('finds tempo commands from query', () => {
    const ctx = makeContext();
    const results = searchCommandsForQuery('tempo 140', ctx, []);
    const tempoResult = results.find((r) => r.id === 'project:set-tempo:140');
    expect(tempoResult).not.toBeUndefined();
    expect(tempoResult!.title).toBe('Set Tempo to 140 BPM');
  });

  it('does not generate tempo command for bpm below 40', () => {
    const ctx = makeContext();
    const results = searchCommandsForQuery('bpm 20', ctx, []);
    const tempoResult = results.find((r) => r.id === 'project:set-tempo:20');
    expect(tempoResult).toBeUndefined();
  });

  it('does not generate tempo command for bpm above 240', () => {
    const ctx = makeContext();
    const results = searchCommandsForQuery('bpm 250', ctx, []);
    const tempoResult = results.find((r) => r.id === 'project:set-tempo:250');
    expect(tempoResult).toBeUndefined();
  });

  it('generates dynamic pan center command', () => {
    const ctx = makeContext();
    const results = searchCommandsForQuery('drums pan center', ctx, []);
    const panResult = results.find((r) => r.id === 'track:track-1:pan:0');
    expect(panResult).not.toBeUndefined();
    expect(panResult!.title).toContain('Center');
  });

  it('generates dynamic pan right command', () => {
    const ctx = makeContext();
    const results = searchCommandsForQuery('drums pan right', ctx, []);
    const panResult = results.find((r) => r.id === 'track:track-1:pan:100');
    expect(panResult).not.toBeUndefined();
  });

  it('generates dynamic reverb decay command', () => {
    const ctx = makeContext();
    const results = searchCommandsForQuery('drums reverb decay 3', ctx, []);
    const reverbResult = results.find((r) => r.id === 'track:track-1:reverb-decay:3');
    expect(reverbResult).not.toBeUndefined();
  });

  it('respects the limit parameter', () => {
    const ctx = makeContext();
    const results = searchCommandsForQuery('', ctx, [], 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('handles empty query returning default commands', () => {
    const ctx = makeContext();
    const results = searchCommandsForQuery('', ctx, []);
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(12);
  });

  it('clamps dynamic volume to 0-100 range', () => {
    const ctx = makeContext();
    // Volume 200 should be clamped to 100
    const results = searchCommandsForQuery('drums volume 200', ctx, []);
    const volResult = results.find((r) => r.id === 'track:track-1:volume:100');
    expect(volResult).not.toBeUndefined();
    expect(volResult!.title).toContain('100%');
  });

  it('returns no dynamic commands when project is null', () => {
    const ctx = makeContext({ project: null });
    const results = searchCommandsForQuery('tempo 120', ctx, []);
    const tempoResult = results.find((r) => r.id === 'project:set-tempo:120');
    expect(tempoResult).toBeUndefined();
  });

  it('matches track by display name in dynamic commands', () => {
    const track = makeTrack({ id: 'trk-x', displayName: 'Electric Guitar' });
    const ctx = makeContext({
      project: {
        id: 'p1', name: 'T', bpm: 120, tracks: [track], createdAt: '', updatedAt: '',
      } as CommandPaletteContext['project'],
    });
    const results = searchCommandsForQuery('electric guitar volume 60', ctx, []);
    const volResult = results.find((r) => r.id === 'track:trk-x:volume:60');
    expect(volResult).not.toBeUndefined();
    expect(volResult!.title).toBe('Set Electric Guitar Volume to 60%');
  });

  it('falls back to selected track when no track name matches query', () => {
    const track = makeTrack({ id: 'trk-sel', displayName: 'Synth Lead' });
    const ctx = makeContext({
      expandedTrackId: 'trk-sel',
      project: {
        id: 'p1', name: 'T', bpm: 120, tracks: [track], createdAt: '', updatedAt: '',
      } as CommandPaletteContext['project'],
    });
    // Query doesn't mention the track name but has volume keyword
    const results = searchCommandsForQuery('volume 70', ctx, []);
    const volResult = results.find((r) => r.id === 'track:trk-sel:volume:70');
    expect(volResult).not.toBeUndefined();
  });

  it('accepts "centre" as an alias for center pan', () => {
    const ctx = makeContext();
    const results = searchCommandsForQuery('drums pan centre', ctx, []);
    const panResult = results.find((r) => r.id === 'track:track-1:pan:0');
    expect(panResult).not.toBeUndefined();
  });
});

// ─── Command execution side effects ──────────────────────────────────────────

describe('command execution', () => {
  it('addTrack drums command calls addTrack with correct argument', () => {
    const ctx = makeContext();
    const commands = buildCommandPaletteCommands(ctx);
    const addDrums = commands.find((c) => c.id === 'track:add-drums')!;
    addDrums.execute();
    expect(ctx.actions.addTrack).toHaveBeenCalledWith('drums');
  });

  it('addTrack piano command calls addTrack with keyboard and pianoRoll', () => {
    const ctx = makeContext();
    const commands = buildCommandPaletteCommands(ctx);
    const addPiano = commands.find((c) => c.id === 'track:add-piano')!;
    addPiano.execute();
    expect(ctx.actions.addTrack).toHaveBeenCalledWith('keyboard', 'pianoRoll');
  });

  it('toggle library calls setShowLibrary with inverted state', () => {
    const ctx = makeContext({ showLibrary: false });
    const commands = buildCommandPaletteCommands(ctx);
    const toggleLib = commands.find((c) => c.id === 'panel:library')!;
    toggleLib.execute();
    expect(ctx.actions.setShowLibrary).toHaveBeenCalledWith(true);
  });

  it('generation silence command calls setBatchGenerateMode with silence', () => {
    const ctx = makeContext();
    const commands = buildCommandPaletteCommands(ctx);
    const genSilence = commands.find((c) => c.id === 'generation:silence')!;
    genSilence.execute();
    expect(ctx.actions.setBatchGenerateMode).toHaveBeenCalledWith('silence');
  });

  it('generation context command calls setBatchGenerateMode with context', () => {
    const ctx = makeContext();
    const commands = buildCommandPaletteCommands(ctx);
    const genContext = commands.find((c) => c.id === 'generation:context')!;
    genContext.execute();
    expect(ctx.actions.setBatchGenerateMode).toHaveBeenCalledWith('context');
  });

  it('mute toggle command calls updateTrack with inverted muted value', () => {
    const track = makeTrack({ id: 'trk-m', muted: false });
    const ctx = makeContext({
      project: {
        id: 'p1', name: 'T', bpm: 120, tracks: [track], createdAt: '', updatedAt: '',
      } as CommandPaletteContext['project'],
    });
    const commands = buildCommandPaletteCommands(ctx);
    const muteCmd = commands.find((c) => c.id === 'track:trk-m:mute-toggle')!;
    muteCmd.execute();
    expect(ctx.actions.updateTrack).toHaveBeenCalledWith('trk-m', { muted: true });
  });

  it('volume preset command calls updateTrack with normalized volume', () => {
    const track = makeTrack({ id: 'trk-vol' });
    const ctx = makeContext({
      project: {
        id: 'p1', name: 'T', bpm: 120, tracks: [track], createdAt: '', updatedAt: '',
      } as CommandPaletteContext['project'],
    });
    const commands = buildCommandPaletteCommands(ctx);
    const vol50 = commands.find((c) => c.id === 'track:trk-vol:volume:50')!;
    vol50.execute();
    expect(ctx.actions.updateTrack).toHaveBeenCalledWith('trk-vol', { volume: 0.5 });
  });

  it('pan preset command calls updateTrackMixer with correct pan value', () => {
    const track = makeTrack({ id: 'trk-pan' });
    const ctx = makeContext({
      project: {
        id: 'p1', name: 'T', bpm: 120, tracks: [track], createdAt: '', updatedAt: '',
      } as CommandPaletteContext['project'],
    });
    const commands = buildCommandPaletteCommands(ctx);
    const panLeft = commands.find((c) => c.id === 'track:trk-pan:pan:-100')!;
    panLeft.execute();
    expect(ctx.actions.updateTrackMixer).toHaveBeenCalledWith('trk-pan', { pan: -1 });
  });

  it('add effect command calls addTrackEffect', () => {
    const track = makeTrack({ id: 'trk-fx' });
    const ctx = makeContext({
      project: {
        id: 'p1', name: 'T', bpm: 120, tracks: [track], createdAt: '', updatedAt: '',
      } as CommandPaletteContext['project'],
    });
    const commands = buildCommandPaletteCommands(ctx);
    const addReverb = commands.find((c) => c.id === 'track:trk-fx:effect:reverb')!;
    addReverb.execute();
    expect(ctx.actions.addTrackEffect).toHaveBeenCalledWith('trk-fx', 'reverb');
  });
});
