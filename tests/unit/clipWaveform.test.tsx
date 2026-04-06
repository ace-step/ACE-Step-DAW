import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { CanvasClipWaveform } from '../../src/components/timeline/CanvasClipWaveform';
import { PEAK_STRIDE } from '../../src/utils/waveformPeaks';

// Mock canvas context
const mockCtx = {
  scale: vi.fn(),
  setTransform: vi.fn(),
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  roundRect: vi.fn(),
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  globalAlpha: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx as unknown as CanvasRenderingContext2D);
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 80,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Create stereo min/max peaks: [Lmax, Lmin, Rmax, Rmin, ...] */
function makePeaks(count: number, fillMax = 0.5, fillMin = -0.5): number[] {
  const peaks: number[] = [];
  for (let i = 0; i < count; i++) {
    peaks.push(fillMax, fillMin, fillMax, fillMin);
  }
  return peaks;
}

describe('CanvasClipWaveform (migrated from SVG ClipWaveform)', () => {
  it('renders canvas element when peaks are provided', () => {
    const { container } = render(
      <div style={{ width: 500, height: 80 }}>
        <CanvasClipWaveform
          peaks={makePeaks(64)}
          audioDuration={4}
          audioOffset={0}
          clipDuration={5}
          contentOffset={1}
          width={500}
          color="#22c55e"
        />
      </div>,
    );

    // Canvas should be rendered instead of SVG paths
    expect(screen.getByTestId('canvas-waveform')).toBeInTheDocument();
    // No SVG paths should be present within this render
    expect(container.querySelectorAll('path').length).toBe(0);
    expect(container.querySelectorAll('svg').length).toBe(0);

    // contentOffset=1 shifts the waveform start X to the right (1/5 of 500 = 100px)
    // Verify moveTo was called with an X >= 100 (the waveform leftPx offset)
    const moveToCall = mockCtx.moveTo.mock.calls[0];
    expect(moveToCall).toBeDefined();
    expect(moveToCall[0]).toBeGreaterThanOrEqual(100);
  });

  it('renders canvas for repitch stretch mode starting near x=0', () => {
    render(
      <div style={{ width: 600, height: 80 }}>
        <CanvasClipWaveform
          peaks={makePeaks(64)}
          audioDuration={4}
          audioOffset={0}
          clipDuration={6}
          contentOffset={1}
          timeStretchRate={4 / 6}
          stretchMode="repitch"
          width={600}
          color="#60a5fa"
        />
      </div>,
    );

    expect(screen.getByTestId('canvas-waveform')).toBeInTheDocument();
    expect(mockCtx.save).toHaveBeenCalled();
    expect(mockCtx.restore).toHaveBeenCalled();

    // Repitch stretch: waveform starts near x=0 (contentOffset ignored in repitch mode)
    const moveToCall = mockCtx.moveTo.mock.calls[0];
    expect(moveToCall).toBeDefined();
    expect(moveToCall[0]).toBeLessThan(1);
  });

  it('renders dual-channel waveform via canvas', () => {
    // 2 logical peaks × PEAK_STRIDE = 8 values
    const peaks = [
      0.8, -0.3, 0.2, -0.9,  // peak 0: L(max=0.8, min=-0.3), R(max=0.2, min=-0.9)
      0.6, -0.5, 0.4, -0.6,  // peak 1: L(max=0.6, min=-0.5), R(max=0.4, min=-0.6)
    ];
    expect(peaks.length).toBe(2 * PEAK_STRIDE);

    render(
      <div style={{ width: 200, height: 80 }}>
        <CanvasClipWaveform
          peaks={peaks}
          audioDuration={2}
          audioOffset={0}
          clipDuration={2}
          width={200}
          color="#ff0000"
        />
      </div>,
    );

    expect(screen.getByTestId('canvas-waveform')).toBeInTheDocument();
    // 2 channel fills + 2 peak envelope lines = 4 beginPath (+ 1 center divider) = 5 total
    expect(mockCtx.beginPath).toHaveBeenCalledTimes(5);
    // 2 channel fills
    expect(mockCtx.fill).toHaveBeenCalledTimes(2);
    // 1 center divider + 2 peak envelope strokes = 3
    expect(mockCtx.stroke).toHaveBeenCalledTimes(3);
  });

  it('returns null for null peaks', () => {
    const { container } = render(
      <CanvasClipWaveform
        peaks={null}
        audioDuration={2}
        audioOffset={0}
        clipDuration={2}
        width={200}
        color="#000"
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
