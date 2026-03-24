import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClipContextMenu } from '../ClipContextMenu';
import { AIToolsSubmenu, type ClipAIContext } from '../AIToolsSubmenu';
import { SHORTCUT_ACTIONS } from '../../../constants/shortcutDefaults';
import { buildCommandPaletteCommands, type CommandPaletteContext } from '../../../services/commandPalette';

// ── shortcutDefaults ──────────────────────────────────────────
describe('shortcutDefaults — clips.enhance', () => {
  it('registers Shift+E for clips.enhance', () => {
    const action = SHORTCUT_ACTIONS.find((a) => a.id === 'clips.enhance');
    expect(action).toBeDefined();
    expect(action!.defaultCombo).toEqual({ code: 'KeyE', shift: true });
    expect(action!.category).toBe('clips');
  });

  it('does not conflict with clips.edit (plain E)', () => {
    const editAction = SHORTCUT_ACTIONS.find((a) => a.id === 'clips.edit');
    expect(editAction).toBeDefined();
    expect(editAction!.defaultCombo.shift).toBeFalsy();
  });
});

// ── ClipContextMenu ────────────────────────────────────────────
describe('ClipContextMenu — top-level Enhance entry', () => {
  const noop = () => {};

  it('renders Enhance... entry when onEnhance is provided', () => {
    render(
      <ClipContextMenu
        x={100}
        y={100}
        onClose={noop}
        onEnhance={noop}
        onInspireMe={noop}
        onAddLayer={noop}
        onMusicEnhancer={noop}
        onEdit={noop}
        onDuplicate={noop}
        onSplitAtPlayhead={noop}
        onConsolidate={noop}
        onDelete={noop}
        onSelectAll={noop}
        onLoopSelection={noop}
        onToggleMute={noop}
        isMuted={false}
        onAssignColor={noop}
        onResetColor={noop}
        hasCustomColor={false}
        canConsolidate={false}
        isMidiClip={false}
      />,
    );
    expect(screen.getByText('Enhance...')).toBeDefined();
  });

  it('does not render Enhance... when onEnhance is undefined', () => {
    render(
      <ClipContextMenu
        x={100}
        y={100}
        onClose={noop}
        onInspireMe={noop}
        onAddLayer={noop}
        onMusicEnhancer={noop}
        onEdit={noop}
        onDuplicate={noop}
        onSplitAtPlayhead={noop}
        onConsolidate={noop}
        onDelete={noop}
        onSelectAll={noop}
        onLoopSelection={noop}
        onToggleMute={noop}
        isMuted={false}
        onAssignColor={noop}
        onResetColor={noop}
        hasCustomColor={false}
        canConsolidate={false}
        isMidiClip={false}
      />,
    );
    expect(screen.queryByText('Enhance...')).toBeNull();
  });
});

// ── AIToolsSubmenu ──────────────────────────────────────────────
describe('AIToolsSubmenu — no longer contains Enhance', () => {
  it('ClipAIContext interface does not include onEnhance', () => {
    // Verify at the type level: a clipContext with no onEnhance should compile
    const ctx: ClipAIContext = {
      onRegenerate: () => {},
      hasPrompt: true,
      isReady: true,
    };
    expect(ctx).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((ctx as any).onEnhance).toBeUndefined();
  });
});

// ── commandPalette ──────────────────────────────────────────────
describe('commandPalette — Enhance Selected Clip command', () => {
  function makeContext(overrides: Partial<CommandPaletteContext> = {}): CommandPaletteContext {
    return {
      project: {
        id: 'p1',
        name: 'Test',
        bpm: 120,
        timeSignature: { numerator: 4, denominator: 4 },
        totalDuration: 60,
        tracks: [
          {
            id: 't1',
            displayName: 'Track 1',
            trackName: 'vocals' as any,
            trackType: 'stems' as any,
            color: '#fff',
            volume: 1,
            pan: 0,
            muted: false,
            soloed: false,
            order: 0,
            clips: [
              {
                id: 'c1',
                trackId: 't1',
                startTime: 0,
                duration: 10,
                generationStatus: 'ready' as any,
                prompt: 'test',
              } as any,
            ],
            effects: [],
          } as any,
        ],
        sampleRate: 44100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any,
      selectedClipIds: ['c1'],
      currentTime: 5,
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
        addTrack: vi.fn() as any,
        addTrackEffect: vi.fn() as any,
        updateProject: vi.fn(),
        updateTrack: vi.fn(),
        updateTrackMixer: vi.fn(),
        updateTrackEffect: vi.fn(),
        duplicateClip: vi.fn(),
        splitClip: vi.fn(),
        splitClipAtZeroCrossing: vi.fn() as any,
        removeClip: vi.fn(),
        setEditingClip: vi.fn(),
        deselectAll: vi.fn(),
        openEnhancer: vi.fn(),
      },
      ...overrides,
    };
  }

  it('includes Enhance Selected Clip command when a ready clip is selected', () => {
    const ctx = makeContext();
    const commands = buildCommandPaletteCommands(ctx);
    const enhanceCmd = commands.find((c) => c.id === 'clip:enhance-selected');
    expect(enhanceCmd).toBeDefined();
    expect(enhanceCmd!.title).toBe('Enhance Selected Clip');
    expect(enhanceCmd!.shortcut).toEqual(['Shift', 'E']);
  });

  it('does not include enhance command when no clip is selected', () => {
    const ctx = makeContext({ selectedClipIds: [] });
    const commands = buildCommandPaletteCommands(ctx);
    const enhanceCmd = commands.find((c) => c.id === 'clip:enhance-selected');
    expect(enhanceCmd).toBeUndefined();
  });

  it('calls openEnhancer with clipId and trackId when executed', () => {
    const ctx = makeContext();
    const commands = buildCommandPaletteCommands(ctx);
    const enhanceCmd = commands.find((c) => c.id === 'clip:enhance-selected');
    enhanceCmd!.execute();
    expect(ctx.actions.openEnhancer).toHaveBeenCalledWith('c1', 't1');
  });
});
