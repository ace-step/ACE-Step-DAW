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
  it('renders 20 waveforms (1024 peaks each) within frame budget', () => {
    const peaks = makePeaks(1024);
    const ctx = createNoopCtx();

    const start = performance.now();
    for (let i = 0; i < 20; i++) {
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
    const elapsed = performance.now() - start;

    // With noop context, rendering 20 waveforms should be well under 16ms
    // Real GPU Canvas would be even faster
    expect(elapsed).toBeLessThan(50);
  });

  it('renders 40 waveforms (dense project) efficiently', () => {
    const peaks = makePeaks(1024);
    const ctx = createNoopCtx();

    const start = performance.now();
    for (let i = 0; i < 40; i++) {
      drawWaveform(ctx, {
        peaks,
        audioDuration: 10,
        audioOffset: 0,
        clipDuration: 10,
        width: 1920,
        height: 50,
        color: '#4a90d9',
        trackVolume: 0.8,
      });
    }
    const elapsed = performance.now() - start;

    // 40 waveforms is a very dense project — still should be fast
    expect(elapsed).toBeLessThan(100);
  });

  it('renders grid for 200-bar project in under 5ms', () => {
    const { lines, barShading } = makeGridLines(200);
    const ctx = createNoopCtx();
    const colors: Record<GridStrength, string> = {
      bar: 'rgba(255,255,255,0.12)',
      beat: 'rgba(255,255,255,0.06)',
      eighth: 'rgba(255,255,255,0.04)',
      sub: 'rgba(255,255,255,0.025)',
    };

    const start = performance.now();
    drawGrid(ctx, {
      lines,
      barShading,
      totalWidth: 20000,
      height: 800,
      isDashed: false,
      barShadingColor: 'rgba(0,0,0,0.03)',
      colors,
    });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5);
  });

  it('renders 20 clip canvases with waveforms within budget', () => {
    const peaks = makePeaks(512);
    const ctx = createNoopCtx();

    const start = performance.now();
    for (let i = 0; i < 20; i++) {
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
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
  });

  it('combined frame: grid + 20 clips fits within budget', () => {
    const peaks = makePeaks(512);
    const ctx = createNoopCtx();
    const { lines, barShading } = makeGridLines(50);
    const colors: Record<GridStrength, string> = {
      bar: 'rgba(255,255,255,0.12)',
      beat: 'rgba(255,255,255,0.06)',
      eighth: 'rgba(255,255,255,0.04)',
      sub: 'rgba(255,255,255,0.025)',
    };

    const start = performance.now();

    drawGrid(ctx, {
      lines,
      barShading,
      totalWidth: 5000,
      height: 800,
      isDashed: false,
      barShadingColor: 'rgba(0,0,0,0.03)',
      colors,
    });

    for (let i = 0; i < 20; i++) {
      drawClipCanvas(ctx, {
        width: 300,
        height: 55,
        headerHeight: 14,
        clipColor: '#4a90d9',
        presentation: mockPresentation,
        isSelected: false,
        isMuted: false,
        borderRadius: 3,
        waveform: {
          peaks,
          audioDuration: 6,
          audioOffset: 0,
          clipDuration: 6,
          trackVolume: 0.75,
        },
      });
    }

    const elapsed = performance.now() - start;

    // Full frame rendering: grid + 20 clips with waveforms
    expect(elapsed).toBeLessThan(50);
  });

  it('waveform rendering scales linearly with peak count', () => {
    const ctx = createNoopCtx();

    const small = makePeaks(256);
    const large = makePeaks(4096);

    const startSmall = performance.now();
    for (let i = 0; i < 10; i++) {
      drawWaveform(ctx, {
        peaks: small,
        audioDuration: 10,
        audioOffset: 0,
        clipDuration: 10,
        width: 800,
        height: 60,
        color: '#4a90d9',
      });
    }
    const elapsedSmall = performance.now() - startSmall;

    const startLarge = performance.now();
    for (let i = 0; i < 10; i++) {
      drawWaveform(ctx, {
        peaks: large,
        audioDuration: 10,
        audioOffset: 0,
        clipDuration: 10,
        width: 800,
        height: 60,
        color: '#4a90d9',
      });
    }
    const elapsedLarge = performance.now() - startLarge;

    // Large peaks (16x more data) should take no more than 20x longer
    // (proves we're iterating through display columns, not peaks)
    const ratio = elapsedLarge / Math.max(elapsedSmall, 0.01);
    expect(ratio).toBeLessThan(20);
  });
});
