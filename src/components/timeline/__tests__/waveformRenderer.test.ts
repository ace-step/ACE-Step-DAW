import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getVisiblePeakSlice,
  getMinMaxForColumn,
  drawWaveform,
  drawMidiThumbnail,
} from '../waveformRenderer';
import { PEAK_STRIDE } from '../../../utils/waveformPeaks';

// ─── Pure utility tests ──────────────────────────────────────────────────────

describe('getVisiblePeakSlice', () => {
  it('returns zero slice for zero peaks', () => {
    expect(getVisiblePeakSlice(0, 4, 0, 4)).toEqual({ startPeakIdx: 0, numBars: 0 });
  });

  it('returns zero slice for zero audio duration', () => {
    expect(getVisiblePeakSlice(100, 0, 0, 4)).toEqual({ startPeakIdx: 0, numBars: 0 });
  });

  it('returns full range with no offset', () => {
    const result = getVisiblePeakSlice(100, 4, 0, 4);
    expect(result.startPeakIdx).toBe(0);
    expect(result.numBars).toBe(100);
  });

  it('returns partial range with offset', () => {
    // Offset 2s into a 4s clip, viewing 2s of audio
    const result = getVisiblePeakSlice(100, 4, 2, 2);
    expect(result.startPeakIdx).toBe(50);
    expect(result.numBars).toBe(50);
  });

  it('clamps end to peak count', () => {
    const result = getVisiblePeakSlice(100, 4, 0, 10);
    expect(result.numBars).toBe(100);
  });
});

describe('getMinMaxForColumn', () => {
  // Build peaks: 4 logical peaks, each with [Lmax, Lmin, Rmax, Rmin]
  const peaks = [
    0.8, -0.7, 0.6, -0.5,  // peak 0
    0.5, -0.4, 0.3, -0.2,  // peak 1
    0.9, -0.8, 0.7, -0.6,  // peak 2
    0.3, -0.2, 0.1, -0.1,  // peak 3
  ];

  const fullSlice = { startPeakIdx: 0, numBars: 4 };

  it('returns correct min/max for left channel (offset 0)', () => {
    // Column 0 of 4 columns should map to peak 0
    const result = getMinMaxForColumn(peaks, fullSlice, 0, 4, 0);
    expect(result.max).toBe(0.8);
    expect(result.min).toBe(-0.7);
  });

  it('returns correct min/max for right channel (offset 2)', () => {
    const result = getMinMaxForColumn(peaks, fullSlice, 0, 4, 2);
    expect(result.max).toBe(0.6);
    expect(result.min).toBe(-0.5);
  });

  it('aggregates min/max across multiple peaks when columns < peaks', () => {
    // 2 columns for 4 peaks: each column spans 2 peaks
    const result = getMinMaxForColumn(peaks, fullSlice, 0, 2, 0);
    expect(result.max).toBe(0.8); // max of peak 0 (0.8) and peak 1 (0.5)
    expect(result.min).toBe(-0.7); // min of peak 0 (-0.7) and peak 1 (-0.4)
  });

  it('handles column 1 of 2 correctly', () => {
    const result = getMinMaxForColumn(peaks, fullSlice, 1, 2, 0);
    expect(result.max).toBe(0.9); // max of peak 2 (0.9) and peak 3 (0.3)
    expect(result.min).toBe(-0.8); // min of peak 2 (-0.8) and peak 3 (-0.2)
  });

  it('returns zeros for empty slice', () => {
    const emptySlice = { startPeakIdx: 0, numBars: 0 };
    const result = getMinMaxForColumn(peaks, emptySlice, 0, 1, 0);
    expect(result.max).toBe(0);
    expect(result.min).toBe(0);
  });
});

// ─── Canvas drawing tests (with mock context) ───────────────────────────────

function createMockCanvasCtx() {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  const ctx = {
    beginPath: vi.fn(() => calls.push({ method: 'beginPath', args: [] })),
    moveTo: vi.fn((...args: number[]) => calls.push({ method: 'moveTo', args })),
    lineTo: vi.fn((...args: number[]) => calls.push({ method: 'lineTo', args })),
    closePath: vi.fn(() => calls.push({ method: 'closePath', args: [] })),
    fill: vi.fn(() => calls.push({ method: 'fill', args: [] })),
    stroke: vi.fn(() => calls.push({ method: 'stroke', args: [] })),
    roundRect: vi.fn((...args: number[]) => calls.push({ method: 'roundRect', args })),
    fillRect: vi.fn((...args: number[]) => calls.push({ method: 'fillRect', args })),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    _calls: calls,
  } as unknown as CanvasRenderingContext2D & { _calls: typeof calls };

  return ctx;
}

function makeStereoSinePeaks(count: number): number[] {
  const peaks: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const val = Math.sin(t * Math.PI * 2);
    peaks.push(
      Math.max(0, val),   // Lmax
      Math.min(0, val),   // Lmin
      Math.max(0, val * 0.8), // Rmax
      Math.min(0, val * 0.8), // Rmin
    );
  }
  return peaks;
}

