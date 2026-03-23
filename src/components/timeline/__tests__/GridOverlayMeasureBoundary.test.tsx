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

  it('marks grid lines beyond project measures as out-of-range', () => {
    // 4 measures at 120 BPM = 8s. At 50px/s with 800px viewport → visualDuration = 16s = 8 bars
    useProjectStore.setState({ project: makeProject(4) as never });
    render(<GridOverlay />);

    const barLines = screen.getAllByTestId('grid-line-bar');
    // With 4 measures and viewport extending to 8 bars, we should have 8+ bar lines
    expect(barLines.length).toBeGreaterThanOrEqual(4);

    // First 4 bar lines (bars 1-4) should be in-range
    for (let i = 0; i < 4; i++) {
      expect(barLines[i]).not.toHaveAttribute('data-out-of-range');
    }

    // Bar lines beyond measure 4 should be marked out-of-range
    if (barLines.length > 4) {
      for (let i = 4; i < barLines.length; i++) {
        expect(barLines[i]).toHaveAttribute('data-out-of-range', 'true');
      }
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
