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

  it('renders the empty state message when there are 0 tracks', () => {
    render(<TimelineEmptyState />);
    screen.getByText(/drop audio files here or click \+ track to get started/i); // getBy* throws if not found
  });

  it('renders a music note icon', () => {
    render(<TimelineEmptyState />);
    const container = screen.getByTestId('timeline-empty-state');
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  it('renders a new track action button', () => {
    render(<TimelineEmptyState />);
    const button = screen.getByRole('button', { name: /\+ new track/i });
    expect(button).not.toBeUndefined();
  });

  it('clicking new track button calls addTrack', () => {
    const addTrackSpy = vi.spyOn(useProjectStore.getState(), 'addTrack');
    render(<TimelineEmptyState />);
    fireEvent.click(screen.getByRole('button', { name: /\+ new track/i }));
    expect(addTrackSpy).toHaveBeenCalled();
  });

  it('renders description text', () => {
    render(<TimelineEmptyState />);
    screen.getByText(/create tracks, generate ai music, or drag loops/i); // getBy* throws if not found
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
});
