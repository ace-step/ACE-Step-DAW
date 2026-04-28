import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ClipContextMenu } from '../../src/components/timeline/ClipContextMenu';
import { TRACK_COLOR_PALETTE } from '../../src/constants/colorPalette';

function renderMenu(overrides: Partial<Parameters<typeof ClipContextMenu>[0]> = {}) {
  const defaults = {
    x: 100,
    y: 100,
    onClose: vi.fn(),
    onInspireMe: vi.fn(),
    onAddLayer: vi.fn(),
    onMusicEnhancer: vi.fn(),
    onEdit: vi.fn(),
    onDuplicate: vi.fn(),
    onSplitAtPlayhead: vi.fn(),
    onConsolidate: vi.fn(),
    onDelete: vi.fn(),
    onSelectAll: vi.fn(),
    onLoopSelection: vi.fn(),
    onToggleMute: vi.fn(),
    isMuted: false,
    onAssignColor: vi.fn(),
    onResetColor: vi.fn(),
    hasCustomColor: false,
    canConsolidate: false,
    isMidiClip: false,
  };
  return { ...defaults, ...overrides, result: render(<ClipContextMenu {...defaults} {...overrides} />) };
}

describe('ClipContextMenu split option', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('renders "Split" button', () => {
    renderMenu();
    screen.getByText('Split'); // getBy* throws if not found
  });

  it('calls onSplitAtPlayhead when clicked', () => {
    const onSplitAtPlayhead = vi.fn();
    renderMenu({ onSplitAtPlayhead });
    fireEvent.click(screen.getByText('Split'));
    expect(onSplitAtPlayhead).toHaveBeenCalledOnce();
  });

  it('shows ⌘E shortcut hint', () => {
    renderMenu();
    const label = screen.getByText('Split');
    const button = label.closest('button')!;
    const shortcutKbd = button.querySelector('kbd');
    expect(shortcutKbd?.textContent).toBe('⌘E');
  });
});

describe('ClipContextMenu inline color swatches', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('renders inline color swatches', () => {
    renderMenu();
    const palette = screen.getByTestId('color-swatch-palette');
    expect(palette).not.toBeNull();
    const buttons = palette.querySelectorAll('button');
    expect(buttons.length).toBe(TRACK_COLOR_PALETTE.length);
  });

  it('emits the selected palette color', () => {
    const onAssignColor = vi.fn();
    renderMenu({ onAssignColor });
    fireEvent.click(screen.getByLabelText(`Assign clip color ${TRACK_COLOR_PALETTE[0]}`));
    expect(onAssignColor).toHaveBeenCalledWith(TRACK_COLOR_PALETTE[0]);
  });

  it('shows reset button when clip has custom color', () => {
    renderMenu({ hasCustomColor: true });
    const resetBtn = screen.getByLabelText('Reset to track color');
    expect(resetBtn).not.toBeNull();
  });

  it('emits reset when reset button clicked', () => {
    const onResetColor = vi.fn();
    renderMenu({ hasCustomColor: true, onResetColor });
    fireEvent.click(screen.getByLabelText('Reset to track color'));
    expect(onResetColor).toHaveBeenCalledOnce();
  });

  it('does not show reset button when no custom color', () => {
    renderMenu({ hasCustomColor: false });
    expect(screen.queryByLabelText('Reset to track color')).toBeNull();
  });
});

describe('ClipContextMenu AI Tools submenu', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('renders AI Tools submenu trigger', () => {
    renderMenu();
    screen.getByText('AI Tools'); // getBy* throws if not found
  });

  it('shows AI Tools submenu on hover', () => {
    renderMenu();
    const trigger = screen.getByTestId('ai-tools-submenu-trigger');
    fireEvent.mouseEnter(trigger);
    act(() => { vi.advanceTimersByTime(100); });
    screen.getByText('Inspire Me'); // getBy* throws if not found
    screen.getByText('Add a Layer');
    screen.getByText('Music Enhancer');
  });

  it('shows clip-specific AI tools when clipAIContext is provided', () => {
    renderMenu({
      clipAIContext: {
        onRegenerate: vi.fn(),
        onAnalyze: vi.fn(),
        hasPrompt: true,
        isReady: true,
      },
    });
    const trigger = screen.getByTestId('ai-tools-submenu-trigger');
    fireEvent.mouseEnter(trigger);
    act(() => { vi.advanceTimersByTime(100); });
    screen.getByText('Regenerate'); // getBy* throws if not found
    screen.getByText('Analyze Audio...');
  });
});
