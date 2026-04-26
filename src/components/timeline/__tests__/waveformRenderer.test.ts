import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getVisiblePeakSlice,
  getMinMaxForColumn,
  precomputeColumnMinMax,
  precomputeMergedMonoMinMax,
  drawCenterDivider,
  drawWaveform,
  drawMidiThumbnail,
  computeBlendFactor,
  fadeGainAtPixel,
  type FadeEnvelope,
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

// drawChannelWaveform and drawPeakEnvelopeLine were replaced by the
// internal drawChannelFill function (not exported). Integration tests
// for the full waveform are covered by drawWaveform tests below.

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

  it('draws mono merged waveform with fillRect bars', () => {
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
    // Column count = peak count (100 peaks for 100 logical peaks)
    expect(ctx.fillRect.mock.calls.length).toBe(100);
    expect(ctx.fill).not.toHaveBeenCalled();
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

    // Both render fillRect bars (10 peaks = 10 columns)
    expect(ctx1.fillRect.mock.calls.length).toBe(10);
    expect(ctx2.fillRect.mock.calls.length).toBe(10);
  });
});

// ---------- precomputeMergedMonoMinMax ----------

describe('precomputeMergedMonoMinMax', () => {
  it('merges L/R by taking max of maxes and min of mins', () => {
    // 2 logical peaks, stride-4: [Lmax, Lmin, Rmax, Rmin, ...]
    const peaks = [
      0.8, -0.3, 0.5, -0.9,  // peak 0: L=(0.8,-0.3), R=(0.5,-0.9)
      0.4, -0.6, 0.7, -0.2,  // peak 1: L=(0.4,-0.6), R=(0.7,-0.2)
    ];
    const peakSlice = { startPeakIdx: 0, numBars: 2 };
    const result = precomputeMergedMonoMinMax(peaks, peakSlice, 2);

    // Column 0 → peak 0: max(0.8, 0.5)=0.8, min(-0.3, -0.9)=-0.9
    expect(result.maxArr[0]).toBe(0.8);
    expect(result.minArr[0]).toBe(-0.9);

    // Column 1 → peak 1: max(0.4, 0.7)=0.7, min(-0.6, -0.2)=-0.6
    expect(result.maxArr[1]).toBe(0.7);
    expect(result.minArr[1]).toBe(-0.6);
  });
});

// ---------- computeBlendFactor ----------

describe('computeBlendFactor', () => {
  it('returns 0 when samplesPerPixel >= BLEND_START (16)', () => {
    expect(computeBlendFactor(16)).toBe(0);
    expect(computeBlendFactor(100)).toBe(0);
  });

  it('returns 1 when samplesPerPixel <= BLEND_END (4)', () => {
    expect(computeBlendFactor(4)).toBe(1);
    expect(computeBlendFactor(1)).toBe(1);
  });

  it('returns 0.5 at midpoint (10)', () => {
    expect(computeBlendFactor(10)).toBe(0.5);
  });

  it('returns value between 0 and 1 in transition zone', () => {
    const blend = computeBlendFactor(8);
    expect(blend).toBeGreaterThan(0);
    expect(blend).toBeLessThan(1);
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

describe('fadeGainAtPixel', () => {
  const env: FadeEnvelope = {
    totalWidthPx: 100,
    fadeInPx: 20,
    fadeOutPx: 30,
    fadeInCurve: 'linear',
    fadeOutCurve: 'linear',
  };

  it('returns 1 outside the fade regions', () => {
    expect(fadeGainAtPixel(env, 30)).toBe(1);
    expect(fadeGainAtPixel(env, 60)).toBe(1);
  });

  it('returns 0 at fade-in start and 1 at fade-in end (linear)', () => {
    expect(fadeGainAtPixel(env, 0)).toBeCloseTo(0, 5);
    expect(fadeGainAtPixel(env, 20)).toBeCloseTo(1, 5);
    expect(fadeGainAtPixel(env, 10)).toBeCloseTo(0.5, 5);
  });

  it('returns 1 at fade-out start and 0 at fade-out end (linear)', () => {
    expect(fadeGainAtPixel(env, 70)).toBeCloseTo(1, 5);
    expect(fadeGainAtPixel(env, 100)).toBeCloseTo(0, 5);
    expect(fadeGainAtPixel(env, 85)).toBeCloseTo(0.5, 5);
  });

  it('uses equal-power curve when configured', () => {
    const eq: FadeEnvelope = { ...env, fadeInCurve: 'equal-power' };
    // sin(0.5 * PI/2) = sin(PI/4) ≈ 0.707
    expect(fadeGainAtPixel(eq, 10)).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it('uses exponential curve when configured', () => {
    const exp: FadeEnvelope = { ...env, fadeInCurve: 'exponential' };
    // t=0.5, t² = 0.25
    expect(fadeGainAtPixel(exp, 10)).toBeCloseTo(0.25, 5);
  });

  it('returns 1 when envelope is undefined', () => {
    expect(fadeGainAtPixel(undefined, 50)).toBe(1);
  });

  it('honors the offsetPx for chunked canvases', () => {
    const offset: FadeEnvelope = { ...env, offsetPx: 10 };
    // Chunk pixel 0 → effective full-clip pixel 10 → middle of fade-in (linear) = 0.5
    expect(fadeGainAtPixel(offset, 0)).toBeCloseTo(0.5, 5);
  });

  it('uses the fade-in bezier curve point when present (overrides preset)', () => {
    const bowed: FadeEnvelope = {
      ...env,
      fadeInCurve: 'linear',
      fadeInCurvePoint: { x: 0.5, y: 0.9 },
    };
    // Middle of fade-in (pixel 10 of 0..20) → bezier gives ~0.9, not 0.5
    expect(fadeGainAtPixel(bowed, 10)).toBeCloseTo(0.9, 2);
  });

  it('uses the fade-out bezier curve point when present', () => {
    const bowed: FadeEnvelope = {
      ...env,
      fadeOutCurve: 'linear',
      fadeOutCurvePoint: { x: 0.5, y: 0.2 },
    };
    // Middle of fade-out (pixel 85 of 70..100) → bezier gives ~0.2
    expect(fadeGainAtPixel(bowed, 85)).toBeCloseTo(0.2, 2);
  });
});
