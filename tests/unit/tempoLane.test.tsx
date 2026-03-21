import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TempoLane } from '../../src/components/timeline/TempoLane';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('TempoLane curve handles', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject({ bpm: 120 });
    useUIStore.setState({ pixelsPerSecond: 40 });

    useProjectStore.getState().addTempoEvent({ beat: 0, bpm: 120 });
    useProjectStore.getState().addTempoEvent({ beat: 8, bpm: 180, ramp: true, curve: 0 });

    vi.restoreAllMocks();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 1280,
      height: 48,
      right: 1280,
      bottom: 48,
      toJSON: () => ({}),
    });
  });

  it('reveals a curve handle on hover and updates the segment curve on drag', () => {
    render(<TempoLane />);

    const segment = screen.getByLabelText('Tempo ramp segment from beat 0 to beat 8');
    fireEvent.mouseEnter(segment);

    const handle = screen.getByRole('slider', { name: 'Tempo curve handle from beat 0 to beat 8' });
    expect(handle).toBeVisible();

    fireEvent.mouseDown(handle, { clientX: 160, clientY: 24, button: 0 });
    fireEvent.mouseMove(window, { clientX: 160, clientY: 4 });
    fireEvent.mouseUp(window);

    expect(useProjectStore.getState().project?.tempoMap?.[1].curve).not.toBe(0);
  });

  it('resets the segment curve to linear on double click', () => {
    useProjectStore.getState().updateTempoEvent(8, { curve: 0.8 });

    render(<TempoLane />);

    const segment = screen.getByLabelText('Tempo ramp segment from beat 0 to beat 8');
    fireEvent.mouseEnter(segment);

    const handle = screen.getByRole('slider', { name: 'Tempo curve handle from beat 0 to beat 8' });
    fireEvent.doubleClick(handle);

    expect(useProjectStore.getState().project?.tempoMap?.[1].curve).toBe(0);
  });
});
