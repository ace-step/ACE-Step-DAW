import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';
import { GridOverlay } from '../GridOverlay';

vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

// Mock canvas getContext since jsdom doesn't support it
const mockCtx = {
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  scale: vi.fn(),
  setLineDash: vi.fn(),
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 0,
  globalAlpha: 1,
};

beforeEach(() => {
  vi.restoreAllMocks();
  Object.values(mockCtx).forEach((v) => {
    if (typeof v === 'function') (v as ReturnType<typeof vi.fn>).mockClear();
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx as unknown as CanvasRenderingContext2D);
});

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

describe('GridOverlay measures boundary (Canvas)', () => {
  beforeEach(() => {
    useUIStore.setState({ pixelsPerSecond: 50, timelineViewportWidth: 800 });
  });

  it('renders a canvas element when project exists', () => {
    useProjectStore.setState({ project: makeProject(4) as never });
    render(<GridOverlay />);

    const canvas = screen.getByTestId('grid-canvas');
    expect(canvas).toBeTruthy();
    expect(canvas.tagName).toBe('CANVAS');
  });

  it('calls canvas drawing APIs when rendering grid', () => {
    useProjectStore.setState({ project: makeProject(4) as never });
    render(<GridOverlay />);

    // Canvas context should be obtained and drawing should occur
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('2d');
    expect(mockCtx.scale).toHaveBeenCalled();
    expect(mockCtx.clearRect).toHaveBeenCalled();
  });

  it('draws bar shading rectangles for alternating bars', () => {
    useProjectStore.setState({ project: makeProject(4) as never });
    render(<GridOverlay />);

    // fillRect called for bar shading (at least once for alternating bars)
    expect(mockCtx.fillRect).toHaveBeenCalled();
  });

  it('draws grid lines via stroke calls', () => {
    useProjectStore.setState({ project: makeProject(4) as never });
    render(<GridOverlay />);

    // stroke called for grid lines (at least bar lines)
    expect(mockCtx.stroke).toHaveBeenCalled();
    // moveTo/lineTo called for drawing lines
    expect(mockCtx.moveTo).toHaveBeenCalled();
    expect(mockCtx.lineTo).toHaveBeenCalled();
  });

  it('renders nothing when no project exists', () => {
    useProjectStore.setState({ project: null as never });
    const { container } = render(<GridOverlay />);

    expect(container.querySelector('canvas')).toBeNull();
  });
});
