/**
 * ExpressionLane — canvas drawing for MPE expression data in the piano roll.
 *
 * Renders per-note expression curves (pitch bend, timbre/CC74, pressure)
 * below the velocity lane. Follows the same pattern as VelocityLane.
 *
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/960
 */

import type { MidiNote, ExpressionPoint } from '../../types/project';
import { PIANO_KEYBOARD_WIDTH } from './PianoRollConstants';

export type ExpressionLaneType = 'pitchBend' | 'timbre' | 'pressure';

interface ExpressionLaneProps {
  ctx: CanvasRenderingContext2D;
  width: number;
  dividerY: number;
  laneHeight: number;
  notes: MidiNote[];
  selectedNoteIds: Set<string>;
  beatToX: (beat: number) => number;
  pixelsPerBeat: number;
  expressionType: ExpressionLaneType;
}

const LANE_CONFIG: Record<ExpressionLaneType, {
  label: string;
  color: string;
  curveColor: string;
  minValue: number;
  maxValue: number;
  centerValue: number;
  getCurve: (note: MidiNote) => ExpressionPoint[] | undefined;
}> = {
  pitchBend: {
    label: 'BEND',
    color: 'rgba(99,102,241,0.7)',   // indigo
    curveColor: 'rgba(129,140,248,0.9)',
    minValue: -8192,
    maxValue: 8191,
    centerValue: 0,
    getCurve: (note) => note.mpeExpression?.pitchBendCurve,
  },
  timbre: {
    label: 'TIMBRE',
    color: 'rgba(234,179,8,0.7)',    // yellow
    curveColor: 'rgba(250,204,21,0.9)',
    minValue: 0,
    maxValue: 127,
    centerValue: 64,
    getCurve: (note) => note.mpeExpression?.timbreCurve,
  },
  pressure: {
    label: 'PRESS',
    color: 'rgba(239,68,68,0.7)',    // red
    curveColor: 'rgba(248,113,113,0.9)',
    minValue: 0,
    maxValue: 127,
    centerValue: 0,
    getCurve: (note) => note.mpeExpression?.pressureCurve,
  },
};

/**
 * Normalize a value to 0–1 range within the expression type's range.
 */
function normalizeValue(value: number, min: number, max: number): number {
  return (value - min) / (max - min);
}

export function drawExpressionLane({
  ctx,
  width,
  dividerY,
  laneHeight,
  notes,
  selectedNoteIds,
  beatToX,
  pixelsPerBeat,
  expressionType,
}: ExpressionLaneProps) {
  const config = LANE_CONFIG[expressionType];
  const laneTop = dividerY + 3;
  const laneAreaHeight = laneHeight - 6;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, laneTop, width, laneAreaHeight);
  ctx.clip();

  // Background
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, laneTop, width, laneAreaHeight);

  // Label
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.font = '9px "Geist Mono", monospace';
  ctx.textBaseline = 'top';
  ctx.fillText(config.label, 4, laneTop + 4);

  // Center line (for bipolar values like pitch bend)
  const centerNorm = normalizeValue(config.centerValue, config.minValue, config.maxValue);
  const centerY = laneTop + laneAreaHeight * (1 - centerNorm);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(PIANO_KEYBOARD_WIDTH, centerY);
  ctx.lineTo(width, centerY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw expression curves for each note
  for (const note of notes) {
    const curve = config.getCurve(note);
    if (!curve || curve.length === 0) continue;

    const noteX = beatToX(note.startBeat);
    const noteWidth = Math.max(note.durationBeats * pixelsPerBeat, 4);
    if (noteX + noteWidth < PIANO_KEYBOARD_WIDTH || noteX > width) continue;

    const isSelected = selectedNoteIds.has(note.id);

    // Draw curve as connected line segments
    ctx.beginPath();
    ctx.strokeStyle = isSelected ? '#fff' : config.curveColor;
    ctx.lineWidth = isSelected ? 2 : 1.5;
    ctx.globalAlpha = isSelected ? 1.0 : 0.8;

    let started = false;
    for (const point of curve) {
      const px = beatToX(note.startBeat + point.beat);
      const norm = normalizeValue(point.value, config.minValue, config.maxValue);
      const py = laneTop + laneAreaHeight * (1 - norm);

      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();

    // Draw dots at each expression point
    ctx.fillStyle = isSelected ? '#fff' : config.color;
    for (const point of curve) {
      const px = beatToX(note.startBeat + point.beat);
      const norm = normalizeValue(point.value, config.minValue, config.maxValue);
      const py = laneTop + laneAreaHeight * (1 - norm);

      ctx.beginPath();
      ctx.arc(px, py, isSelected ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1.0;
  }

  ctx.restore();
}

/**
 * Check if any notes in the array have MPE expression data.
 */
export function hasExpressionData(notes: MidiNote[]): boolean {
  return notes.some((n) => n.mpeExpression &&
    ((n.mpeExpression.pitchBendCurve?.length ?? 0) > 0 ||
     (n.mpeExpression.timbreCurve?.length ?? 0) > 0 ||
     (n.mpeExpression.pressureCurve?.length ?? 0) > 0));
}
