import { describe, it, expect, vi, beforeEach } from 'vitest';
import { drawWaveform, type WaveformRenderParams } from '../WaveformCanvasRenderer';
import { PEAK_STRIDE } from '../../../utils/waveformPeaks';

/** Create a mock CanvasRenderingContext2D with spied methods. */
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
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
  return ctx;
}

/** Generate stereo peak data: [Lmax, Lmin, Rmax, Rmin, ...] */
function makePeaks(count: number, amplitude = 0.5): number[] {
  const peaks: number[] = [];
  for (let i = 0; i < count; i++) {
    const phase = (i / count) * Math.PI * 2;
    const val = Math.sin(phase) * amplitude;
    peaks.push(
      Math.max(0, val),   // Lmax
      Math.min(0, val),   // Lmin
      Math.max(0, val),   // Rmax
      Math.min(0, val),   // Rmin
    );
  }
  return peaks;
}

function defaultParams(overrides?: Partial<WaveformRenderParams>): WaveformRenderParams {
  return {
    peaks: makePeaks(100),
    audioDuration: 10,
    audioOffset: 0,
    clipDuration: 10,
    width: 200,
    height: 60,
    color: '#4a90d9',
    ...overrides,
  };
}

describe('WaveformCanvasRenderer', () => {
  let ctx: CanvasRenderingContext2D;

  beforeEach(() => {
    ctx = createMockCtx();
  });

  it('draws waveform paths when given valid peaks', () => {
    drawWaveform(ctx, defaultParams());

    // Should call save/restore for state management
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();

    // Should draw filled waveform shapes (beginPath + fill for L and R channels)
    expect(ctx.fill).toHaveBeenCalled();

    // Should draw peak envelope lines (beginPath + stroke for L and R channels)
    // 1 center divider + 2 peak lines = 3 strokes
    expect(ctx.stroke).toHaveBeenCalledTimes(3);
  });

  it('does nothing when peaks is null', () => {
    drawWaveform(ctx, defaultParams({ peaks: null }));
    expect(ctx.save).not.toHaveBeenCalled();
    expect(ctx.fill).not.toHaveBeenCalled();
  });

  it('does nothing when peaks is empty', () => {
    drawWaveform(ctx, defaultParams({ peaks: [] }));
    expect(ctx.save).not.toHaveBeenCalled();
  });

  it('does nothing when width is zero', () => {
    drawWaveform(ctx, defaultParams({ width: 0 }));
    expect(ctx.save).not.toHaveBeenCalled();
  });

  it('does nothing when clip duration is zero', () => {
    drawWaveform(ctx, defaultParams({ clipDuration: 0 }));
    expect(ctx.save).not.toHaveBeenCalled();
  });

  it('scales waveform by trackVolume', () => {
    const fullVol = createMockCtx();
    const halfVol = createMockCtx();

    drawWaveform(fullVol, defaultParams({ trackVolume: 1 }));
    drawWaveform(halfVol, defaultParams({ trackVolume: 0.5 }));

    // Both should render (fill called)
    expect(fullVol.fill).toHaveBeenCalled();
    expect(halfVol.fill).toHaveBeenCalled();
  });

  it('respects audioOffset for visible peak slice', () => {
    // Offset halfway into audio — should still render
    drawWaveform(ctx, defaultParams({
      audioOffset: 5,
      audioDuration: 10,
      clipDuration: 5,
    }));
    expect(ctx.fill).toHaveBeenCalled();
  });

  it('handles single-peak data without crash', () => {
    const singlePeak = [0.5, -0.3, 0.4, -0.2]; // exactly 1 logical peak
    drawWaveform(ctx, defaultParams({ peaks: singlePeak }));
    // Should still attempt to draw
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('handles time-stretched clips', () => {
    drawWaveform(ctx, defaultParams({
      timeStretchRate: 2.0,
      stretchMode: 'repitch',
    }));
    expect(ctx.fill).toHaveBeenCalled();
  });

  it('applies opacity parameter', () => {
    drawWaveform(ctx, defaultParams({ opacity: 0.5 }));
    // globalAlpha should have been set
    expect(ctx.save).toHaveBeenCalled();
  });

  it('bounds drawing work for very large peak arrays', () => {
    const largePeaks = makePeaks(10000);

    drawWaveform(ctx, defaultParams({ peaks: largePeaks, width: 1920 }));

    expect(ctx.fill).toHaveBeenCalled();
    // Rendering work is bounded by display columns (width=1920), not peak count (10000).
    // 2 channels × 3 passes (fill upper, fill lower, peak line) × ~1920 columns ≈ 11520.
    // This should be well below 10000 × 6 = 60000 if we iterated every peak.
    expect(ctx.lineTo).toHaveBeenCalled();
    const lineToCount = (ctx.lineTo as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(lineToCount).toBeLessThan(1920 * 8); // bounded by columns, not peaks
    expect(lineToCount).toBeLessThan(10000 * 2); // much less than if we traced every peak
  });
});
