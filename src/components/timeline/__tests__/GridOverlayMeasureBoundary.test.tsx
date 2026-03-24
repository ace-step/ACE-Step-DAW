import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';
import { GridOverlay } from '../GridOverlay';

vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

const makeProject = (measures: number) => ({
  id: 'test-project',
  name: 'Test',
  bpm: 120,
  timeSignature: 4,
  measures,
  totalDuration: measures * 2, // 120 BPM, 4/4 → 2s per bar
  tracks: [],
  tempoMap: [],
  timeSignatureMap: [],
  sampleRate: 44100,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

describe('GridOverlay measures boundary', () => {
  beforeEach(() => {
    useUIStore.setState({ pixelsPerSecond: 50, timelineViewportWidth: 800 });
  });

  it('stops drawing bar lines at the configured project measures', () => {
    useProjectStore.setState({ project: makeProject(4) as never });
    render(<GridOverlay />);

    const barLines = screen.getAllByTestId('grid-line-bar');
    expect(barLines).toHaveLength(4);
    for (const line of barLines) {
      expect(line).not.toHaveAttribute('data-out-of-range');
    }
  });

  it('all grid lines are in-range when measures cover the entire viewport', () => {
    // 200 measures at 120 BPM = 400s. At 50px/s that's 20000px > 800px viewport
    useProjectStore.setState({ project: makeProject(200) as never });
    render(<GridOverlay />);

    const barLines = screen.getAllByTestId('grid-line-bar');
    for (const line of barLines) {
      expect(line).not.toHaveAttribute('data-out-of-range');
    }
  });
});
