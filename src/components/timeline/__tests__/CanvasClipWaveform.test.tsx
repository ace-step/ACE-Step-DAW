import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CanvasClipWaveform } from '../CanvasClipWaveform';

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

function generatePeaks(count: number): number[] {
  const peaks: number[] = [];
  for (let i = 0; i < count; i++) {
    peaks.push(0.5, -0.5, 0.3, -0.3);
  }
  return peaks;
}

describe('CanvasClipWaveform', () => {
  it('returns null for null peaks', () => {
    const { container } = render(
      <CanvasClipWaveform
        peaks={null}
        audioDuration={5}
        audioOffset={0}
        clipDuration={5}
        width={200}
        color="#000"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('returns null for empty peaks', () => {
    const { container } = render(
      <CanvasClipWaveform
        peaks={[]}
        audioDuration={5}
        audioOffset={0}
        clipDuration={5}
        width={200}
        color="#000"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('returns null for zero width', () => {
    const { container } = render(
      <CanvasClipWaveform
        peaks={generatePeaks(100)}
        audioDuration={5}
        audioOffset={0}
        clipDuration={5}
        width={0}
        color="#000"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders a canvas element with correct test id', () => {
    render(
      <CanvasClipWaveform
        peaks={generatePeaks(100)}
        audioDuration={5}
        audioOffset={0}
        clipDuration={5}
        width={200}
        color="#1a1d26"
      />,
    );
    expect(screen.getByTestId('canvas-waveform')).toBeInTheDocument();
  });

  it('applies opacity class to container', () => {
    const { container } = render(
      <CanvasClipWaveform
        peaks={generatePeaks(100)}
        audioDuration={5}
        audioOffset={0}
        clipDuration={5}
        width={200}
        color="#1a1d26"
        opacityClassName="opacity-95"
      />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('opacity-95');
  });

  it('calls drawWaveform via Canvas context', () => {
    render(
      <CanvasClipWaveform
        peaks={generatePeaks(100)}
        audioDuration={5}
        audioOffset={0}
        clipDuration={5}
        width={200}
        color="#1a1d26"
      />,
    );
    // Verify Canvas was used
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('2d');
    expect(mockCtx.setTransform).toHaveBeenCalled();
    expect(mockCtx.clearRect).toHaveBeenCalled();
    // Waveform should draw (save + drawing + restore)
    expect(mockCtx.save).toHaveBeenCalled();
    expect(mockCtx.restore).toHaveBeenCalled();
  });

  it('sets canvas style width to contentWidth', () => {
    render(
      <CanvasClipWaveform
        peaks={generatePeaks(100)}
        audioDuration={5}
        audioOffset={0}
        clipDuration={5}
        width={300}
        color="#000"
      />,
    );
    const canvas = screen.getByTestId('canvas-waveform') as HTMLCanvasElement;
    expect(canvas.style.width).toBe('300px');
  });
});
