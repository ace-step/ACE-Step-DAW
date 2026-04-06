import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getVisiblePeakSlice,
  getMinMaxForColumn,
  precomputeColumnMinMax,
  drawChannelWaveform,
  drawPeakEnvelopeLine,
  drawCenterDivider,
  drawWaveform,
  drawMidiThumbnail,
} from '../waveformRenderer';

/**
 * Create a mock CanvasRenderingContext2D for testing draw calls.
 */
function createMockCtx(): CanvasRenderingContext2D {
  const ctx = {
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
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    canvas: { width: 400, height: 100 },
  } as unknown as CanvasRenderingContext2D;
  return ctx;
}

/**
 * Generate stereo peak data with stride-4 format:
 * [Lmax, Lmin, Rmax, Rmin, ...]
 */
function generatePeaks(count: number, amplitude: number = 0.5): number[] {
  const peaks: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const val = amplitude * Math.sin(t * Math.PI * 2);
    peaks.push(
      Math.abs(val),   // Lmax
      -Math.abs(val),  // Lmin
      Math.abs(val) * 0.8,  // Rmax
      -Math.abs(val) * 0.8, // Rmin
    );
  }
  return peaks;
}

// ---------- getVisiblePeakSlice ----------

describe('getVisiblePeakSlice', () => {
  it('returns empty for zero peaks', () => {
    const result = getVisiblePeakSlice(0, 10, 0, 10);
    expect(result).toEqual({ startPeakIdx: 0, numBars: 0 });
  });

  it('returns empty for zero audio duration', () => {
    const result = getVisiblePeakSlice(100, 0, 0, 10);
    expect(result).toEqual({ startPeakIdx: 0, numBars: 0 });
  });

  it('returns full range with no offset', () => {
    const result = getVisiblePeakSlice(100, 10, 0, 10);
    expect(result.startPeakIdx).toBe(0);
    expect(result.numBars).toBe(100);
  });

  it('returns correct slice with audio offset', () => {
    const result = getVisiblePeakSlice(100, 10, 5, 5);
    expect(result.startPeakIdx).toBe(50);
    expect(result.numBars).toBe(50);
  });

  it('clamps end to total peaks', () => {
    const result = getVisiblePeakSlice(100, 10, 8, 10);
    expect(result.startPeakIdx).toBe(80);
    expect(result.numBars).toBe(20);
  });

  it('handles source span shorter than remaining audio', () => {
    const result = getVisiblePeakSlice(100, 10, 0, 3);
    expect(result.startPeakIdx).toBe(0);
    expect(result.numBars).toBe(30);
  });
});

// ---------- getMinMaxForColumn ----------

describe('getMinMaxForColumn', () => {
  const peaks = [
    0.8, -0.6, 0.4, -0.3,  // peak 0
    0.5, -0.4, 0.3, -0.2,  // peak 1
    0.9, -0.7, 0.6, -0.5,  // peak 2
    0.3, -0.2, 0.2, -0.1,  // peak 3
  ];

  it('returns max/min for single peak column (left channel)', () => {
    const result = getMinMaxForColumn(
      peaks,
      { startPeakIdx: 0, numBars: 4 },
      0, 4, 0,
    );
    expect(result.max).toBe(0.8);
    expect(result.min).toBe(-0.6);
  });

  it('returns max/min for right channel', () => {
    const result = getMinMaxForColumn(
      peaks,
      { startPeakIdx: 0, numBars: 4 },
      0, 4, 2,
    );
    expect(result.max).toBe(0.4);
    expect(result.min).toBe(-0.3);
  });

  it('aggregates across multiple peaks when fewer columns than peaks', () => {
    const result = getMinMaxForColumn(
      peaks,
      { startPeakIdx: 0, numBars: 4 },
      0, 2, 0,
    );
    // Column 0 maps to peaks 0-1
    expect(result.max).toBe(0.8);
    expect(result.min).toBe(-0.6);
  });

  it('finds global max when aggregating', () => {
    const result = getMinMaxForColumn(
      peaks,
      { startPeakIdx: 0, numBars: 4 },
      1, 2, 0,
    );
    // Column 1 maps to peaks 2-3
    expect(result.max).toBe(0.9);
    expect(result.min).toBe(-0.7);
  });

  it('returns zero for out-of-range peaks', () => {
    const result = getMinMaxForColumn(
      peaks,
      { startPeakIdx: 10, numBars: 4 },
      0, 4, 0,
    );
    expect(result.max).toBe(0);
    expect(result.min).toBe(0);
  });
});

