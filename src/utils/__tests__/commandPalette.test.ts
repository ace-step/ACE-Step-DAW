import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildCommandList, filterCommands } from '../commandPalette';
import type { Command } from '../commandPalette';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../store/uiStore', () => ({
  useUIStore: {
    getState: vi.fn(() => ({
      setShowNewProjectDialog: vi.fn(),
      setShowProjectListDialog: vi.fn(),
      openGenerationPanelView: vi.fn(),
      setShowExportDialog: vi.fn(),
      setShowInstrumentPicker: vi.fn(),
      showMixer: false,
      setShowMixer: vi.fn(),
      showLibrary: false,
      setShowLibrary: vi.fn(),
      showSmartControls: false,
      setShowSmartControls: vi.fn(),
      toggleTempoLane: vi.fn(),
      toggleAIAssistant: vi.fn(),
      toggleSpectrumAnalyzer: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      zoomReset: vi.fn(),
      setPixelsPerSecond: vi.fn(),
      keyboardContext: { scope: 'timeline' },
      deselectAll: vi.fn(),
      selectClips: vi.fn(),
      toggleSnap: vi.fn(),
      setBatchGenerateMode: vi.fn(),
      setShowKeyboardShortcutsDialog: vi.fn(),
    })),
  },
}));

vi.mock('../../store/projectStore', () => ({
  useProjectStore: {
    getState: vi.fn(() => ({
      undo: vi.fn(),
      redo: vi.fn(),
      project: { tracks: [] },
    })),
  },
}));

vi.mock('../../store/transportStore', () => ({
  useTransportStore: {
    getState: vi.fn(() => ({
      isPlaying: false,
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      toggleLoop: vi.fn(),
      toggleMetronome: vi.fn(),
    })),
  },
}));

vi.mock('../timelineZoom', () => ({
  DEFAULT_TIMELINE_PIXELS_PER_SECOND: 100,
}));

// ─── buildCommandList ─────────────────────────────────────────────────────────

