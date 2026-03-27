import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimeRuler } from '../TimeRuler';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';
import { useTransportStore } from '../../../store/transportStore';

const mockSeek = vi.fn();

vi.mock('../../../hooks/useTransport', () => ({
  useTransport: () => ({
    startScrub: vi.fn(),
    scrubTo: vi.fn(),
    endScrub: vi.fn(),
    seek: mockSeek,
  }),
}));

function setupProject() {
  useProjectStore.setState({
    project: {
      id: 'test',
      name: 'Test',
      bpm: 120,
      timeSignature: 4,
      totalDuration: 60,
      tracks: [],
      key: 'C',
      scale: 'major',
      generationDefaults: { model: '', tags: '', lyrics: '' },
      globalEffects: [],
      tempoMap: [],
      timeSignatureMap: [],
      masterVolume: 1,
      version: 1,
    } as any,
  });
  useUIStore.setState({ pixelsPerSecond: 50, timelineViewportWidth: 1000 });
}

describe('TimeRuler seek during playback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupProject();
    useTransportStore.setState({
      currentTime: 0,
      playStartTime: 0,
      isPlaying: false,
      loopEnabled: false,
      loopStart: 0,
      loopEnd: 0,
      isScrubbing: false,
    });
  });

  it('calls useTransport().seek when clicking ruler during playback (#994)', () => {
    useTransportStore.setState({ isPlaying: true, currentTime: 10 });

    render(<TimeRuler />);
    const ruler = screen.getByTestId('timeline-scrub-ruler');

    // Click at x=250, pixelsPerSecond=50 → time=5s
    fireEvent.pointerDown(ruler, { clientX: 250, button: 0, pointerId: 1 });
    fireEvent.pointerUp(ruler, { clientX: 250, pointerId: 1 });

    expect(mockSeek).toHaveBeenCalledWith(5);
  });

  it('does NOT call useTransport().seek when clicking ruler while stopped', () => {
    useTransportStore.setState({ isPlaying: false, currentTime: 0 });

    render(<TimeRuler />);
    const ruler = screen.getByTestId('timeline-scrub-ruler');

    fireEvent.pointerDown(ruler, { clientX: 250, button: 0, pointerId: 1 });
    fireEvent.pointerUp(ruler, { clientX: 250, pointerId: 1 });

    // Should use store seek, not useTransport().seek
    expect(mockSeek).not.toHaveBeenCalled();
    // Store should be updated via direct store seek
    expect(useTransportStore.getState().currentTime).toBeGreaterThan(0);
  });

  it('drag-to-loop still works during playback', () => {
    useTransportStore.setState({ isPlaying: true, currentTime: 10 });

    render(<TimeRuler />);
    const ruler = screen.getByTestId('timeline-scrub-ruler');

    vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 1000, top: 0, bottom: 30, width: 1000, height: 30, x: 0, y: 0, toJSON: () => {},
    });

    // Drag from x=200 to x=500 (more than 3px threshold)
    fireEvent.pointerDown(ruler, { clientX: 200, button: 0, pointerId: 1 });
    fireEvent.pointerMove(ruler, { clientX: 500, pointerId: 1 });
    fireEvent.pointerUp(ruler, { clientX: 500, pointerId: 1 });

    // Loop should be created
    const state = useTransportStore.getState();
    expect(state.loopEnabled).toBe(true);
    expect(state.loopStart).toBeLessThan(state.loopEnd);
  });
});
