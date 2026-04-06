import { describe, it, expect, vi } from 'vitest';
import { drawWaveform } from '../WaveformCanvasRenderer';
import { drawGrid, type GridLine, type BarShading, type GridStrength } from '../GridCanvasRenderer';
import { drawClipCanvas } from '../ClipCanvasRenderer';
import type { ClipPresentation } from '../clipPresentation';

/**
 * Create a lightweight mock CanvasRenderingContext2D.
 * Uses plain no-op functions (not vi.fn()) to avoid spy overhead,
 * giving a more accurate measure of the rendering logic's performance.
 */
function createNoopCtx(): CanvasRenderingContext2D {
  const noop = () => {};
  const noopGradient = { addColorStop: noop };
  return {
    save: noop,
    restore: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    fill: noop,
    stroke: noop,
    clearRect: noop,
    fillRect: noop,
    scale: noop,
    clip: noop,
    translate: noop,
    roundRect: noop,
    setLineDash: noop,
    createLinearGradient: () => noopGradient,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
}

/** Generate stereo peak data */
function makePeaks(count: number): number[] {
  const peaks: number[] = [];
  for (let i = 0; i < count; i++) {
    const phase = (i / count) * Math.PI * 2;
    const val = Math.sin(phase) * 0.7;
    peaks.push(Math.max(0, val), Math.min(0, val), Math.max(0, val), Math.min(0, val));
  }
  return peaks;
}

/** Generate grid lines for a 120BPM, 4/4 project */
function makeGridLines(measures: number): { lines: GridLine[]; barShading: BarShading[] } {
  const lines: GridLine[] = [];
  const barShading: BarShading[] = [];
  const barWidth = 100;
  for (let m = 0; m < measures; m++) {
    lines.push({ x: m * barWidth, strength: 'bar', outOfRange: false });
    for (let b = 1; b < 4; b++) {
      lines.push({ x: m * barWidth + b * 25, strength: 'beat', outOfRange: false });
    }
    if (m % 2 === 1) {
      barShading.push({ x: m * barWidth, width: barWidth });
    }
  }
  return { lines, barShading };
}

const mockPresentation: ClipPresentation = {
  waveformColor: '#1a1d26',
  titleColor: '#18161a',
  metaColor: 'rgba(24, 22, 26, 0.7)',
  headerBackground: '',
  bodyBackground: '',
  bodyBorderColor: '',
  bodyInnerShadow: '',
  containerShadow: '',
  clipBorder: '',
};

describe('Canvas rendering performance benchmarks', () => {
  /** Measure a rendering batch and return elapsed time. */
  function measureBatch(fn: () => void): number {
    const start = performance.now();
    fn();
    return performance.now() - start;
  }

  it('waveform rendering scales roughly linearly when doubling workload', () => {
    const peaks = makePeaks(1024);
    const ctx = createNoopCtx();

    const renderBatch = (count: number) => measureBatch(() => {
      for (let i = 0; i < count; i++) {
        drawWaveform(ctx, {
          peaks,
          audioDuration: 10,
          audioOffset: 0,
          clipDuration: 10,
          width: 800,
          height: 60,
          color: '#4a90d9',
          trackVolume: 0.8,
        });
      }
    });

    // Warm up
    renderBatch(5);

    const elapsed10 = renderBatch(10);
    const elapsed20 = renderBatch(20);

    // Doubling the workload should not cause disproportionate increase
    expect(elapsed20 / Math.max(elapsed10, 0.01)).toBeLessThan(4);
  });

  it('grid rendering scales linearly with measure count', () => {
    const ctx = createNoopCtx();
    const colors: Record<GridStrength, string> = {
      bar: 'rgba(255,255,255,0.12)',
      beat: 'rgba(255,255,255,0.06)',
      eighth: 'rgba(255,255,255,0.04)',
      sub: 'rgba(255,255,255,0.025)',
    };

    const renderGrid = (measures: number) => {
      const { lines, barShading } = makeGridLines(measures);
      return measureBatch(() => {
        drawGrid(ctx, {
          lines,
          barShading,
          totalWidth: measures * 100,
          height: 800,
          isDashed: false,
          barShadingColor: 'rgba(0,0,0,0.03)',
          colors,
        });
      });
    };

    // Warm up
    renderGrid(10);

    const elapsed50 = renderGrid(50);
    const elapsed200 = renderGrid(200);

    // 4x more measures should not take more than 8x longer
    expect(elapsed200 / Math.max(elapsed50, 0.01)).toBeLessThan(8);
  });

  it('clip canvas rendering scales linearly when doubling workload', () => {
    const peaks = makePeaks(512);
    const ctx = createNoopCtx();

    const renderClips = (count: number) => measureBatch(() => {
      for (let i = 0; i < count; i++) {
        drawClipCanvas(ctx, {
          width: 400,
          height: 60,
          headerHeight: 14,
          clipColor: '#4a90d9',
          presentation: mockPresentation,
          isSelected: i === 0,
          isMuted: false,
          borderRadius: 3,
          waveform: {
            peaks,
            audioDuration: 8,
            audioOffset: 0,
            clipDuration: 8,
            trackVolume: 0.8,
          },
        });
      }
    });

    // Warm up
    renderClips(5);

    const elapsed10 = renderClips(10);
    const elapsed20 = renderClips(20);

    expect(elapsed20 / Math.max(elapsed10, 0.01)).toBeLessThan(4);
  });

  it('waveform rendering is bounded by display columns, not peak count', () => {
    const ctx = createNoopCtx();

    const small = makePeaks(256);
    const large = makePeaks(4096);

    const renderWith = (peaks: number[]) => measureBatch(() => {
      for (let i = 0; i < 10; i++) {
        drawWaveform(ctx, {
          peaks,
          audioDuration: 10,
          audioOffset: 0,
          clipDuration: 10,
          width: 800,
          height: 60,
          color: '#4a90d9',
        });
      }
    });

    // Warm up
    renderWith(small);

    const elapsedSmall = renderWith(small);
    const elapsedLarge = renderWith(large);

    // 16x more peak data should take no more than 8x longer
    // (proves rendering is bounded by display columns, not raw peak count)
    const ratio = elapsedLarge / Math.max(elapsedSmall, 0.01);
    expect(ratio).toBeLessThan(8);
  });
});
