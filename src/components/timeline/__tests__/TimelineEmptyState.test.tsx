import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('renders the empty state message when there are 0 tracks', () => {
    render(<TimelineEmptyState />);
    expect(
      screen.getByText(/drop audio files here or click \+ track to get started/i),
    ).toBeInTheDocument();
  });

  it('renders a music note icon', () => {
    render(<TimelineEmptyState />);
    const container = screen.getByTestId('timeline-empty-state');
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  it('does not render action buttons', () => {
    render(<TimelineEmptyState />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('does not have a dashed border', () => {
    render(<TimelineEmptyState />);
    const container = screen.getByTestId('timeline-empty-state');
    expect(container.className).not.toContain('border-dashed');
  });

  it('is not visible when there is 1 or more tracks', () => {
    useProjectStore.getState().addTrack('custom', 'stems');

    const { container } = render(<TimelineEmptyState />);
    expect(container.innerHTML).toBe('');
  });

  it('is not visible when there are 3 tracks', () => {
    const store = useProjectStore.getState();
    store.addTrack('custom', 'stems');
    store.addTrack('custom', 'sample');
    store.addTrack('custom', 'sequencer');

    const { container } = render(<TimelineEmptyState />);
    expect(container.innerHTML).toBe('');
  });

  it('is visible when there are 0 tracks', () => {
    render(<TimelineEmptyState />);
    expect(
      screen.getByText(/drop audio files here or click \+ track to get started/i),
    ).toBeInTheDocument();
  });
});
