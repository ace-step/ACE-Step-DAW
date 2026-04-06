import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { TimelineOverlayCanvas } from '../TimelineOverlayCanvas';

describe('TimelineOverlayCanvas', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      setTransform: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
    }) as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when no drag rects are provided', () => {
    const { container } = render(
      <TimelineOverlayCanvas
        ctxDrag={null}
        selDrag={null}
        scrollLeft={0}
        scrollTop={0}
        viewportWidth={800}
        viewportHeight={600}
      />,
    );
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('renders canvas when ctxDrag is provided', () => {
    const { container } = render(
      <TimelineOverlayCanvas
        ctxDrag={{ left: 100, width: 200, top: 50, height: 100 }}
        selDrag={null}
        scrollLeft={0}
        scrollTop={0}
        viewportWidth={800}
        viewportHeight={600}
      />,
    );
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.getAttribute('data-testid')).toBe('timeline-overlay-canvas');
  });

  it('renders canvas when selDrag is provided', () => {
    const { container } = render(
      <TimelineOverlayCanvas
        ctxDrag={null}
        selDrag={{ left: 50, width: 150, top: 30, height: 80 }}
        scrollLeft={0}
        scrollTop={0}
        viewportWidth={800}
        viewportHeight={600}
      />,
    );
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
  });

  it('applies pointer-events-none class for non-interactive overlay', () => {
    const { container } = render(
      <TimelineOverlayCanvas
        ctxDrag={{ left: 0, width: 100, top: 0, height: 100 }}
        selDrag={null}
        scrollLeft={0}
        scrollTop={0}
        viewportWidth={800}
        viewportHeight={600}
      />,
    );
    const canvas = container.querySelector('canvas');
    expect(canvas?.className).toContain('pointer-events-none');
  });
});
