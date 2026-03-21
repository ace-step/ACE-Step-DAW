import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TimeRuler } from '../../src/components/timeline/TimeRuler';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';
import { useTransportStore } from '../../src/store/transportStore';

const seekMock = vi.fn();

vi.mock('../../src/hooks/useTransport', () => ({
  useTransport: () => ({
    startScrub: (time: number) => {
      useTransportStore.getState().startScrub(time);
      seekMock(time);
    },
    scrubTo: (time: number, rate: number) => {
      useTransportStore.getState().updateScrub(time, rate);
      seekMock(time);
    },
    endScrub: () => {
      useTransportStore.getState().endScrub();
    },
  }),
}));

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('TimeRuler scrubbing', () => {
  beforeEach(() => {
    seekMock.mockReset();
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);

    useProjectStore.getState().createProject({ name: 'Scrub Test' });
    useUIStore.getState().setPixelsPerSecond(100);
  });

  function mockRulerRect(element: HTMLElement) {
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1000,
      bottom: 24,
      width: 1000,
      height: 24,
      toJSON: () => ({}),
    });
  }

  it('enters scrub mode and updates transport position while dragging the ruler', () => {
    render(<TimeRuler />);

    const ruler = screen.getByRole('slider', { name: 'Timeline scrub ruler' });
    mockRulerRect(ruler);

    fireEvent.pointerDown(ruler, {
      button: 0,
      clientX: 120,
      clientY: 12,
      pointerId: 1,
    });

    let state = useTransportStore.getState();
    expect(state.isScrubbing).toBe(true);
    expect(state.currentTime).toBeCloseTo(1.2);
    expect(seekMock).toHaveBeenCalledWith(1.2);

    fireEvent.pointerMove(ruler, {
      clientX: 220,
      clientY: 12,
      pointerId: 1,
      timeStamp: 32,
    });

    state = useTransportStore.getState();
    expect(state.currentTime).toBeCloseTo(2.2);
    expect(state.scrubPreviewRate).toBeGreaterThan(0);
    expect(seekMock).toHaveBeenLastCalledWith(2.2);

    fireEvent.pointerUp(ruler, {
      clientX: 220,
      clientY: 12,
      pointerId: 1,
    });

    state = useTransportStore.getState();
    expect(state.isScrubbing).toBe(false);
    expect(state.scrubPreviewRate).toBe(0);
  });

  it('renders the loop region overlay when looping is enabled', () => {
    useTransportStore.getState().setLoopRegion(1, 3);
    useTransportStore.getState().toggleLoop();

    render(<TimeRuler />);

    expect(screen.getByTestId('timeline-loop-region')).toBeInTheDocument();
    expect(screen.getByLabelText('Move loop region')).toBeInTheDocument();
    expect(screen.getByLabelText('Adjust loop start')).toBeInTheDocument();
    expect(screen.getByLabelText('Adjust loop end')).toBeInTheDocument();
  });

  it('drags the loop start handle with beat snapping by default', () => {
    useTransportStore.getState().setLoopRegion(1.25, 3.25);
    useTransportStore.getState().toggleLoop();

    render(<TimeRuler />);

    const ruler = screen.getByRole('slider', { name: 'Timeline scrub ruler' });
    mockRulerRect(ruler);

    const startHandle = screen.getByLabelText('Adjust loop start');

    fireEvent.pointerDown(startHandle, {
      button: 0,
      clientX: 125,
      clientY: 12,
      pointerId: 1,
    });
    fireEvent.pointerMove(startHandle, {
      clientX: 210,
      clientY: 12,
      pointerId: 1,
    });
    fireEvent.pointerUp(startHandle, {
      clientX: 210,
      clientY: 12,
      pointerId: 1,
    });

    const state = useTransportStore.getState();
    expect(state.loopStart).toBeCloseTo(2);
    expect(state.loopEnd).toBeCloseTo(3.25);
    expect(state.isScrubbing).toBe(false);
  });

  it('moves the full loop region and preserves its duration', () => {
    useTransportStore.getState().setLoopRegion(1, 3);
    useTransportStore.getState().toggleLoop();

    render(<TimeRuler />);

    const ruler = screen.getByRole('slider', { name: 'Timeline scrub ruler' });
    mockRulerRect(ruler);

    const loopRegion = screen.getByLabelText('Move loop region');

    fireEvent.pointerDown(loopRegion, {
      button: 0,
      clientX: 150,
      clientY: 12,
      pointerId: 1,
    });
    fireEvent.pointerMove(loopRegion, {
      clientX: 260,
      clientY: 12,
      pointerId: 1,
    });
    fireEvent.pointerUp(loopRegion, {
      clientX: 260,
      clientY: 12,
      pointerId: 1,
    });

    const state = useTransportStore.getState();
    expect(state.loopStart).toBeCloseTo(2);
    expect(state.loopEnd).toBeCloseTo(4);
  });

  it('allows free loop end positioning while Alt-dragging', () => {
    useTransportStore.getState().setLoopRegion(1, 3);
    useTransportStore.getState().toggleLoop();

    render(<TimeRuler />);

    const ruler = screen.getByRole('slider', { name: 'Timeline scrub ruler' });
    mockRulerRect(ruler);

    const endHandle = screen.getByLabelText('Adjust loop end');

    fireEvent.pointerDown(endHandle, {
      button: 0,
      clientX: 300,
      clientY: 12,
      pointerId: 1,
      altKey: true,
    });
    fireEvent.pointerMove(endHandle, {
      clientX: 345,
      clientY: 12,
      pointerId: 1,
      altKey: true,
    });
    fireEvent.pointerUp(endHandle, {
      clientX: 345,
      clientY: 12,
      pointerId: 1,
      altKey: true,
    });

    const state = useTransportStore.getState();
    expect(state.loopStart).toBeCloseTo(1);
    expect(state.loopEnd).toBeCloseTo(3.45);
  });
});
