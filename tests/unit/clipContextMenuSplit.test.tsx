import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ClipContextMenu } from '../../src/components/timeline/ClipContextMenu';
import { TRACK_COLOR_PALETTE } from '../../src/constants/colorPalette';

function renderMenu(overrides: Partial<Parameters<typeof ClipContextMenu>[0]> = {}) {
  const defaults = {
    x: 100,
    y: 100,
    onEdit: vi.fn(),
    onGenerate: vi.fn(),
    onRegenerate: vi.fn(),
    onOpenMidi: vi.fn(),
    onExportMidi: vi.fn(),
    onDuplicate: vi.fn(),
    onConsolidate: vi.fn(),
    onDelete: vi.fn(),
    onAddLayer: vi.fn(),
    onCreateCover: vi.fn(),
    onRepaint: vi.fn(),
    onVocal2BGM: vi.fn(),
    onAnalyze: vi.fn(),
    onSeparateStems: vi.fn(),
    onConvertToMidi: vi.fn(),
    onCreateQuickSampler: vi.fn(),
    onQuantizeAudio: vi.fn(),
    onClearAudioQuantize: vi.fn(),
    onSplitAtPlayhead: vi.fn(),
    onAssignColor: vi.fn(),
    onResetColor: vi.fn(),
    onClose: vi.fn(),
    hasPrompt: true,
    isReady: true,
    isMidiClip: false,
    isVocalTrack: false,
    hasAudio: true,
    hasWarpMarkers: false,
    canConsolidate: false,
    hasCustomColor: false,
  };
  return { ...defaults, ...overrides, result: render(<ClipContextMenu {...defaults} {...overrides} />) };
}

describe('ClipContextMenu split option', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('renders "Split at Playhead" button', () => {
    renderMenu();
    expect(screen.getByText(/Split at Playhead/)).toBeTruthy();
  });

  it('calls onSplitAtPlayhead when clicked', () => {
    const onSplitAtPlayhead = vi.fn();
    renderMenu({ onSplitAtPlayhead });
    fireEvent.click(screen.getByText(/Split at Playhead/));
    expect(onSplitAtPlayhead).toHaveBeenCalledOnce();
  });

  it('shows S shortcut hint', () => {
    renderMenu();
    const label = screen.getByText(/Split at Playhead/);
    // The shortcut is rendered as a sibling span inside the button
    const button = label.closest('button')!;
    const shortcutSpan = button.querySelectorAll('span')[1];
    expect(shortcutSpan?.textContent).toBe('S');
  });

  it('opens an Assign Color submenu on hover and emits the selected palette color', () => {
    const onAssignColor = vi.fn();
    renderMenu({ onAssignColor });

    const trigger = screen.getByText('Assign Color').closest('[data-testid="color-submenu-trigger"]')!;
    fireEvent.mouseEnter(trigger);
    act(() => { vi.advanceTimersByTime(100); });

    fireEvent.click(screen.getByLabelText(`Assign clip color ${TRACK_COLOR_PALETTE[0]}`));

    expect(onAssignColor).toHaveBeenCalledWith(TRACK_COLOR_PALETTE[0]);
  });

  it('enables Reset to Track Color when the clip has a custom color', () => {
    const onResetColor = vi.fn();
    renderMenu({ hasCustomColor: true, onResetColor });

    const resetButton = screen.getByText('Reset to Track Color').closest('button');
    expect(resetButton).not.toBeDisabled();

    fireEvent.click(screen.getByText('Reset to Track Color'));
    expect(onResetColor).toHaveBeenCalledOnce();
  });
});

describe('ClipContextMenu color submenu accessibility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('has role="menu" on the submenu container', () => {
    renderMenu();
    const trigger = screen.getByText('Assign Color').closest('[data-testid="color-submenu-trigger"]')!;
    fireEvent.mouseEnter(trigger);
    act(() => { vi.advanceTimersByTime(100); });

    const submenu = screen.getByRole('menu');
    expect(submenu).toBeTruthy();
  });

  it('has role="menuitem" on each color button', () => {
    renderMenu();
    const trigger = screen.getByText('Assign Color').closest('[data-testid="color-submenu-trigger"]')!;
    fireEvent.mouseEnter(trigger);
    act(() => { vi.advanceTimersByTime(100); });

    const items = screen.getAllByRole('menuitem');
    expect(items.length).toBe(TRACK_COLOR_PALETTE.length);
  });

  it('displays a chevron ">" indicator instead of arrow unicode', () => {
    renderMenu();
    const trigger = screen.getByText('Assign Color').closest('[data-testid="color-submenu-trigger"]')!;
    // Should not contain unicode arrows
    expect(trigger.textContent).not.toContain('▶');
    expect(trigger.textContent).not.toContain('◀');
    // Should contain a chevron svg or > character
    const chevron = trigger.querySelector('[data-testid="submenu-chevron"]');
    expect(chevron).toBeTruthy();
  });

  it('opens submenu with ArrowRight key', () => {
    renderMenu();
    const assignBtn = screen.getByText('Assign Color').closest('button')!;
    fireEvent.keyDown(assignBtn, { key: 'ArrowRight' });

    const submenu = screen.getByRole('menu');
    expect(submenu).toBeTruthy();
  });

  it('navigates color items with ArrowDown/ArrowUp keys', () => {
    renderMenu();
    const trigger = screen.getByText('Assign Color').closest('[data-testid="color-submenu-trigger"]')!;
    fireEvent.mouseEnter(trigger);
    act(() => { vi.advanceTimersByTime(100); });

    const items = screen.getAllByRole('menuitem');
    // First item is auto-focused when submenu opens
    expect(document.activeElement).toBe(items[0]);

    const submenu = screen.getByRole('menu');
    fireEvent.keyDown(submenu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);

    fireEvent.keyDown(submenu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[0]);
  });

  it('closes submenu on mouseleave after delay', () => {
    renderMenu();
    const trigger = screen.getByText('Assign Color').closest('[data-testid="color-submenu-trigger"]')!;

    fireEvent.mouseEnter(trigger);
    act(() => { vi.advanceTimersByTime(100); });
    expect(screen.getByRole('menu')).toBeTruthy();

    fireEvent.mouseLeave(trigger);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens submenu on left side when near right viewport edge', () => {
    // Position near right edge of viewport
    renderMenu({ x: window.innerWidth - 50 });
    const trigger = screen.getByText('Assign Color').closest('[data-testid="color-submenu-trigger"]')!;
    fireEvent.mouseEnter(trigger);
    act(() => { vi.advanceTimersByTime(100); });

    const submenuContainer = screen.getByTestId('color-submenu-panel');
    // Should have right positioning (open left)
    expect(submenuContainer.style.right).toBeTruthy();
  });
});
