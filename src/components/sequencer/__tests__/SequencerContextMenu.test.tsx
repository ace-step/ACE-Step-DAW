import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SequencerContextMenu } from '../SequencerContextMenu';
import type { SequencerRow } from '../../../types/project';

function makeRow(overrides: Partial<SequencerRow> = {}): SequencerRow {
  return {
    id: 'row-1',
    name: 'Kick',
    sampleKey: 'kick-808',
    steps: [],
    volume: 0.8,
    pan: 0,
    muted: false,
    color: '#ef4444',
    ...overrides,
  };
}

function renderMenu(overrides: Partial<Parameters<typeof SequencerContextMenu>[0]> = {}) {
  const defaults = {
    menu: { rowId: 'row-1', x: 100, y: 200 },
    rows: [makeRow(), makeRow({ id: 'row-2', name: 'Snare', color: '#3b82f6' })],
    onClose: vi.fn(),
    onRename: vi.fn(),
    onSetColor: vi.fn(),
    onClone: vi.fn(),
    onFill: vi.fn(),
    onClear: vi.fn(),
    onPreview: vi.fn(),
    onDelete: vi.fn(),
  };
  const props = { ...defaults, ...overrides };
  return { ...render(<SequencerContextMenu {...props} />), props };
}

describe('SequencerContextMenu', () => {
  it('renders nothing when menu is null', () => {
    const { container } = renderMenu({ menu: null });
    expect(container.innerHTML).toBe('');
  });

  it('renders menu items when menu is provided', () => {
    renderMenu();
    expect(screen.getByText('Rename / Color...')).toBeInTheDocument();
    expect(screen.getByText('Clone Channel')).toBeInTheDocument();
    expect(screen.getByText('Clear Steps')).toBeInTheDocument();
    expect(screen.getByText('Preview Sound')).toBeInTheDocument();
    expect(screen.getByText('Delete Channel')).toBeInTheDocument();
  });

  it('renders fill options', () => {
    renderMenu();
    expect(screen.getByText('Fill every 2 steps')).toBeInTheDocument();
    expect(screen.getByText('Fill every 4 steps')).toBeInTheDocument();
    expect(screen.getByText('Fill every 8 steps')).toBeInTheDocument();
  });

  it('calls onRename when clicking Rename', () => {
    const { props } = renderMenu();
    fireEvent.click(screen.getByText('Rename / Color...'));
    expect(props.onRename).toHaveBeenCalledWith('row-1');
  });

  it('calls onClone when clicking Clone', () => {
    const { props } = renderMenu();
    fireEvent.click(screen.getByText('Clone Channel'));
    expect(props.onClone).toHaveBeenCalledWith('row-1');
  });

  it('calls onFill with correct step interval', () => {
    const { props } = renderMenu();
    fireEvent.click(screen.getByText('Fill every 4 steps'));
    expect(props.onFill).toHaveBeenCalledWith('row-1', 4);
  });

  it('calls onClear when clicking Clear Steps', () => {
    const { props } = renderMenu();
    fireEvent.click(screen.getByText('Clear Steps'));
    expect(props.onClear).toHaveBeenCalledWith('row-1');
  });

  it('calls onPreview when clicking Preview Sound', () => {
    const { props } = renderMenu();
    fireEvent.click(screen.getByText('Preview Sound'));
    expect(props.onPreview).toHaveBeenCalledWith('row-1');
  });

  it('calls onDelete when clicking Delete Channel', () => {
    const { props } = renderMenu();
    fireEvent.click(screen.getByText('Delete Channel'));
    expect(props.onDelete).toHaveBeenCalledWith('row-1');
  });

  it('renders color swatches', () => {
    renderMenu();
    const colorBtns = screen.getAllByRole('button').filter(
      (btn) => btn.getAttribute('aria-label')?.startsWith('Set row color'),
    );
    expect(colorBtns.length).toBeGreaterThanOrEqual(10);
  });

  it('calls onSetColor when clicking a color swatch', () => {
    const { props } = renderMenu();
    const colorBtns = screen.getAllByRole('button').filter(
      (btn) => btn.getAttribute('aria-label')?.startsWith('Set row color'),
    );
    fireEvent.click(colorBtns[0]);
    expect(props.onSetColor).toHaveBeenCalledWith('row-1', expect.any(String));
  });
});