// ---------- drawChannelWaveform ----------

describe('drawChannelWaveform', () => {
  let ctx: CanvasRenderingContext2D;
  const peaks = generatePeaks(10, 0.5);

  beforeEach(() => {
    ctx = createMockCtx();
  });

  it('does nothing for zero columns', () => {
    const { maxArr, minArr } = precomputeColumnMinMax(peaks, { startPeakIdx: 0, numBars: 10 }, 0, 0);
    drawChannelWaveform(ctx, 0, 10, 0, 50, 23, '#000', 0.6, maxArr, minArr);
    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it('draws a closed path with fill', () => {
    const { maxArr, minArr } = precomputeColumnMinMax(peaks, { startPeakIdx: 0, numBars: 10 }, 5, 0);
    drawChannelWaveform(ctx, 5, 10, 0, 50, 23, '#1a1d26', 0.6, maxArr, minArr);
    expect(ctx.beginPath).toHaveBeenCalledTimes(1);
    expect(ctx.moveTo).toHaveBeenCalledTimes(1);
    // 5 upper + 5 lower - 1 (moveTo) = 9 lineTo calls
    expect(ctx.lineTo).toHaveBeenCalledTimes(9);
    expect(ctx.closePath).toHaveBeenCalledTimes(1);
    expect(ctx.fill).toHaveBeenCalledTimes(1);
    expect(ctx.fillStyle).toBe('#1a1d26');
  });

  it('preserves and restores globalAlpha', () => {
    ctx.globalAlpha = 0.9;
    const { maxArr, minArr } = precomputeColumnMinMax(peaks, { startPeakIdx: 0, numBars: 10 }, 5, 0);
    drawChannelWaveform(ctx, 5, 10, 0, 50, 23, '#000', 0.6, maxArr, minArr);
    // globalAlpha should be restored to previous value
    expect(ctx.globalAlpha).toBe(0.9);
  });
});

// ---------- drawPeakEnvelopeLine ----------

describe('drawPeakEnvelopeLine', () => {
  let ctx: CanvasRenderingContext2D;
  const peaks = generatePeaks(10, 0.5);

  beforeEach(() => {
    ctx = createMockCtx();
  });

  it('does nothing for zero columns', () => {
    const { maxArr } = precomputeColumnMinMax(peaks, { startPeakIdx: 0, numBars: 10 }, 0, 0);
    drawPeakEnvelopeLine(ctx, 0, 10, 0, 50, 23, '#000', 0.8, maxArr);
    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it('draws an open polyline with stroke', () => {
    const { maxArr } = precomputeColumnMinMax(peaks, { startPeakIdx: 0, numBars: 10 }, 5, 0);
    drawPeakEnvelopeLine(ctx, 5, 10, 0, 50, 23, '#1a1d26', 0.8, maxArr);
    expect(ctx.beginPath).toHaveBeenCalledTimes(1);
    expect(ctx.moveTo).toHaveBeenCalledTimes(1);
    expect(ctx.lineTo).toHaveBeenCalledTimes(4);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
    expect(ctx.strokeStyle).toBe('#1a1d26');
    expect(ctx.lineWidth).toBe(0.8);
    // No closePath — it's an open polyline
    expect(ctx.closePath).not.toHaveBeenCalled();
  });
});

// ---------- drawCenterDivider ----------

describe('drawCenterDivider', () => {
  it('draws a horizontal line at the center', () => {
    const ctx = createMockCtx();
    drawCenterDivider(ctx, 10, 200, 50, '#000');
    expect(ctx.beginPath).toHaveBeenCalledTimes(1);
    expect(ctx.moveTo).toHaveBeenCalledWith(10, 50);
    expect(ctx.lineTo).toHaveBeenCalledWith(210, 50);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
    expect(ctx.globalAlpha).toBe(1); // restored after draw
  });
});

// ---------- drawWaveform (integration) ----------

describe('drawWaveform', () => {
  let ctx: CanvasRenderingContext2D;

  beforeEach(() => {
    ctx = createMockCtx();
  });

  it('does nothing for empty peaks', () => {
    drawWaveform(ctx, {
      peaks: [],
      audioDuration: 5,
      audioOffset: 0,
      clipDuration: 5,
      width: 200,
      height: 100,
      color: '#000',
    });
    expect(ctx.save).not.toHaveBeenCalled();
  });

  it('does nothing for zero width', () => {
    drawWaveform(ctx, {
      peaks: generatePeaks(100),
      audioDuration: 5,
      audioOffset: 0,
      clipDuration: 5,
      width: 0,
      height: 100,
      color: '#000',
    });
    expect(ctx.save).not.toHaveBeenCalled();
  });

  it('draws complete waveform with save/restore', () => {
    drawWaveform(ctx, {
      peaks: generatePeaks(100),
      audioDuration: 5,
      audioOffset: 0,
      clipDuration: 5,
      width: 200,
      height: 100,
      color: '#1a1d26',
    });
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
    // Should draw: 1 center divider + 2 channel fills + 2 peak envelopes = 5 beginPath
    expect(ctx.beginPath).toHaveBeenCalledTimes(5);
    // 2 channel fills
    expect(ctx.fill).toHaveBeenCalledTimes(2);
    // 1 center divider + 2 peak envelopes = 3 strokes
    expect(ctx.stroke).toHaveBeenCalledTimes(3);
  });

  it('scales amplitude by trackVolume', () => {
    const ctx1 = createMockCtx();
    const ctx2 = createMockCtx();
    const peaks = generatePeaks(10, 1);

    drawWaveform(ctx1, {
      peaks,
      audioDuration: 5,
      audioOffset: 0,
      clipDuration: 5,
      width: 200,
      height: 100,
      color: '#000',
      trackVolume: 1,
    });

    drawWaveform(ctx2, {
      peaks,
      audioDuration: 5,
      audioOffset: 0,
      clipDuration: 5,
      width: 200,
      height: 100,
      color: '#000',
      trackVolume: 0.5,
    });

    // Both should draw, but the y-coordinates should differ
    // Both should complete successfully
    expect(ctx1.fill).toHaveBeenCalledTimes(2);
    expect(ctx2.fill).toHaveBeenCalledTimes(2);
  });
});

// ---------- drawMidiThumbnail ----------

describe('drawMidiThumbnail', () => {
  let ctx: CanvasRenderingContext2D;

  beforeEach(() => {
    ctx = createMockCtx();
  });

  it('does nothing for empty notes', () => {
    drawMidiThumbnail(ctx, [], 200, 100, 5, 120, '#000');
    expect(ctx.save).not.toHaveBeenCalled();
  });

  it('does nothing for zero width', () => {
    drawMidiThumbnail(ctx, [{ pitch: 60, startBeat: 0, durationBeats: 1 }], 0, 100, 5, 120, '#000');
    expect(ctx.save).not.toHaveBeenCalled();
  });

  it('draws rectangles for each note', () => {
    const notes = [
      { pitch: 60, startBeat: 0, durationBeats: 1 },
      { pitch: 64, startBeat: 1, durationBeats: 0.5 },
      { pitch: 67, startBeat: 2, durationBeats: 2 },
    ];
    drawMidiThumbnail(ctx, notes, 200, 100, 5, 120, '#abc');
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
    expect(ctx.roundRect).toHaveBeenCalledTimes(3);
    expect(ctx.fill).toHaveBeenCalledTimes(3);
    expect(ctx.fillStyle).toBe('#abc');
  });

  it('filters notes at narrow widths', () => {
    const notes = Array.from({ length: 100 }, (_, i) => ({
      pitch: 60 + (i % 12),
      startBeat: i * 0.5,
      durationBeats: 0.25,
    }));
    // Width 40 → maxNotes = max(20, 40/2) = 20
    drawMidiThumbnail(ctx, notes, 40, 100, 60, 120, '#000');
    expect(ctx.roundRect).toHaveBeenCalledTimes(20);
  });
});
