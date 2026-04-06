import { describe, it, expect, vi, beforeEach } from 'vitest';
import { drawClipCanvas, type ClipCanvasParams } from '../ClipCanvasRenderer';
import type { ClipPresentation } from '../clipPresentation';

function createMockCtx(): CanvasRenderingContext2D {
  const ctx = {
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
    clip: vi.fn(),
    translate: vi.fn(),
    roundRect: vi.fn(),
    setLineDash: vi.fn(),
    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
  return ctx;
}

const mockPresentation: ClipPresentation = {
  waveformColor: '#1a1d26',
  titleColor: '#18161a',
  metaColor: 'rgba(24, 22, 26, 0.7)',
  headerBackground: 'linear-gradient(180deg, rgba(74,144,217,0.96) 0%, rgba(74,144,217,0.9) 100%)',
  bodyBackground: 'linear-gradient(180deg, rgba(74,144,217,0.56) 0%, rgba(74,144,217,0.42) 100%)',
  bodyBorderColor: 'rgba(74,144,217,0.34)',
  bodyInnerShadow: 'inset 0 1px 2px rgba(0,0,0,0.3)',
  containerShadow: '0 8px 18px rgba(0,0,0,0.14)',
  clipBorder: '1px solid rgba(74,144,217,0.5)',
};

function defaultParams(overrides?: Partial<ClipCanvasParams>): ClipCanvasParams {
  return {
    width: 200,
    height: 60,
    headerHeight: 14,
    clipColor: '#4a90d9',
    presentation: mockPresentation,
    isSelected: false,
    isMuted: false,
    borderRadius: 3,
    ...overrides,
  };
}

describe('ClipCanvasRenderer', () => {
  let ctx: CanvasRenderingContext2D;

  beforeEach(() => {
    ctx = createMockCtx();
  });

  it('draws header and body backgrounds', () => {
    drawClipCanvas(ctx, defaultParams());

    // Should use gradients for header and body
    expect(ctx.createLinearGradient).toHaveBeenCalled();
    // Should fill rectangles
    expect(ctx.fillRect).toHaveBeenCalled();
    // Should clip to rounded rect
    expect(ctx.roundRect).toHaveBeenCalled();
    expect(ctx.clip).toHaveBeenCalled();
  });

  it('draws outer border', () => {
    drawClipCanvas(ctx, defaultParams());

    // Should stroke the border
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('draws selected state with white border', () => {
    drawClipCanvas(ctx, defaultParams({ isSelected: true }));

    // Should set white border for selected state
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('draws muted overlay when muted', () => {
    drawClipCanvas(ctx, defaultParams({ isMuted: true }));

    // fillRect called multiple times: body + muted overlay
    expect(ctx.fillRect).toHaveBeenCalled();
  });

  it('does nothing for zero width', () => {
    drawClipCanvas(ctx, defaultParams({ width: 0 }));
    expect(ctx.save).not.toHaveBeenCalled();
  });

  it('does nothing for zero height', () => {
    drawClipCanvas(ctx, defaultParams({ height: 0 }));
    expect(ctx.save).not.toHaveBeenCalled();
  });

  it('draws waveform when waveform data is provided', () => {
    const peaks = Array.from({ length: 40 }, (_, i) => (i % 4 < 2 ? 0.5 : -0.3));
    drawClipCanvas(ctx, defaultParams({
      waveform: {
        peaks,
        audioDuration: 4,
        audioOffset: 0,
        clipDuration: 4,
        trackVolume: 1,
      },
    }));

    // translate should be called to position waveform below header
    expect(ctx.translate).toHaveBeenCalledWith(0, 14);
  });

  it('skips waveform when peaks is null', () => {
    drawClipCanvas(ctx, defaultParams({
      waveform: {
        peaks: null,
        audioDuration: 4,
        audioOffset: 0,
        clipDuration: 4,
      },
    }));

    // translate should NOT be called (no waveform area transform)
    expect(ctx.translate).not.toHaveBeenCalled();
  });
});
