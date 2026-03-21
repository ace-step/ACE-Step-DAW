import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TimeSignatureLane } from '../../src/components/timeline/TimeSignatureLane';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('TimeSignatureLane', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject({ bpm: 120 });
    useUIStore.setState({ pixelsPerSecond: 10 });

    vi.restoreAllMocks();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 1280,
      height: 36,
      right: 1280,
      bottom: 36,
      toJSON: () => ({}),
    });
  });

  it('renders a non-deletable default 4/4 marker at bar 1', () => {
    render(<TimeSignatureLane />);

    expect(screen.getByRole('button', { name: 'Time signature 4/4 at bar 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete time signature at bar 1' })).not.toBeInTheDocument();
  });

  it('adds a marker at the hovered measure start and inherits the previous value', () => {
    useProjectStore.getState().addTimeSignatureEvent({ bar: 5, numerator: 3, denominator: 4 });

    render(<TimeSignatureLane />);

    fireEvent.mouseMove(screen.getByTestId('time-signature-lane-hit-area'), {
      clientX: 110,
      clientY: 18,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add time signature change at bar 7' }));

    expect(useProjectStore.getState().project?.timeSignatureMap).toEqual([
      { bar: 5, numerator: 3, denominator: 4 },
      { bar: 7, numerator: 3, denominator: 4 },
    ]);
  });

  it('edits a marker value on double click', () => {
    useProjectStore.getState().addTimeSignatureEvent({ bar: 5, numerator: 3, denominator: 4 });
    vi.spyOn(window, 'prompt').mockReturnValue('7/8');

    render(<TimeSignatureLane />);

    fireEvent.doubleClick(screen.getByRole('button', { name: 'Time signature 3/4 at bar 5' }));

    expect(useProjectStore.getState().project?.timeSignatureMap).toEqual([
      { bar: 5, numerator: 7, denominator: 8 },
    ]);
  });

  it('drags markers between bar starts', () => {
    useProjectStore.getState().addTimeSignatureEvent({ bar: 5, numerator: 3, denominator: 4 });

    render(<TimeSignatureLane />);

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Time signature 3/4 at bar 5' }), {
      clientX: 80,
      clientY: 18,
      button: 0,
    });
    fireEvent.mouseMove(window, { clientX: 95, clientY: 18 });
    fireEvent.mouseUp(window);

    expect(useProjectStore.getState().project?.timeSignatureMap).toEqual([
      { bar: 6, numerator: 3, denominator: 4 },
    ]);
  });
});
