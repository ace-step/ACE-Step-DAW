import { render } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ClipWaveform } from '../../src/components/timeline/ClipWaveform';
import { PEAK_STRIDE } from '../../src/utils/waveformPeaks';

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
  scale: vi.fn(),
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
  // Mock HTMLCanvasElement.getContext
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx as unknown as CanvasRenderingContext2D);
});

/** Create stereo min/max peaks: [Lmax, Lmin, Rmax, Rmin, ...] */
function makePeaks(count: number, fillMax = 0.5, fillMin = -0.5): number[] {
  const peaks: number[] = [];
  for (let i = 0; i < count; i++) {
    peaks.push(fillMax, fillMin, fillMax, fillMin);
  }
  return peaks;
}

describe('ClipWaveform (Canvas)', () => {
  it('renders a canvas element when given valid peaks', () => {
    const { container } = render(
      <div style={{ width: 500, height: 80 }}>
        <ClipWaveform
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

    const canvas = container.querySelector('canvas[data-testid="waveform-canvas"]');
    expect(canvas).not.toBeNull();
  });

  it('renders nothing when peaks is null', () => {
    const { container } = render(
      <div style={{ width: 200, height: 80 }}>
        <ClipWaveform
          peaks={null}
          audioDuration={4}
          audioOffset={0}
          clipDuration={4}
          width={200}
          color="#ff0000"
        />
      </div>,
    );

    expect(container.querySelector('canvas')).toBeNull();
  });

  it('renders nothing when peaks array is empty', () => {
    const { container } = render(
      <div style={{ width: 200, height: 80 }}>
        <ClipWaveform
          peaks={[]}
          audioDuration={4}
          audioOffset={0}
          clipDuration={4}
          width={200}
          color="#ff0000"
        />
      </div>,
    );

    expect(container.querySelector('canvas')).toBeNull();
  });

  it('renders nothing when width is zero', () => {
    const { container } = render(
      <div style={{ width: 0, height: 80 }}>
        <ClipWaveform
          peaks={makePeaks(64)}
          audioDuration={4}
          audioOffset={0}
          clipDuration={4}
          width={0}
          color="#ff0000"
        />
      </div>,
    );

    expect(container.querySelector('canvas')).toBeNull();
  });

  it('calls canvas drawing APIs when rendering', () => {
    render(
      <div style={{ width: 200, height: 80 }}>
        <ClipWaveform
          peaks={makePeaks(64)}
          audioDuration={4}
          audioOffset={0}
          clipDuration={4}
          width={200}
          color="#ff0000"
        />
      </div>,
    );

    // Canvas context should be obtained and drawing should occur
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('2d');
    expect(mockCtx.scale).toHaveBeenCalled();
    expect(mockCtx.clearRect).toHaveBeenCalled();
  });

  it('handles repitch stretch mode', () => {
    const { container } = render(
      <div style={{ width: 600, height: 80 }}>
        <ClipWaveform
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

    const canvas = container.querySelector('canvas[data-testid="waveform-canvas"]');
    expect(canvas).not.toBeNull();
  });

  it('handles dual-channel peak data', () => {
    const peaks = [
      0.8, -0.3, 0.2, -0.9,  // peak 0: L(max=0.8, min=-0.3), R(max=0.2, min=-0.9)
      0.6, -0.5, 0.4, -0.6,  // peak 1: L(max=0.6, min=-0.5), R(max=0.4, min=-0.6)
    ];
    expect(peaks.length).toBe(2 * PEAK_STRIDE);

    const { container } = render(
      <div style={{ width: 200, height: 80 }}>
        <ClipWaveform
          peaks={peaks}
          audioDuration={2}
          audioOffset={0}
          clipDuration={2}
          width={200}
          color="#ff0000"
        />
      </div>,
    );

    const canvas = container.querySelector('canvas[data-testid="waveform-canvas"]');
    expect(canvas).not.toBeNull();
    // Drawing APIs should be called for both channels
    expect(mockCtx.fill).toHaveBeenCalled();
    expect(mockCtx.stroke).toHaveBeenCalled();
  });
});
