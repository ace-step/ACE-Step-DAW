import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { TimelineOverlayCanvas } from '../TimelineOverlayCanvas';

const mockCtx = {
  scale: vi.fn(),
  setTransform: vi.fn(),
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
  roundRect: vi.fn(),
};

let getContextSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx as unknown as CanvasRenderingContext2D);
  vi.clearAllMocks();
});

afterEach(() => {
  getContextSpy.mockRestore();
});

describe('TimelineOverlayCanvas', () => {
  it('renders nothing when no drags', () => {
    const { container } = render(
      <TimelineOverlayCanvas width={1000} height={500} ctxDrag={null} selDrag={null} />,
    );
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('renders canvas when ctxDrag is active', () => {
    const { container } = render(
      <TimelineOverlayCanvas
        width={1000}
        height={500}
        ctxDrag={{ left: 100, width: 200, top: 50, height: 100 }}
        selDrag={null}
      />,
    );
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.getAttribute('data-testid')).toBe('timeline-overlay-canvas');
  });

  it('renders canvas when selDrag is active', () => {
    const { container } = render(
      <TimelineOverlayCanvas
        width={1000}
        height={500}
        ctxDrag={null}
        selDrag={{ left: 100, width: 200, top: 50, height: 100 }}
      />,
    );
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('calls canvas drawing APIs for context drag', () => {
    render(
      <TimelineOverlayCanvas
        width={1000}
        height={500}
        ctxDrag={{ left: 100, width: 200, top: 50, height: 100 }}
        selDrag={null}
      />,
    );

    expect(mockCtx.fillRect).toHaveBeenCalled();
    expect(mockCtx.stroke).toHaveBeenCalled();
  });
});