describe('drawWaveform', () => {
  let ctx: ReturnType<typeof createMockCanvasCtx>;

  beforeEach(() => {
    ctx = createMockCanvasCtx();
  });

  it('draws nothing for empty peaks', () => {
    drawWaveform({
      ctx, width: 200, height: 100,
      peaks: [], audioDuration: 4, audioOffset: 0, clipDuration: 4,
      color: '#4c76d2',
    });
    expect(ctx.fill).not.toHaveBeenCalled();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it('draws nothing for zero width', () => {
    drawWaveform({
      ctx, width: 0, height: 100,
      peaks: makeStereoSinePeaks(100), audioDuration: 4, audioOffset: 0, clipDuration: 4,
      color: '#4c76d2',
    });
    expect(ctx.fill).not.toHaveBeenCalled();
  });

  it('draws waveform for valid input', () => {
    drawWaveform({
      ctx, width: 200, height: 100,
      peaks: makeStereoSinePeaks(100), audioDuration: 4, audioOffset: 0, clipDuration: 4,
      color: '#4c76d2',
    });
    // Should draw: center divider (1 stroke) + 2 channel fills + 2 peak lines (2 strokes)
    expect(ctx.stroke).toHaveBeenCalledTimes(3); // center + 2 peak lines
    expect(ctx.fill).toHaveBeenCalledTimes(2); // 2 channel fills
  });

  it('applies track volume scaling', () => {
    // With volume = 0 the waveform should still draw but with zero amplitude
    drawWaveform({
      ctx, width: 200, height: 100,
      peaks: makeStereoSinePeaks(100), audioDuration: 4, audioOffset: 0, clipDuration: 4,
      color: '#4c76d2', trackVolume: 0,
    });
    expect(ctx.fill).toHaveBeenCalledTimes(2);
  });

  it('handles content offset', () => {
    drawWaveform({
      ctx, width: 200, height: 100,
      peaks: makeStereoSinePeaks(100), audioDuration: 4, audioOffset: 0, clipDuration: 4,
      contentOffset: 1, color: '#4c76d2',
    });
    expect(ctx.fill).toHaveBeenCalled();
  });

  it('handles repitch stretch mode', () => {
    drawWaveform({
      ctx, width: 200, height: 100,
      peaks: makeStereoSinePeaks(100), audioDuration: 4, audioOffset: 0, clipDuration: 4,
      timeStretchRate: 1.5, stretchMode: 'repitch', color: '#4c76d2',
    });
    expect(ctx.fill).toHaveBeenCalled();
  });
});

describe('drawMidiThumbnail', () => {
  let ctx: ReturnType<typeof createMockCanvasCtx>;

  beforeEach(() => {
    ctx = createMockCanvasCtx();
  });

  it('draws nothing for empty notes', () => {
    drawMidiThumbnail({
      ctx, width: 200, height: 80, notes: [],
      duration: 4, bpm: 120, color: '#4c76d2',
    });
    expect(ctx.fill).not.toHaveBeenCalled();
  });

  it('draws rectangles for MIDI notes', () => {
    const notes = [
      { pitch: 60, startBeat: 0, durationBeats: 1 },
      { pitch: 64, startBeat: 1, durationBeats: 1 },
      { pitch: 67, startBeat: 2, durationBeats: 2 },
    ];
    drawMidiThumbnail({
      ctx, width: 200, height: 80, notes,
      duration: 4, bpm: 120, color: '#4c76d2',
    });
    // Each note draws a roundRect + fill
    expect(ctx.roundRect).toHaveBeenCalledTimes(3);
    expect(ctx.fill).toHaveBeenCalledTimes(3);
  });

  it('filters notes at narrow widths', () => {
    // 100 notes, width=30 -> maxNotes = max(20, 15) = 20
    const notes = Array.from({ length: 100 }, (_, i) => ({
      pitch: 60 + (i % 12), startBeat: i * 0.25, durationBeats: 0.25,
    }));
    drawMidiThumbnail({
      ctx, width: 30, height: 80, notes,
      duration: 25, bpm: 120, color: '#4c76d2',
    });
    // Should draw fewer than 100 notes (filtered to ~20)
    expect(ctx.roundRect).toHaveBeenCalled();
    const callCount = (ctx.roundRect as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(callCount).toBeLessThan(100);
    expect(callCount).toBeGreaterThan(0);
  });

  it('draws nothing for zero duration', () => {
    drawMidiThumbnail({
      ctx, width: 200, height: 80,
      notes: [{ pitch: 60, startBeat: 0, durationBeats: 1 }],
      duration: 0, bpm: 120, color: '#4c76d2',
    });
    expect(ctx.fill).not.toHaveBeenCalled();
  });
});
