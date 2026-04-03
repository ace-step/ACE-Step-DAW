import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Minimap } from '../Minimap';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';

// Mock projectStorage to avoid browser API issues
vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

// Mock ResizeObserver
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe = mockObserve;
    unobserve = vi.fn();
    disconnect = mockDisconnect;
  },
);

describe('Minimap', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useUIStore.setState({ pixelsPerSecond: 50, scrollX: 0 });
    useProjectStore.getState().createProject();
  });

  it('renders nothing when there are no tracks', () => {
    const { container } = render(<Minimap />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the minimap container when tracks exist', () => {
    useProjectStore.getState().addTrack('custom', 'stems');
    render(<Minimap />);
    screen.getByTestId('timeline-minimap'); // getBy* throws if not found
  });

  it('has a dark gradient background for contrast', () => {
    useProjectStore.getState().addTrack('custom', 'stems');
    render(<Minimap />);
    const minimap = screen.getByTestId('timeline-minimap');
    expect(minimap.style.background).toContain('linear-gradient');
  });

  it('has a visible bottom border', () => {
    useProjectStore.getState().addTrack('custom', 'stems');
    render(<Minimap />);
    const minimap = screen.getByTestId('timeline-minimap');
    expect(minimap.style.borderBottom).toContain('1px solid');
  });

  it('renders clip blocks with full opacity for ready clips', () => {
    const store = useProjectStore.getState();
    store.addTrack('custom', 'stems');
    const tracks = useProjectStore.getState().project!.tracks;
    const track = tracks[0];
    // Add a clip manually
    useProjectStore.setState({
      project: {
        ...useProjectStore.getState().project!,
        tracks: [
          {
            ...track,
            clips: [
              {
                id: 'clip-1',
                trackId: track.id,
                startTime: 0,
                duration: 5,
                type: 'audio' as const,
                generationStatus: 'ready' as const,
                name: 'Test Clip',
              },
            ],
          },
        ],
      },
    });

    render(<Minimap />);
    const clips = screen.getAllByTestId('minimap-clip');
    expect(clips.length).toBe(1);
    // Ready clips should have full opacity (1.0)
    expect(clips[0].style.opacity).toBe('1');
  });

  it('renders clip blocks with reduced opacity for non-ready clips', () => {
    const store = useProjectStore.getState();
    store.addTrack('custom', 'stems');
    const tracks = useProjectStore.getState().project!.tracks;
    const track = tracks[0];
    useProjectStore.setState({
      project: {
        ...useProjectStore.getState().project!,
        tracks: [
          {
            ...track,
            clips: [
              {
                id: 'clip-2',
                trackId: track.id,
                startTime: 0,
                duration: 5,
                type: 'audio' as const,
                generationStatus: 'generating' as const,
                name: 'Generating Clip',
              },
            ],
          },
        ],
      },
    });

    render(<Minimap />);
    const clips = screen.getAllByTestId('minimap-clip');
    expect(clips[0].style.opacity).toBe('0.6');
  });

  it('renders the viewport indicator', () => {
    useProjectStore.getState().addTrack('custom', 'stems');
    render(<Minimap />);
    screen.getByTestId('minimap-viewport'); // getBy* throws if not found
  });

  it('renders viewport rectangle with visible border', () => {
    useProjectStore.getState().addTrack('custom', 'stems');
    render(<Minimap />);
    const rect = screen.getByTestId('minimap-viewport-rect');
    expect(rect.style.border).toContain('rgba(99, 179, 237');
  });

  it('renders dimming overlays outside the viewport', () => {
    useProjectStore.getState().addTrack('custom', 'stems');
    render(<Minimap />);
    screen.getByTestId('minimap-dim-left'); // getBy* throws if not found
    screen.getByTestId('minimap-dim-right'); // getBy* throws if not found
  });

  it('viewport rect has a subtle fill', () => {
    useProjectStore.getState().addTrack('custom', 'stems');
    render(<Minimap />);
    const rect = screen.getByTestId('minimap-viewport-rect');
    expect(rect.style.backgroundColor).toContain('rgba(99, 179, 237');
  });

  it('viewport rect has a glow shadow', () => {
    useProjectStore.getState().addTrack('custom', 'stems');
    render(<Minimap />);
    const rect = screen.getByTestId('minimap-viewport-rect');
    expect(rect.style.boxShadow).toContain('rgba(99, 179, 237');
  });

  it('handles click events for navigation', () => {
    useProjectStore.getState().addTrack('custom', 'stems');
    render(<Minimap />);
    const minimap = screen.getByTestId('timeline-minimap');
    // Should not throw when clicked
    fireEvent.click(minimap, { clientX: 100 });
  });

  it('dim left region reflects scrollX position', () => {
    useProjectStore.getState().addTrack('custom', 'stems');
    const totalDur = useProjectStore.getState().project!.totalDuration || 60;
    const pps = 50;
    const totalWidthPx = totalDur * pps;
    // Set scrollX to 50% of the total width
    const scrollX = totalWidthPx * 0.5;
    useUIStore.setState({ scrollX, pixelsPerSecond: pps });
    render(<Minimap />);
    const dimLeft = screen.getByTestId('minimap-dim-left');
    expect(dimLeft.style.width).toBe('50%');
  });
});
