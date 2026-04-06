import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimelineOverlayCanvas } from '../TimelineOverlayCanvas';

const mockCtx = {
  setTransform: vi.fn(),
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fillRect: vi.fn(),
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  getContext: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    cb(0);
    return 1;
  });
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(mockCtx);
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 800,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 400,
  });
});

describe('TimelineOverlayCanvas', () => {
  it('returns null when no drag rects', () => {
    const { container } = render(
      <TimelineOverlayCanvas
        ctxDragRect={null}
        selDragRect={null}
        scrollLeft={0}
        scrollTop={0}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders canvas when ctxDragRect is set', () => {
    render(
      <TimelineOverlayCanvas
        ctxDragRect={{ left: 10, width: 100, top: 20, height: 50 }}
        selDragRect={null}
        scrollLeft={0}
        scrollTop={0}
      />,
    );
    expect(screen.getByTestId('timeline-overlay-canvas')).toBeInTheDocument();
  });

  it('renders canvas when selDragRect is set', () => {
    render(
      <TimelineOverlayCanvas
        ctxDragRect={null}
        selDragRect={{ left: 50, width: 200, top: 30, height: 80 }}
        scrollLeft={0}
        scrollTop={0}
      />,
    );
    expect(screen.getByTestId('timeline-overlay-canvas')).toBeInTheDocument();
  });

  it('draws both rects when both are set', () => {
    render(
      <TimelineOverlayCanvas
        ctxDragRect={{ left: 10, width: 100, top: 20, height: 50 }}
        selDragRect={{ left: 50, width: 200, top: 30, height: 80 }}
        scrollLeft={0}
        scrollTop={0}
      />,
    );
    // 2 fillRect calls (one per drag rect)
    expect(mockCtx.fillRect).toHaveBeenCalledTimes(2);
    // 4 stroke calls (2 per rect: horizontal borders + vertical edges)
    expect(mockCtx.stroke).toHaveBeenCalledTimes(4);
  });

  it('has pointer-events-none class', () => {
    render(
      <TimelineOverlayCanvas
        ctxDragRect={{ left: 0, width: 100, top: 0, height: 100 }}
        selDragRect={null}
        scrollLeft={0}
        scrollTop={0}
      />,
    );
    const canvas = screen.getByTestId('timeline-overlay-canvas');
    expect(canvas.className).toContain('pointer-events-none');
  });
});
