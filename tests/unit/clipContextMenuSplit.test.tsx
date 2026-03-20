import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClipContextMenu } from '../../src/components/timeline/ClipContextMenu';

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
    onClose: vi.fn(),
    hasPrompt: true,
    isReady: true,
    isMidiClip: false,
    isVocalTrack: false,
    hasAudio: true,
    hasWarpMarkers: false,
    canConsolidate: false,
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
});