describe('buildCommandList', () => {
  it('returns an array of commands', () => {
    const commands = buildCommandList();
    expect(Array.isArray(commands)).toBe(true);
    expect(commands.length).toBeGreaterThan(0);
  });

  it('every command has id, label, category, and action', () => {
    const commands = buildCommandList();
    for (const cmd of commands) {
      expect(typeof cmd.id).toBe('string');
      expect(cmd.id.length).toBeGreaterThan(0);
      expect(typeof cmd.label).toBe('string');
      expect(cmd.label.length).toBeGreaterThan(0);
      expect(typeof cmd.category).toBe('string');
      expect(cmd.category.length).toBeGreaterThan(0);
      expect(typeof cmd.action).toBe('function');
    }
  });

  it('has unique command ids', () => {
    const commands = buildCommandList();
    const ids = commands.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it('includes expected transport commands', () => {
    const commands = buildCommandList();
    const ids = commands.map((c) => c.id);
    expect(ids).toContain('play-pause');
    expect(ids).toContain('stop');
    expect(ids).toContain('toggle-loop');
    expect(ids).toContain('toggle-metronome');
  });

  it('includes expected project commands', () => {
    const commands = buildCommandList();
    const ids = commands.map((c) => c.id);
    expect(ids).toContain('new-project');
    expect(ids).toContain('open-project');
    expect(ids).toContain('settings');
    expect(ids).toContain('export');
    expect(ids).toContain('add-track');
  });

  it('includes expected view commands', () => {
    const commands = buildCommandList();
    const ids = commands.map((c) => c.id);
    expect(ids).toContain('toggle-mixer');
    expect(ids).toContain('toggle-library');
    expect(ids).toContain('toggle-smart-controls');
    expect(ids).toContain('toggle-tempo-lane');
    expect(ids).toContain('toggle-ai-assistant');
    expect(ids).toContain('toggle-spectrum-analyzer');
  });

  it('includes zoom commands', () => {
    const commands = buildCommandList();
    const ids = commands.map((c) => c.id);
    expect(ids).toContain('zoom-in');
    expect(ids).toContain('zoom-out');
    expect(ids).toContain('zoom-reset');
  });

  it('includes edit commands', () => {
    const commands = buildCommandList();
    const ids = commands.map((c) => c.id);
    expect(ids).toContain('undo');
    expect(ids).toContain('redo');
    expect(ids).toContain('select-all-clips');
    expect(ids).toContain('deselect-all');
    expect(ids).toContain('toggle-snap');
  });

  it('includes generation commands', () => {
    const commands = buildCommandList();
    const ids = commands.map((c) => c.id);
    expect(ids).toContain('generate-silence');
    expect(ids).toContain('generate-context');
  });

  it('includes help commands', () => {
    const commands = buildCommandList();
    const ids = commands.map((c) => c.id);
    expect(ids).toContain('keyboard-shortcuts');
  });

  it('assigns correct categories', () => {
    const commands = buildCommandList();
    const categories = new Set(commands.map((c) => c.category));
    expect(categories.has('Transport')).toBe(true);
    expect(categories.has('Project')).toBe(true);
    expect(categories.has('View')).toBe(true);
    expect(categories.has('Edit')).toBe(true);
    expect(categories.has('Generation')).toBe(true);
    expect(categories.has('Help')).toBe(true);
  });

  it('transport commands have expected shortcuts', () => {
    const commands = buildCommandList();
    const playPause = commands.find((c) => c.id === 'play-pause');
    const stop = commands.find((c) => c.id === 'stop');
    const loop = commands.find((c) => c.id === 'toggle-loop');
    const metronome = commands.find((c) => c.id === 'toggle-metronome');
    expect(playPause!.shortcut).toBe('Space');
    expect(stop!.shortcut).toBe('Enter');
    expect(loop!.shortcut).toBe('L');
    expect(metronome!.shortcut).toBe('K');
  });

  it('some commands do not have shortcuts', () => {
    const commands = buildCommandList();
    const spectrumCmd = commands.find((c) => c.id === 'toggle-spectrum-analyzer');
    expect(spectrumCmd!.shortcut).toBeUndefined();
  });
});

// ─── filterCommands ───────────────────────────────────────────────────────────

describe('filterCommands', () => {
  let allCommands: Command[];

  beforeEach(() => {
    allCommands = buildCommandList();
  });

  it('returns all commands when query is empty', () => {
    const result = filterCommands(allCommands, '');
    expect(result.length).toBe(allCommands.length);
  });

  it('returns all commands when query is only whitespace', () => {
    const result = filterCommands(allCommands, '   ');
    expect(result.length).toBe(allCommands.length);
  });

  it('filters by label match', () => {
    const result = filterCommands(allCommands, 'undo');
    const ids = result.map((c) => c.id);
    expect(ids).toContain('undo');
  });

  it('filters by category', () => {
    const result = filterCommands(allCommands, 'transport');
    // All results should be in Transport category
    for (const cmd of result) {
      expect(cmd.category).toBe('Transport');
    }
    expect(result.length).toBeGreaterThan(0);
  });

  it('supports multi-word query matching across label and category', () => {
    // "Toggle" in label, "View" in category
    const result = filterCommands(allCommands, 'toggle view');
    expect(result.length).toBeGreaterThan(0);
    for (const cmd of result) {
      const haystack = `${cmd.label} ${cmd.category}`.toLowerCase();
      expect(haystack).toContain('toggle');
      expect(haystack).toContain('view');
    }
  });

  it('is case insensitive', () => {
    const lower = filterCommands(allCommands, 'stop');
    const upper = filterCommands(allCommands, 'STOP');
    const mixed = filterCommands(allCommands, 'StOp');
    expect(lower.length).toBe(upper.length);
    expect(lower.length).toBe(mixed.length);
    expect(lower.map((c) => c.id)).toEqual(upper.map((c) => c.id));
  });

  it('returns empty array when no commands match', () => {
    const result = filterCommands(allCommands, 'xyznonexistent');
    expect(result.length).toBe(0);
  });

  it('handles special characters without crashing', () => {
    const result = filterCommands(allCommands, '!@#$%^&*()');
    // Special chars won't match anything
    expect(result.length).toBe(0);
  });

  it('handles regex-like characters safely', () => {
    // The filter uses .includes(), not regex, so these should not crash
    const result = filterCommands(allCommands, '[test]');
    expect(Array.isArray(result)).toBe(true);
  });

  it('matches partial words', () => {
    const result = filterCommands(allCommands, 'mix');
    const ids = result.map((c) => c.id);
    expect(ids).toContain('toggle-mixer');
  });

  it('requires all words to match', () => {
    const result = filterCommands(allCommands, 'toggle nonexistent');
    expect(result.length).toBe(0);
  });

  it('handles multiple spaces between words', () => {
    const result1 = filterCommands(allCommands, 'toggle loop');
    const result2 = filterCommands(allCommands, 'toggle   loop');
    expect(result1.map((c) => c.id)).toEqual(result2.map((c) => c.id));
  });

  it('filters correctly with single character query', () => {
    const result = filterCommands(allCommands, 'e');
    // Should match commands containing "e" in label or category
    expect(result.length).toBeGreaterThan(0);
    for (const cmd of result) {
      const haystack = `${cmd.label} ${cmd.category}`.toLowerCase();
      expect(haystack).toContain('e');
    }
  });
});
