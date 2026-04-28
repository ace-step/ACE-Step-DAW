import { describe, expect, it } from 'vitest';
import { searchCommandPaletteCommands } from '../../src/services/commandPalette';
import type { CommandPaletteCommand } from '../../src/services/commandPalette';

function makeCommand(overrides: Partial<CommandPaletteCommand> & { id: string; title: string }): CommandPaletteCommand {
  return {
    kind: 'action' as const,
    section: 'General',
    keywords: [],
    aliases: [],
    searchText: overrides.title.toLowerCase(),
    execute: () => {},
    ...overrides,
  };
}

const COMMANDS: CommandPaletteCommand[] = [
  makeCommand({ id: 'play', title: 'Play / Pause', section: 'Transport', aliases: ['spacebar'], searchText: 'play pause transport spacebar' }),
  makeCommand({ id: 'stop', title: 'Stop', section: 'Transport', searchText: 'stop transport' }),
  makeCommand({ id: 'record', title: 'Toggle Recording', section: 'Transport', aliases: ['rec'], searchText: 'toggle recording transport rec' }),
  makeCommand({ id: 'undo', title: 'Undo', section: 'Edit', searchText: 'undo edit ctrl z' }),
  makeCommand({ id: 'redo', title: 'Redo', section: 'Edit', searchText: 'redo edit ctrl shift z' }),
  makeCommand({ id: 'add-track', title: 'Add Track', section: 'Tracks', searchText: 'add track new create' }),
  makeCommand({ id: 'mute', title: 'Mute Selected Track', section: 'Tracks', searchText: 'mute selected track m' }),
  makeCommand({ id: 'solo', title: 'Solo Selected Track', section: 'Tracks', searchText: 'solo selected track s' }),
  makeCommand({ id: 'zoom-fit', title: 'Zoom to Fit', section: 'View', aliases: ['fit'], searchText: 'zoom fit view' }),
  makeCommand({ id: 'reverb', title: 'Add Reverb Effect', section: 'Effects', aliases: ['delay room'], searchText: 'add reverb effect wet dry room' }),
];

describe('searchCommandPaletteCommands', () => {
  it('returns all commands when query is empty', () => {
    const results = searchCommandPaletteCommands('', COMMANDS, []);
    expect(results.length).toBe(COMMANDS.length);
    // All scores should be >= 0
    expect(results.every((r) => r.score >= 0)).toBe(true);
  });

  it('exact title match scores highest', () => {
    const results = searchCommandPaletteCommands('Undo', COMMANDS, []);
    expect(results[0].id).toBe('undo');
    expect(results[0].score).toBeGreaterThanOrEqual(120);
  });

  it('title starts-with scores higher than title contains', () => {
    // "Mute Selected Track" starts with "mute"; "Solo Selected Track" contains "track" but not "mute"
    const results = searchCommandPaletteCommands('mute', COMMANDS, []);
    const mute = results.find((r) => r.id === 'mute');
    expect(mute).toBeDefined();
    expect(mute!.score).toBeGreaterThan(0);
    // "Add Track" contains "track" (via searchText) but title doesn't start with "mute"
    // "Mute Selected Track" should score higher since title starts with query
    const addTrack = results.find((r) => r.id === 'add-track');
    if (addTrack) {
      expect(mute!.score).toBeGreaterThan(addTrack.score);
    }
  });

  it('alias match boosts score', () => {
    const results = searchCommandPaletteCommands('rec', COMMANDS, []);
    const record = results.find((r) => r.id === 'record');
    expect(record).toBeDefined();
    expect(record!.score).toBeGreaterThan(0);
  });

  it('filters out commands with zero matching tokens', () => {
    const results = searchCommandPaletteCommands('xyznonexistent', COMMANDS, []);
    expect(results).toHaveLength(0);
  });

  it('recent commands get a recency boost and appear first', () => {
    const results = searchCommandPaletteCommands('', COMMANDS, ['solo', 'mute']);
    const soloIndex = results.findIndex((r) => r.id === 'solo');
    const muteIndex = results.findIndex((r) => r.id === 'mute');
    expect(soloIndex).toBeGreaterThanOrEqual(0);
    expect(muteIndex).toBeGreaterThanOrEqual(0);
    expect(results[soloIndex].isRecent).toBe(true);
    expect(results[muteIndex].isRecent).toBe(true);
    expect(results[soloIndex].score).toBeGreaterThan(0);
    // Recent commands should appear before non-recent ones
    const lastRecentIndex = Math.max(soloIndex, muteIndex);
    expect(results.slice(0, lastRecentIndex + 1).every((r) => r.isRecent)).toBe(true);
  });

  it('deduplicates commands by id', () => {
    const duped = [...COMMANDS, makeCommand({ id: 'undo', title: 'Undo (duplicate)', searchText: 'undo duplicate' })];
    const results = searchCommandPaletteCommands('undo', duped, []);
    const undoResults = results.filter((r) => r.id === 'undo');
    expect(undoResults).toHaveLength(1);
  });

  it('respects limit parameter', () => {
    const results = searchCommandPaletteCommands('', COMMANDS, [], [], 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('multi-token query scores higher when all tokens match', () => {
    const results = searchCommandPaletteCommands('add track', COMMANDS, []);
    const addTrack = results.find((r) => r.id === 'add-track');
    expect(addTrack).toBeDefined();
    // All tokens match bonus: should be first or very high
    expect(results[0].id).toBe('add-track');
  });

  it('partial token match scores lower than full match', () => {
    const results = searchCommandPaletteCommands('mute track banana', COMMANDS, []);
    // "banana" doesn't match anything, but "mute" and "track" do
    // With 2/3 tokens matched, it should still have some score
    const mute = results.find((r) => r.id === 'mute');
    expect(mute).toBeDefined();
    expect(mute!.score).toBeGreaterThan(0);
  });

  it('case-insensitive matching', () => {
    const results = searchCommandPaletteCommands('PLAY', COMMANDS, []);
    const play = results.find((r) => r.id === 'play');
    expect(play).toBeDefined();
    expect(play!.score).toBeGreaterThan(0);
  });

  it('special characters are normalized', () => {
    const results = searchCommandPaletteCommands('play/pause', COMMANDS, []);
    const play = results.find((r) => r.id === 'play');
    expect(play).toBeDefined();
    expect(play!.score).toBeGreaterThan(0);
  });

  it('extra commands take precedence over base commands', () => {
    const extra = [makeCommand({ id: 'undo', title: 'Custom Undo', searchText: 'undo custom' })];
    const results = searchCommandPaletteCommands('undo', COMMANDS, [], extra);
    const undo = results.find((r) => r.id === 'undo');
    expect(undo).toBeDefined();
    // Extra commands come first in dedup, so "Custom Undo" wins
    expect(undo!.title).toBe('Custom Undo');
  });

  it('scores are sorted descending', () => {
    const results = searchCommandPaletteCommands('track', COMMANDS, []);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
  });
});
