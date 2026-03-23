import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TimeRuler } from '../../src/components/timeline/TimeRuler';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';
import { useTransportStore } from '../../src/store/transportStore';

vi.mock('../../src/hooks/useTransport', () => ({
  useTransport: () => ({
    startScrub: vi.fn(),
    scrubTo: vi.fn(),
    endScrub: vi.fn(),
  }),
}));

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('TimeRuler seek and loop selection', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);

    useProjectStore.getState().createProject({ name: 'Scrub Test' });
    useUIStore.getState().setPixelsPerSecond(100);
  });

  it('silently seeks on click and creates loop region on drag', () => {
    render(<TimeRuler />);

    const ruler = screen.getByRole('slider', {
      name: 'Timeline ruler — click to seek, drag to select loop region',
    });
    vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue({
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

    // Click silently seeks (no scrub)
    fireEvent.pointerDown(ruler, {
      button: 0,
      clientX: 120,
      clientY: 12,
      pointerId: 1,
    });

    let state = useTransportStore.getState();
    // Should have seeked without entering scrub mode
    expect(state.isScrubbing).toBe(false);
    expect(state.currentTime).toBeCloseTo(1.2);
    expect(state.playStartTime).toBeCloseTo(1.2);

    // Drag to create loop region
    fireEvent.pointerMove(ruler, {
      clientX: 220,
      clientY: 12,
      pointerId: 1,
    });

    state = useTransportStore.getState();
    expect(state.loopEnabled).toBe(true);
    expect(state.loopStart).toBeCloseTo(1.2);
    expect(state.loopEnd).toBeCloseTo(2.2);

    // Release
    fireEvent.pointerUp(ruler, {
      clientX: 220,
      clientY: 12,
      pointerId: 1,
    });

    state = useTransportStore.getState();
    // Scrub mode should never have been entered
    expect(state.isScrubbing).toBe(false);
    expect(state.loopEnabled).toBe(true);
  });
});
