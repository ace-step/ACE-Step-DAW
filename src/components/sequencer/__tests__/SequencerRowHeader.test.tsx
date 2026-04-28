import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SequencerRowHeader } from '../SequencerRowHeader';
import type { SequencerRow } from '../../../types/project';
import { createRef } from 'react';

vi.mock('../../../hooks/useNonPassiveWheel', () => ({
  useNonPassiveWheel: () => () => {},
}));

function makeRow(overrides: Partial<SequencerRow> = {}): SequencerRow {
  return {
    id: 'row-1',
    name: 'Kick',
    sampleKey: 'kick-808',
    steps: Array.from({ length: 16 }, () => ({
      active: false,
      velocity: 0.8,
      probability: 1,
      stepParams: {},
    })),
    volume: 0.8,
    pan: 0,
    muted: false,
    color: '#ef4444',
    ...overrides,
  };
}

function renderRowHeader(overrides: Partial<Parameters<typeof SequencerRowHeader>[0]> = {}) {
  const defaults = {
    row: makeRow(),
    rowIdx: 0,
    stepH: 28,
    isSelected: false,
    isSoloed: false,
    isAudible: true,
    isDragTarget: false,
    inlineRenameRowId: null,
    inlineRenameValue: '',
    inlineRenameInputRef: createRef<HTMLInputElement>(),
    samplePickerRow: null,
    onSelectRow: vi.fn(),
    onOpenContextMenu: vi.fn(),
    onToggleMute: vi.fn(),
    onToggleSolo: vi.fn(),
    onSetPan: vi.fn(),
    onSetVolume: vi.fn(),
    onToggleSamplePicker: vi.fn(),
    onStartInlineRename: vi.fn(),
    onInlineRenameChange: vi.fn(),
    onCommitInlineRename: vi.fn(),
    onCancelInlineRename: vi.fn(),
    onDragStart: vi.fn(),
    onDragOver: vi.fn(),
    onDragEnd: vi.fn(),
    onDrop: vi.fn(),
  };
  const props = { ...defaults, ...overrides };
  return { ...render(<SequencerRowHeader {...props} />), props };
}

describe('SequencerRowHeader', () => {
  it('renders row name', () => {
    renderRowHeader({ row: makeRow({ name: 'Snare' }) });
    expect(screen.getByText('Snare')).toBeInTheDocument();
  });

  it('renders with reduced opacity when not audible', () => {
    const { container } = renderRowHeader({ isAudible: false });
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.opacity).toBe('0.35');
  });

  it('renders with full opacity when audible', () => {
    const { container } = renderRowHeader({ isAudible: true });
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.opacity).toBe('1');
  });

  it('calls onSelectRow when clicking the row', () => {
    const { props } = renderRowHeader();
    const wrapper = screen.getByText('Kick').closest('[draggable]')!;
    fireEvent.click(wrapper);
    expect(props.onSelectRow).toHaveBeenCalledWith('row-1');
  });

  it('calls onOpenContextMenu on right-click', () => {
    const { props } = renderRowHeader();
    const wrapper = screen.getByText('Kick').closest('[draggable]')!;
    fireEvent.contextMenu(wrapper);
    expect(props.onOpenContextMenu).toHaveBeenCalledWith('row-1', expect.any(Number), expect.any(Number));
  });

  it('calls onToggleMute when clicking mute LED', () => {
    const { props } = renderRowHeader();
    const muteLed = screen.getByTitle(/Mute|Unmute/);
    fireEvent.click(muteLed);
    expect(props.onToggleMute).toHaveBeenCalledWith('row-1');
  });

  it('calls onToggleSolo on right-click of mute LED', () => {
    const { props } = renderRowHeader();
    const muteLed = screen.getByTitle(/Mute|Unmute|Solo/);
    fireEvent.contextMenu(muteLed);
    expect(props.onToggleSolo).toHaveBeenCalledWith('row-1');
  });

  it('shows mute title when not muted', () => {
    renderRowHeader({ row: makeRow({ muted: false }) });
    expect(screen.getByTitle('Mute (click) / Solo (right-click)')).toBeInTheDocument();
  });

  it('shows unmute title when muted', () => {
    renderRowHeader({ row: makeRow({ muted: true }) });
    expect(screen.getByTitle('Unmute (click) / Solo (right-click)')).toBeInTheDocument();
  });

  it('shows unsolo title when soloed', () => {
    renderRowHeader({ isSoloed: true });
    expect(screen.getByTitle('Unsolo (right-click)')).toBeInTheDocument();
  });

  it('shows inline rename input when renaming', () => {
    renderRowHeader({
      row: makeRow({ id: 'row-1', name: 'Kick' }),
      inlineRenameRowId: 'row-1',
      inlineRenameValue: 'Kick New',
    });
    const input = screen.getByDisplayValue('Kick New');
    expect(input).toBeInTheDocument();
  });

  it('calls onCommitInlineRename on Enter', () => {
    const { props } = renderRowHeader({
      row: makeRow({ id: 'row-1' }),
      inlineRenameRowId: 'row-1',
      inlineRenameValue: 'New Name',
    });
    const input = screen.getByDisplayValue('New Name');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onCommitInlineRename).toHaveBeenCalledOnce();
  });

  it('calls onCancelInlineRename on Escape', () => {
    const { props } = renderRowHeader({
      row: makeRow({ id: 'row-1' }),
      inlineRenameRowId: 'row-1',
      inlineRenameValue: 'New Name',
    });
    const input = screen.getByDisplayValue('New Name');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(props.onCancelInlineRename).toHaveBeenCalledOnce();
  });

  it('calls onStartInlineRename on double-click of name', () => {
    const row = makeRow({ name: 'HiHat' });
    const { props } = renderRowHeader({ row });
    fireEvent.doubleClick(screen.getByText('HiHat'));
    expect(props.onStartInlineRename).toHaveBeenCalledWith(row);
  });

  it('is draggable', () => {
    const { container } = renderRowHeader();
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.getAttribute('draggable')).toBe('true');
  });

  it('calls onDragStart on drag', () => {
    const { props, container } = renderRowHeader({ row: makeRow(), rowIdx: 2 });
    const wrapper = container.firstElementChild as HTMLElement;
    fireEvent.dragStart(wrapper, {
      dataTransfer: { effectAllowed: '', setData: vi.fn() },
    });
    expect(props.onDragStart).toHaveBeenCalledWith(2, expect.anything());
  });

  it('shows drag target border when isDragTarget', () => {
    const { container } = renderRowHeader({ isDragTarget: true });
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.borderTop).toContain('solid');
  });

  it('shows selected background when isSelected', () => {
    const { container } = renderRowHeader({ isSelected: true });
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.background).toBe('rgb(58, 58, 58)');
  });
});
