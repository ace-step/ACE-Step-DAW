import { describe, it, expect } from 'vitest';
import { searchCommandPaletteCommands, type CommandPaletteCommand } from '../commandPalette';

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function makeCommand(overrides?: Partial<CommandPaletteCommand>): CommandPaletteCommand {
  const id = overrides?.id ?? `cmd-${Math.random().toString(36).slice(2, 8)}`;
  const title = overrides?.title ?? 'Test Command';
  const section = overrides?.section ?? 'General';
  const keywords = overrides?.keywords ?? [];
  const aliases = overrides?.aliases ?? [];
  return {
    id,
    kind: 'action',
    title,
    section,
    keywords,
    aliases,
    searchText: normalize([title, section, '', ...keywords, ...aliases].join(' ')),
    execute: () => {},
    ...overrides,
    // Ensure searchText is rebuilt from the actual values
  };
}

function makeCmd(id: string, title: string, section: string, keywords: string[] = [], aliases: string[] = []): CommandPaletteCommand {
  return {
    id,
    kind: 'action',
    title,
    section,
    keywords,
    aliases,
    searchText: normalize([title, section, ...keywords, ...aliases].join(' ')),
    execute: () => {},
  };
}

const PLAY_CMD = makeCmd('play', 'Play / Pause', 'Transport', ['playback', 'start'], ['toggle play']);
const STOP_CMD = makeCmd('stop', 'Stop', 'Transport', ['halt']);
const MIXER_CMD = makeCmd('mixer', 'Show Mixer', 'View', ['panel', 'faders'], ['toggle mixer']);
const EXPORT_CMD = makeCmd('export', 'Export Audio', 'File', ['wav', 'bounce', 'render'], ['bounce']);
const UNDO_CMD = makeCmd('undo', 'Undo', 'Edit', ['revert'], ['ctrl+z']);

const ALL_COMMANDS = [PLAY_CMD, STOP_CMD, MIXER_CMD, EXPORT_CMD, UNDO_CMD];

describe('searchCommandPaletteCommands', () => {
  it('returns all commands when query is empty', () => {
    const results = searchCommandPaletteCommands('', ALL_COMMANDS, []);
    expect(results.length).toBe(ALL_COMMANDS.length);
  });

  it('filters commands matching the query', () => {
    const results = searchCommandPaletteCommands('play', ALL_COMMANDS, []);
    expect(results.some((r) => r.id === 'play')).toBe(true);
    expect(results.every((r) => r.score > 0)).toBe(true);
  });

  it('ranks exact title matches highest', () => {
    const results = searchCommandPaletteCommands('Undo', ALL_COMMANDS, []);
    expect(results[0].id).toBe('undo');
  });

  it('matches against keywords', () => {
    const results = searchCommandPaletteCommands('bounce', ALL_COMMANDS, []);
    expect(results.some((r) => r.id === 'export')).toBe(true);
  });

  it('matches against aliases', () => {
    const results = searchCommandPaletteCommands('toggle mixer', ALL_COMMANDS, []);
    expect(results.some((r) => r.id === 'mixer')).toBe(true);
  });

  it('boosts recent commands in empty query', () => {
    const results = searchCommandPaletteCommands('', ALL_COMMANDS, ['export']);
    const exportIdx = results.findIndex((r) => r.id === 'export');
    expect(results[exportIdx].isRecent).toBe(true);
    expect(results[exportIdx].score).toBeGreaterThan(0);
  });

  it('boosts recent commands in filtered results', () => {
    const commands = [
      makeCommand({ id: 'a', title: 'Audio Export', keywords: ['audio'], aliases: [] }),
      makeCommand({ id: 'b', title: 'Audio Import', keywords: ['audio'], aliases: [] }),
    ];
    const results = searchCommandPaletteCommands('audio', commands, ['b']);
    // Both match, but 'b' should be boosted by recency
    const aIdx = results.findIndex((r) => r.id === 'a');
    const bIdx = results.findIndex((r) => r.id === 'b');
    expect(results[bIdx].score).toBeGreaterThan(results[aIdx].score);
  });

  it('returns empty array when no commands match', () => {
    const results = searchCommandPaletteCommands('xyznonexistent', ALL_COMMANDS, []);
    expect(results).toEqual([]);
  });

  it('respects the limit parameter', () => {
    const results = searchCommandPaletteCommands('', ALL_COMMANDS, [], [], 2);
    expect(results.length).toBe(2);
  });

  it('deduplicates commands from extra and main lists', () => {
    const extra = [makeCommand({ id: 'play', title: 'Play / Pause', section: 'Transport', keywords: [], aliases: [], execute: () => {} })];
    const results = searchCommandPaletteCommands('play', ALL_COMMANDS, [], extra);
    const playResults = results.filter((r) => r.id === 'play');
    expect(playResults).toHaveLength(1);
  });

  it('handles multi-token queries', () => {
    const results = searchCommandPaletteCommands('show mixer', ALL_COMMANDS, []);
    expect(results.some((r) => r.id === 'mixer')).toBe(true);
  });

  it('case-insensitive matching', () => {
    const results = searchCommandPaletteCommands('EXPORT', ALL_COMMANDS, []);
    expect(results.some((r) => r.id === 'export')).toBe(true);
  });
});
