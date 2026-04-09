import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { CanvasClipWaveform } from '../../src/components/timeline/CanvasClipWaveform';
import { PEAK_STRIDE } from '../../src/utils/waveformPeaks';

// Mock canvas context
const mockGradient = { addColorStop: vi.fn() };
const mockCtx = {
  scale: vi.fn(),
  setTransform: vi.fn(),
  resetTransform: vi.fn(),
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
  fillRect: vi.fn(),
  createLinearGradient: vi.fn().mockReturnValue(mockGradient),
  fillStyle: '' as string | CanvasGradient,
  strokeStyle: '',
  lineWidth: 1,
  globalAlpha: 1,
  imageSmoothingEnabled: true,
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

function makePeaks(logicalCount: number): number[] {
  const peaks: number[] = [];
  for (let i = 0; i < logicalCount; i++) {
    peaks.push(0.5, -0.5, 0.5, -0.5);
  }
  return peaks;
}

describe('CanvasClipWaveform (migrated from SVG ClipWaveform)', () => {
  it('renders canvas element when peaks are provided', () => {
    const { container } = render(
      <div style={{ width: 500, height: 80 }}>
        <CanvasClipWaveform
          audioKey={null}
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

    // Canvas chunks should be rendered (chunked canvas approach)
    expect(screen.getAllByTestId('canvas-waveform').length).toBeGreaterThan(0);
    // No SVG paths
    expect(container.querySelectorAll('path').length).toBe(0);
    expect(container.querySelectorAll('svg').length).toBe(0);
  });

  it('renders canvas for repitch stretch mode', () => {
    render(
      <div style={{ width: 600, height: 80 }}>
        <CanvasClipWaveform
          audioKey={null}
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

    expect(screen.getAllByTestId('canvas-waveform').length).toBeGreaterThan(0);
  });

  it('renders dual-channel waveform via canvas', () => {
    const peaks = [
      0.8, -0.3, 0.2, -0.9,
      0.6, -0.5, 0.4, -0.6,
    ];
    expect(peaks.length).toBe(2 * PEAK_STRIDE);

    render(
      <div style={{ width: 200, height: 80 }}>
        <CanvasClipWaveform
          audioKey={null}
          peaks={peaks}
          audioDuration={2}
          audioOffset={0}
          clipDuration={2}
          width={200}
          color="#ff0000"
        />
      </div>,
    );

    expect(screen.getAllByTestId('canvas-waveform').length).toBeGreaterThan(0);
  });

  it('returns null for null peaks', () => {
    const { container } = render(
      <CanvasClipWaveform
        peaks={null}
        audioKey={null}
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
