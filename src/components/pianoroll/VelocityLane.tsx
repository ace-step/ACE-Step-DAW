import type { MidiNote } from '../../types/project';
import { PIANO_KEYBOARD_WIDTH, velocityToBarColor } from './PianoRollConstants';

interface VelocityLaneProps {
  ctx: CanvasRenderingContext2D;
  width: number;
  dividerY: number;
  velocityHeight: number;
  notes: MidiNote[];
  selectedNoteIds: Set<string>;
  beatToX: (beat: number) => number;
  pixelsPerBeat: number;
}

export function drawVelocityLane({
  ctx,
  width,
  dividerY,
  velocityHeight,
  notes,
  selectedNoteIds,
  beatToX,
  pixelsPerBeat,
}: VelocityLaneProps) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, dividerY + 3, width, velocityHeight - 3);
  ctx.clip();

  ctx.fillStyle = '#08081a';
  ctx.fillRect(0, dividerY + 3, width, velocityHeight - 3);

  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.font = '9px "Geist Mono", monospace';
  ctx.textBaseline = 'top';
  ctx.fillText('VEL', 4, dividerY + 8);

  const velAreaTop = dividerY + 3;
  const velAreaHeight = velocityHeight - 6;

  for (const note of notes) {
    const x = beatToX(note.startBeat);
    const widthPx = Math.max(note.durationBeats * pixelsPerBeat, 4);
    if (x + widthPx < PIANO_KEYBOARD_WIDTH || x > width) continue;

    const barHeight = (note.velocity / 127) * velAreaHeight;
    const barY = velAreaTop + velAreaHeight - barHeight;
    const isSelected = selectedNoteIds.has(note.id);
    const isSlide = note.isSlide === true;

    ctx.fillStyle = isSlide ? 'rgba(251,191,36,0.85)' : velocityToBarColor(note.velocity);
    ctx.globalAlpha = isSelected ? 1.0 : 0.6;
    ctx.fillRect(x, barY, Math.max(widthPx - 1, 3), barHeight);

    if (isSlide) {
      ctx.strokeStyle = 'rgba(24,24,27,0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 1, barY + barHeight - 2);
      ctx.lineTo(x + Math.max(widthPx - 2, 3), barY + 2);
      ctx.stroke();
    }

    if (isSelected) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, barY, Math.max(widthPx - 1, 3), barHeight);
    }

    ctx.globalAlpha = 1.0;
  }

  ctx.restore();
}
