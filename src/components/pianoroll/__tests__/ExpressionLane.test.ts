import { describe, it, expect, vi, beforeEach } from 'vitest';
import { drawExpressionLane, hasExpressionData, type ExpressionLaneType } from '../ExpressionLane';
import type { MidiNote } from '../../../types/project';

function createMockCtx(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    strokeRect: vi.fn(),
    setLineDash: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textBaseline: 'top' as CanvasTextBaseline,
    textAlign: 'left' as CanvasTextAlign,
  } as unknown as CanvasRenderingContext2D;
}

describe('drawExpressionLane', () => {
  let ctx: CanvasRenderingContext2D;

  beforeEach(() => {
    ctx = createMockCtx();
  });

  const baseProps = {
    width: 800,
    dividerY: 400,
    laneHeight: 80,
    selectedNoteIds: new Set<string>(),
    beatToX: (beat: number) => 60 + beat * 40,
    pixelsPerBeat: 40,
  };

  it('renders without errors for empty notes array', () => {
    drawExpressionLane({ ctx, ...baseProps, notes: [], expressionType: 'pitchBend' });
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('renders pitch bend label', () => {
    drawExpressionLane({ ctx, ...baseProps, notes: [], expressionType: 'pitchBend' });
    expect(ctx.fillText).toHaveBeenCalledWith('BEND', 4, expect.any(Number));
  });

  it('renders timbre label', () => {
    drawExpressionLane({ ctx, ...baseProps, notes: [], expressionType: 'timbre' });
    expect(ctx.fillText).toHaveBeenCalledWith('TIMBRE', 4, expect.any(Number));
  });

  it('renders pressure label', () => {
    drawExpressionLane({ ctx, ...baseProps, notes: [], expressionType: 'pressure' });
    expect(ctx.fillText).toHaveBeenCalledWith('PRESS', 4, expect.any(Number));
  });

  it('draws curves for notes with expression data', () => {
    const notes: MidiNote[] = [{
      id: 'n1',
      pitch: 60,
      startBeat: 0,
      durationBeats: 4,
      velocity: 100,
      mpeExpression: {
        pitchBendCurve: [
          { beat: 0, value: 0 },
          { beat: 1, value: 4096 },
          { beat: 2, value: -4096 },
        ],
      },
    }];
    drawExpressionLane({ ctx, ...baseProps, notes, expressionType: 'pitchBend' });
    // Should have called moveTo + lineTo for curve
    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.lineTo).toHaveBeenCalled();
    // And arc for dots
    expect(ctx.arc).toHaveBeenCalledTimes(3);
  });

  it('skips notes without expression data', () => {
    const notes: MidiNote[] = [{
      id: 'n1',
      pitch: 60,
      startBeat: 0,
      durationBeats: 4,
      velocity: 100,
    }];
    drawExpressionLane({ ctx, ...baseProps, notes, expressionType: 'pitchBend' });
    // Should not draw curves
    expect(ctx.arc).not.toHaveBeenCalled();
  });

  it('highlights selected notes', () => {
    const notes: MidiNote[] = [{
      id: 'n1',
      pitch: 60,
      startBeat: 0,
      durationBeats: 4,
      velocity: 100,
      mpeExpression: {
        timbreCurve: [{ beat: 0, value: 64 }, { beat: 1, value: 120 }],
      },
    }];
    drawExpressionLane({
      ctx,
      ...baseProps,
      notes,
      expressionType: 'timbre',
      selectedNoteIds: new Set(['n1']),
    });
    // Selected notes get white color and larger dots
    expect(ctx.arc).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 3, 0, Math.PI * 2);
  });
});

describe('hasExpressionData', () => {
  it('returns false for notes without expression', () => {
    const notes: MidiNote[] = [
      { id: 'n1', pitch: 60, startBeat: 0, durationBeats: 4, velocity: 100 },
    ];
    expect(hasExpressionData(notes)).toBe(false);
  });

  it('returns false for empty expression curves', () => {
    const notes: MidiNote[] = [{
      id: 'n1', pitch: 60, startBeat: 0, durationBeats: 4, velocity: 100,
      mpeExpression: { pitchBendCurve: [], timbreCurve: [], pressureCurve: [] },
    }];
    expect(hasExpressionData(notes)).toBe(false);
  });

  it('returns true when any curve has data', () => {
    const notes: MidiNote[] = [{
      id: 'n1', pitch: 60, startBeat: 0, durationBeats: 4, velocity: 100,
      mpeExpression: { pitchBendCurve: [{ beat: 0, value: 100 }] },
    }];
    expect(hasExpressionData(notes)).toBe(true);
  });
});
