import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimeRuler } from '../TimeRuler';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';
import { useTransportStore } from '../../../store/transportStore';

// Mock useTransport hook — scrub functions should NOT be called
const mockStartScrub = vi.fn();
const mockScrubTo = vi.fn();
const mockEndScrub = vi.fn();
const mockSeek = vi.fn();

vi.mock('../../../hooks/useTransport', () => ({
  useTransport: () => ({
    startScrub: mockStartScrub,
    scrubTo: mockScrubTo,
    endScrub: mockEndScrub,
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
  useTransportStore.setState({
    currentTime: 0,
    playStartTime: 0,
    loopEnabled: false,
    loopStart: 0,
    loopEnd: 0,
    isScrubbing: false,
  });
}

describe('TimeRuler silent seek + drag-to-loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupProject();
  });

  it('single click on ruler seeks without calling scrub functions', () => {
    render(<TimeRuler />);
    const ruler = screen.getByTestId('timeline-scrub-ruler');

    // Simulate a click (pointerdown + pointerup without significant move)
    fireEvent.pointerDown(ruler, { clientX: 250, button: 0, pointerId: 1 });
    fireEvent.pointerUp(ruler, { clientX: 250, pointerId: 1 });

    // Scrub functions should NOT be called
    expect(mockStartScrub).not.toHaveBeenCalled();
    expect(mockScrubTo).not.toHaveBeenCalled();
    expect(mockEndScrub).not.toHaveBeenCalled();

    // Playhead should have moved (seek was called)
    const state = useTransportStore.getState();
    expect(state.currentTime).toBeGreaterThan(0);
    expect(state.playStartTime).toBeGreaterThan(0);
  });

  it('single click does NOT enable loop', () => {
    render(<TimeRuler />);
    const ruler = screen.getByTestId('timeline-scrub-ruler');

    fireEvent.pointerDown(ruler, { clientX: 250, button: 0, pointerId: 1 });
    fireEvent.pointerUp(ruler, { clientX: 250, pointerId: 1 });

    expect(useTransportStore.getState().loopEnabled).toBe(false);
  });

  it('drag on ruler creates a loop region and enables loop', () => {
    render(<TimeRuler />);
    const ruler = screen.getByTestId('timeline-scrub-ruler');

    // Mock getBoundingClientRect for the ruler
    vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 1000, top: 0, bottom: 30, width: 1000, height: 30, x: 0, y: 0, toJSON: () => {},
    });

    // Pointer down at x=200
    fireEvent.pointerDown(ruler, { clientX: 200, button: 0, pointerId: 1 });

    // Drag to x=500 (more than 3px threshold)
    fireEvent.pointerMove(ruler, { clientX: 500, pointerId: 1 });

    // Pointer up
    fireEvent.pointerUp(ruler, { clientX: 500, pointerId: 1 });

    const state = useTransportStore.getState();
    // Loop should be enabled
    expect(state.loopEnabled).toBe(true);
    // Loop region should span from the start to end of the drag
    expect(state.loopStart).toBeLessThan(state.loopEnd);
    expect(state.loopEnd - state.loopStart).toBeGreaterThan(0);
  });

  it('drag does not call audio scrub functions', () => {
    render(<TimeRuler />);
    const ruler = screen.getByTestId('timeline-scrub-ruler');

    vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 1000, top: 0, bottom: 30, width: 1000, height: 30, x: 0, y: 0, toJSON: () => {},
    });

    fireEvent.pointerDown(ruler, { clientX: 200, button: 0, pointerId: 1 });
    fireEvent.pointerMove(ruler, { clientX: 500, pointerId: 1 });
    fireEvent.pointerUp(ruler, { clientX: 500, pointerId: 1 });

    expect(mockStartScrub).not.toHaveBeenCalled();
    expect(mockScrubTo).not.toHaveBeenCalled();
    expect(mockEndScrub).not.toHaveBeenCalled();
  });

  it('backward drag (right-to-left) normalizes loop region correctly', () => {
    render(<TimeRuler />);
    const ruler = screen.getByTestId('timeline-scrub-ruler');

    vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 1000, top: 0, bottom: 30, width: 1000, height: 30, x: 0, y: 0, toJSON: () => {},
    });

    // Drag from right to left
    fireEvent.pointerDown(ruler, { clientX: 500, button: 0, pointerId: 1 });
    fireEvent.pointerMove(ruler, { clientX: 200, pointerId: 1 });
    fireEvent.pointerUp(ruler, { clientX: 200, pointerId: 1 });

    const state = useTransportStore.getState();
    expect(state.loopEnabled).toBe(true);
    // loopStart should be less than loopEnd regardless of drag direction
    expect(state.loopStart).toBeLessThan(state.loopEnd);
  });

  it('clicking inside an existing loop region clears the loop', () => {
    // Pre-set a loop region
    useTransportStore.setState({
      loopEnabled: true,
      loopStart: 2, // at 50px/s → x=100
      loopEnd: 8,   // at 50px/s → x=400
    });

    render(<TimeRuler />);
    const ruler = screen.getByTestId('timeline-scrub-ruler');

    vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 1000, top: 0, bottom: 30, width: 1000, height: 30, x: 0, y: 0, toJSON: () => {},
    });

    // Click inside the loop region (x=250 → time=5s, within [2,8])
    fireEvent.pointerDown(ruler, { clientX: 250, button: 0, pointerId: 1 });
    fireEvent.pointerUp(ruler, { clientX: 250, pointerId: 1 });

    // Loop should be disabled
    expect(useTransportStore.getState().loopEnabled).toBe(false);
  });

  it('click during playback calls useTransport.seek to restart engine (#994)', () => {
    // Simulate playback is active
    useTransportStore.setState({ isPlaying: true, currentTime: 5, playStartTime: 0 });

    render(<TimeRuler />);
    const ruler = screen.getByTestId('timeline-scrub-ruler');

    vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 1000, top: 0, bottom: 30, width: 1000, height: 30, x: 0, y: 0, toJSON: () => {},
    });

    // Click at x=500 → time=10s (at 50px/s)
    fireEvent.pointerDown(ruler, { clientX: 500, button: 0, pointerId: 1 });
    fireEvent.pointerUp(ruler, { clientX: 500, pointerId: 1 });

    // Should call useTransport's seek (which restarts the engine)
    expect(mockSeek).toHaveBeenCalledWith(10);
  });

  it('click while NOT playing does NOT call useTransport.seek', () => {
    useTransportStore.setState({ isPlaying: false, currentTime: 0, playStartTime: 0 });

    render(<TimeRuler />);
    const ruler = screen.getByTestId('timeline-scrub-ruler');

    vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 1000, top: 0, bottom: 30, width: 1000, height: 30, x: 0, y: 0, toJSON: () => {},
    });

    fireEvent.pointerDown(ruler, { clientX: 250, button: 0, pointerId: 1 });
    fireEvent.pointerUp(ruler, { clientX: 250, pointerId: 1 });

    // Should NOT call useTransport.seek when not playing
    expect(mockSeek).not.toHaveBeenCalled();
    // Should use store's seek directly
    expect(useTransportStore.getState().currentTime).toBeGreaterThan(0);
  });

  it('clicking outside an existing loop region does NOT clear the loop', () => {
    // Pre-set a loop region
    useTransportStore.setState({
      loopEnabled: true,
      loopStart: 4, // at 50px/s → x=200
      loopEnd: 8,   // at 50px/s → x=400
    });

    render(<TimeRuler />);
    const ruler = screen.getByTestId('timeline-scrub-ruler');

    vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 1000, top: 0, bottom: 30, width: 1000, height: 30, x: 0, y: 0, toJSON: () => {},
    });

    // Click outside the loop region (x=50 → time=1s, outside [4,8])
    fireEvent.pointerDown(ruler, { clientX: 50, button: 0, pointerId: 1 });
    fireEvent.pointerUp(ruler, { clientX: 50, pointerId: 1 });

    // Loop should still be enabled
    expect(useTransportStore.getState().loopEnabled).toBe(true);
  });
});
