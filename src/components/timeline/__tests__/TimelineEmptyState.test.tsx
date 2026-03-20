import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimelineEmptyState } from '../TimelineEmptyState';
import { useProjectStore } from '../../../store/projectStore';

// Mock projectStorage to avoid browser API issues
vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('TimelineEmptyState', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
  });

  it('renders the empty state message', () => {
    render(<TimelineEmptyState />);
    expect(
      screen.getByText(/drop audio files here or add a track to get started/i),
    ).toBeDefined();
  });

  it('renders quick-action buttons for stems, sample, and sequencer', () => {
    render(<TimelineEmptyState />);
    expect(screen.getByRole('button', { name: /add stems track/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /add sample track/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /add sequencer/i })).toBeDefined();
  });

  it('calls addTrack with correct type when "Add Stems Track" is clicked', () => {
    const addTrack = vi.spyOn(useProjectStore.getState(), 'addTrack');
    render(<TimelineEmptyState />);
    fireEvent.click(screen.getByRole('button', { name: /add stems track/i }));
    expect(addTrack).toHaveBeenCalledWith('custom', 'stems');
    addTrack.mockRestore();
  });

  it('calls addTrack with correct type when "Add Sample Track" is clicked', () => {
    const addTrack = vi.spyOn(useProjectStore.getState(), 'addTrack');
    render(<TimelineEmptyState />);
    fireEvent.click(screen.getByRole('button', { name: /add sample track/i }));
    expect(addTrack).toHaveBeenCalledWith('custom', 'sample');
    addTrack.mockRestore();
  });

  it('calls addTrack with correct type when "Add Sequencer" is clicked', () => {
    const addTrack = vi.spyOn(useProjectStore.getState(), 'addTrack');
    render(<TimelineEmptyState />);
    fireEvent.click(screen.getByRole('button', { name: /add sequencer/i }));
    expect(addTrack).toHaveBeenCalledWith('custom', 'sequencer');
    addTrack.mockRestore();
  });

  it('has a dashed border drop zone', () => {
    render(<TimelineEmptyState />);
    const container = screen.getByTestId('timeline-empty-state');
    expect(container.className).toContain('border-dashed');
  });

  it('is not visible when there are 3 or more tracks', () => {
    // Add 3 tracks
    const store = useProjectStore.getState();
    store.addTrack('custom', 'stems');
    store.addTrack('custom', 'sample');
    store.addTrack('custom', 'sequencer');

    const { container } = render(<TimelineEmptyState />);
    // Component should render nothing when 3+ tracks exist
    expect(container.innerHTML).toBe('');
  });

  it('is visible when there are fewer than 3 tracks', () => {
    // Add 1 track
    useProjectStore.getState().addTrack('custom', 'stems');

    render(<TimelineEmptyState />);
    expect(
      screen.getByText(/drop audio files here or add a track to get started/i),
    ).toBeDefined();
  });

  it('is visible when there are 0 tracks', () => {
    render(<TimelineEmptyState />);
    expect(
      screen.getByText(/drop audio files here or add a track to get started/i),
    ).toBeDefined();
  });
});
