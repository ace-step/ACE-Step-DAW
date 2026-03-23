import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ArrangementMarkers } from '../ArrangementMarkers';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';

vi.mock('../../../services/projectStorage', () => ({ saveProject: vi.fn() }));
vi.mock('../../../hooks/useTransport', () => ({
  useTransport: () => ({ seek: vi.fn() }),
}));

describe('ArrangementMarkers', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject({ name: 'Test', bpm: 120 });
    useUIStore.setState({ pixelsPerSecond: 100, timelineViewportWidth: 1000, showArrangementMarkers: true });
  });

  it('renders empty-state hint when no markers exist', () => {
    render(<ArrangementMarkers />);
    expect(screen.getByTestId('arrangement-markers')).toBeInTheDocument();
    expect(screen.getByTestId('arrangement-markers-empty')).toBeInTheDocument();
    expect(screen.getByText('Drag to create section')).toBeInTheDocument();
  });

  it('hides empty-state hint once a marker is added', () => {
    const store = useProjectStore.getState();
    store.addMarker(0, 'Intro');
    render(<ArrangementMarkers />);
    expect(screen.getByTestId('arrangement-markers')).toBeInTheDocument();
    expect(screen.queryByTestId('arrangement-markers-empty')).not.toBeInTheDocument();
  });

  it('renders null when no project exists', () => {
    useProjectStore.setState({ project: null });
    const { container } = render(<ArrangementMarkers />);
    expect(container.firstChild).toBeNull();
  });

  it('has crosshair cursor on container for drag-to-create', () => {
    render(<ArrangementMarkers />);
    const el = screen.getByTestId('arrangement-markers');
    expect(el.style.cursor).toBe('crosshair');
  });

  it('renders marker sections with correct data attributes', () => {
    const store = useProjectStore.getState();
    store.addMarker(0, 'Intro');
    store.addMarker(4, 'Verse');
    render(<ArrangementMarkers />);

    const markerEls = screen.getByTestId('arrangement-markers').querySelectorAll('[data-marker-id]');
    expect(markerEls).toHaveLength(2);
  });

  it('shows resize handle on non-last sections', () => {
    const store = useProjectStore.getState();
    store.addMarker(0, 'Intro');
    store.addMarker(4, 'Verse');
    const markerId = useProjectStore.getState().project!.markers![0].id;
    render(<ArrangementMarkers />);

    expect(screen.getByTestId(`marker-resize-handle-${markerId}`)).toBeInTheDocument();
  });

  it('sections have grab cursor for drag-to-move', () => {
    const store = useProjectStore.getState();
    store.addMarker(0, 'Intro');
    render(<ArrangementMarkers />);

    const markerId = useProjectStore.getState().project!.markers![0].id;
    const el = screen.getByTestId('arrangement-markers').querySelector(`[data-marker-id="${markerId}"]`) as HTMLElement;
    expect(el.style.cursor).toBe('grab');
  });
});

describe('ArrangementMarkers toggle', () => {
  beforeEach(() => {
    useUIStore.setState({ showArrangementMarkers: true });
  });

  it('toggleArrangementMarkers flips the state', () => {
    expect(useUIStore.getState().showArrangementMarkers).toBe(true);
    useUIStore.getState().toggleArrangementMarkers();
    expect(useUIStore.getState().showArrangementMarkers).toBe(false);
    useUIStore.getState().toggleArrangementMarkers();
    expect(useUIStore.getState().showArrangementMarkers).toBe(true);
  });
});
