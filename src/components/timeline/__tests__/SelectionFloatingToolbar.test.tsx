import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SelectionFloatingToolbar } from '../SelectionFloatingToolbar';

// Mock uiStore
const mockSetSelectWindow = vi.fn();
let mockSelectWindow: { startTime: number; endTime: number; trackIds: string[] } | null = null;
let mockPixelsPerSecond = 100;

vi.mock('../../../store/uiStore', () => ({
  useUIStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      selectWindow: mockSelectWindow,
      pixelsPerSecond: mockPixelsPerSecond,
      setSelectWindow: mockSetSelectWindow,
    }),
}));

// Mock projectStore for ensureMidiClip
const mockEnsureMidiClip = vi.fn();
vi.mock('../../../store/projectStore', () => ({
  useProjectStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      ensureMidiClip: mockEnsureMidiClip,
    }),
}));

describe('SelectionFloatingToolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectWindow = null;
    mockPixelsPerSecond = 100;
  });

  it('returns null when selectWindow is null', () => {
    mockSelectWindow = null;
    const { container } = render(
      <SelectionFloatingToolbar selLeft={null} selWidth={null} selBottom={null} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders toolbar when selectWindow and position props are provided', () => {
    mockSelectWindow = { startTime: 2, endTime: 6, trackIds: ['t1'] };
    render(
      <SelectionFloatingToolbar selLeft={200} selWidth={400} selBottom={100} />,
    );
    expect(screen.getByTestId('selection-floating-toolbar')).toBeInTheDocument();
  });

  it('renders three action buttons', () => {
    mockSelectWindow = { startTime: 2, endTime: 6, trackIds: ['t1'] };
    render(
      <SelectionFloatingToolbar selLeft={200} selWidth={400} selBottom={100} />,
    );
    expect(screen.getByRole('button', { name: /enhance/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add layer/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /midi/i })).toBeInTheDocument();
  });

  it('positions toolbar centered below selection', () => {
    mockSelectWindow = { startTime: 2, endTime: 6, trackIds: ['t1'] };
    render(
      <SelectionFloatingToolbar selLeft={200} selWidth={400} selBottom={100} />,
    );
    const toolbar = screen.getByTestId('selection-floating-toolbar');
    // Centered horizontally: left + width/2 = 200 + 200 = 400, then transform translateX(-50%)
    expect(toolbar.style.left).toBe('400px');
    expect(toolbar.style.top).toBe('108px'); // selBottom + 8px gap
  });

  it('calls ensureMidiClip for each track when + MIDI is clicked', () => {
    mockSelectWindow = { startTime: 2, endTime: 6, trackIds: ['t1', 't2'] };
    render(
      <SelectionFloatingToolbar selLeft={200} selWidth={400} selBottom={100} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /midi/i }));
    expect(mockEnsureMidiClip).toHaveBeenCalledTimes(2);
    expect(mockEnsureMidiClip).toHaveBeenCalledWith('t1', 2, 4);
    expect(mockEnsureMidiClip).toHaveBeenCalledWith('t2', 2, 4);
  });
});
