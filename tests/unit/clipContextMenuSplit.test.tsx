import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it('opens an Assign Color submenu and emits the selected palette color', () => {
    const onAssignColor = vi.fn();
    renderMenu({ onAssignColor });

    fireEvent.click(screen.getByText('Assign Color'));
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
