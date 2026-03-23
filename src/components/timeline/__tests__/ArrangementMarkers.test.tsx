import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    expect(screen.getByText('Double-click to add section markers')).toBeInTheDocument();
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

  it('adds a marker on double-click snapped to bar boundary', () => {
    render(<ArrangementMarkers />);
    const el = screen.getByTestId('arrangement-markers');

    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 1000, bottom: 20, width: 1000, height: 20, x: 0, y: 0, toJSON: () => {},
    });

    fireEvent.doubleClick(el, { clientX: 250 });

    const markers = useProjectStore.getState().project!.markers!;
    expect(markers).toHaveLength(1);
    // At 120 BPM, 4/4 → bar = 4 beats × 0.5s = 2s. 2.5s snaps to 2s
    expect(markers[0].time).toBe(2);
  });

  it('adds a marker at exact position when Alt is held', () => {
    render(<ArrangementMarkers />);
    const el = screen.getByTestId('arrangement-markers');

    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 1000, bottom: 20, width: 1000, height: 20, x: 0, y: 0, toJSON: () => {},
    });

    fireEvent.doubleClick(el, { clientX: 250, altKey: true });

    const markers = useProjectStore.getState().project!.markers!;
    expect(markers).toHaveLength(1);
    expect(markers[0].time).toBe(2.5);
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
