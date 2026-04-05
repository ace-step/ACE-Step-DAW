import type { MidiNote } from '../../types/project';
import type { GhostNote } from './PianoRollCanvas';
import { drawPianoRollKeyboard } from './PianoRollKeyboard';
import { drawVelocityLane } from './VelocityLane';
import {
  getPianoRollNoteVisualStyle,
  getPianoRollToolShortcut,
  gridSizeToBeats,
  isBlackKey,
  MIDI_MAX_NOTE,
  midiNoteToName,
  normalizeMidiVelocity,
  PIANO_KEYBOARD_WIDTH,
  type PianoRollTool,
} from './PianoRollConstants';
import type { PianoRollGrid } from '../../types/project';
import type { NoteDragState } from './usePianoRollDrag';

export interface PianoRollDrawParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  velocityHeight: number;
  keyHeight: number;
  prZoomY: number;
  pixelsPerBeat: number;
  gridSize: PianoRollGrid;
  prScrollX: number;
  activeTool: PianoRollTool;
  notes: MidiNote[];
  selectedNoteIds: Set<string>;
  ghostNotes: GhostNote[];
  beatToX: (beat: number) => number;
  pitchToY: (pitch: number) => number;
  bpm: number;
  clipStartTime: number;
  clipDuration: number;
  currentBeat: number;
  drag: NoteDragState | null;
  quantizePreviewPositions: Record<string, { startBeat: number; durationBeats: number }> | null;
  /** IDs of notes that are locked for AI generation (rendered with lock indicator) */
  lockedNoteIds?: Set<string>;
  /** AI generation selection region in beats */
  aiSelectionStartBeat?: number | null;
  aiSelectionEndBeat?: number | null;
  /** Preview notes from AI generation (rendered semi-transparently) */
  aiPreviewNotes?: MidiNote[];
}

/** Draw horizontal key rows (background shading + gridlines). */
function drawKeyRows(
  ctx: CanvasRenderingContext2D,
  width: number,
  noteAreaHeight: number,
  keyHeight: number,
  pitchToY: (pitch: number) => number,
) {
  for (let note = 0; note <= MIDI_MAX_NOTE; note++) {
    const y = pitchToY(note);
    if (y + keyHeight < 0 || y > noteAreaHeight) continue;

    if (isBlackKey(note)) {
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      ctx.fillRect(PIANO_KEYBOARD_WIDTH, y, width - PIANO_KEYBOARD_WIDTH, keyHeight);
    }

    ctx.strokeStyle = note % 12 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)';
    ctx.lineWidth = note % 12 === 0 ? 1 : 0.5;
    ctx.beginPath();
    ctx.moveTo(PIANO_KEYBOARD_WIDTH, y + keyHeight);
    ctx.lineTo(width, y + keyHeight);
    ctx.stroke();
  }
}

/** Draw vertical beat/bar gridlines and bar numbers. */
function drawBeatGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  noteAreaHeight: number,
  pixelsPerBeat: number,
  gridBeats: number,
  prScrollX: number,
) {
  const beatsPerBar = 4;
  const startBeat = Math.floor(prScrollX / pixelsPerBeat);
  const endBeat = Math.ceil((prScrollX + width) / pixelsPerBeat);

  for (let beat = startBeat; beat <= endBeat; beat += gridBeats) {
    const x = PIANO_KEYBOARD_WIDTH + beat * pixelsPerBeat - prScrollX;
    if (x < PIANO_KEYBOARD_WIDTH || x > width) continue;

    const isBar = Math.abs(beat % beatsPerBar) < 0.001;
    const isBeat = Math.abs(beat % 1) < 0.001;

    ctx.strokeStyle = isBar
      ? 'rgba(255,255,255,0.12)'
      : isBeat
        ? 'rgba(255,255,255,0.06)'
        : 'rgba(255,255,255,0.025)';
    ctx.lineWidth = isBar ? 1 : 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, noteAreaHeight);
    ctx.stroke();

    if (isBar) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '9px "Geist Mono", monospace';
      ctx.textBaseline = 'top';
      ctx.fillText(`${Math.floor(beat / beatsPerBar) + 1}`, x + 3, 3);
    }
  }
}

/** Draw ghost notes from other tracks (semi-transparent, behind main notes). */
function drawGhostNotes(
  ctx: CanvasRenderingContext2D,
  width: number,
  noteAreaHeight: number,
  ghostNotes: GhostNote[],
  beatToX: (beat: number) => number,
  pitchToY: (pitch: number) => number,
  pixelsPerBeat: number,
  keyHeight: number,
) {
  if (ghostNotes.length === 0) return;

  ctx.globalAlpha = 0.15;
  for (const gn of ghostNotes) {
    const gnX = beatToX(gn.startBeat);
    const gnY = pitchToY(gn.pitch);
    const gnW = gn.durationBeats * pixelsPerBeat;
    const gnH = keyHeight - 1;
    if (gnX + gnW < PIANO_KEYBOARD_WIDTH || gnX > width) continue;
    if (gnY + gnH < 0 || gnY > noteAreaHeight) continue;
    ctx.fillStyle = gn.color;
    ctx.fillRect(gnX, gnY, Math.max(gnW - 1, 2), gnH);
  }
  ctx.globalAlpha = 1.0;
}

/** Draw a single MIDI note on the canvas. */
function drawNote(
  ctx: CanvasRenderingContext2D,
  note: MidiNote,
  drawStartBeat: number,
  drawDuration: number,
  hasPreview: boolean,
  isSelected: boolean,
  beatToX: (beat: number) => number,
  pitchToY: (pitch: number) => number,
  pixelsPerBeat: number,
  keyHeight: number,
  width: number,
  noteAreaHeight: number,
) {
  const noteX = beatToX(drawStartBeat);
  const noteY = pitchToY(note.pitch);
  const noteWidth = drawDuration * pixelsPerBeat;
  const noteHeight = keyHeight - 1;
  if (noteX + noteWidth < PIANO_KEYBOARD_WIDTH || noteX > width) return;
  if (noteY + noteHeight < 0 || noteY > noteAreaHeight) return;

  const isSlide = note.isSlide === true;
  const normalizedVelocity = normalizeMidiVelocity(note.velocity);
  const velocityRatio = normalizedVelocity / 127;
  const noteVisualStyle = getPianoRollNoteVisualStyle(note.velocity, { isSelected, isSlide });

  // Draw ghost of original position when quantize preview is active
  if (hasPreview) {
    const origX = beatToX(note.startBeat);
    const origW = note.durationBeats * pixelsPerBeat;
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.roundRect(origX, noteY, Math.max(origW, 3), noteHeight, 2);
    ctx.fill();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(origX, noteY, Math.max(origW, 3), noteHeight, 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1.0;
  }

  // Note body
  ctx.fillStyle = noteVisualStyle.fillStyle;
  ctx.globalAlpha = noteVisualStyle.globalAlpha;
  ctx.beginPath();
  ctx.roundRect(noteX, noteY, Math.max(noteWidth, 3), noteHeight, 2);
  ctx.fill();

  // Note border
  ctx.strokeStyle = noteVisualStyle.strokeStyle;
  ctx.lineWidth = noteVisualStyle.strokeWidth;
  ctx.beginPath();
  ctx.roundRect(noteX, noteY, Math.max(noteWidth, 3), noteHeight, 2);
  ctx.stroke();
  ctx.globalAlpha = 1.0;

  // Slide indicator
  if (isSlide && noteWidth > 10) {
    ctx.strokeStyle = 'rgba(24,24,27,0.75)';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(noteX + 3, noteY + noteHeight - 3);
    ctx.lineTo(noteX + noteWidth - 6, noteY + 3);
    ctx.lineTo(noteX + noteWidth - 3, noteY + 6);
    ctx.stroke();
  }

  // Note name label
  if (noteWidth > 30 && noteHeight > 8) {
    ctx.fillStyle = isSlide ? 'rgba(24,24,27,0.85)' : 'rgba(0,0,0,0.6)';
    ctx.font = `${Math.min(9, noteHeight * 0.7)}px "Geist Mono", monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillText(isSlide ? `${midiNoteToName(note.pitch)} SL` : midiNoteToName(note.pitch), noteX + 3, noteY + noteHeight / 2);
  }

  // Velocity accent bar
  if (!isSlide && noteWidth > 8 && noteHeight > 6) {
    ctx.fillStyle = `rgba(255,255,255,${noteVisualStyle.velocityAccentOpacity})`;
    ctx.fillRect(noteX + 2, noteY + noteHeight - 3, Math.max((noteWidth - 4) * velocityRatio, 2), 1.5);
  }

  // Selected note resize handles
  if (isSelected && noteWidth > 10) {
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(noteX + 1, noteY + 2, 3, noteHeight - 4);
    ctx.fillRect(noteX + noteWidth - 4, noteY + 2, 3, noteHeight - 4);
  }
}

/** Draw the box-selection rectangle. */
function drawBoxSelection(
  ctx: CanvasRenderingContext2D,
  drag: NoteDragState,
) {
  if (!drag.isBoxSelect || drag.boxStartX === undefined || drag.boxStartY === undefined) return;

  const boxX = Math.min(drag.boxStartX, drag.startMouseX);
  const boxY = Math.min(drag.boxStartY, drag.startMouseY);
  const boxWidth = Math.abs(drag.startMouseX - drag.boxStartX);
  const boxHeight = Math.abs(drag.startMouseY - drag.boxStartY);
  ctx.fillStyle = 'rgba(139, 92, 246, 0.15)';
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
  ctx.strokeStyle = 'rgba(139, 92, 246, 0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
}

/** Draw the playback cursor / playhead line. */
function drawPlayhead(
  ctx: CanvasRenderingContext2D,
  currentBeat: number,
  clipDurationBeats: number,
  beatToX: (beat: number) => number,
  noteAreaHeight: number,
  width: number,
) {
  if (currentBeat >= 0 && currentBeat <= clipDurationBeats) {
    const cursorX = beatToX(currentBeat);
    if (cursorX >= PIANO_KEYBOARD_WIDTH && cursorX <= width) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cursorX, 0);
      ctx.lineTo(cursorX, noteAreaHeight);
      ctx.stroke();
    }
  }
}

/** Draw the active tool badge in the top-right corner. */
function drawToolBadge(
  ctx: CanvasRenderingContext2D,
  activeTool: PianoRollTool,
  width: number,
) {
  if (activeTool === 'select') return;

  ctx.fillStyle = 'rgba(139, 92, 246, 0.3)';
  ctx.fillRect(width - 86, 4, 82, 16);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '9px "Geist", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${activeTool.toUpperCase()} ${getPianoRollToolShortcut(activeTool)}`, width - 80, 12);
}

/** Draw a highlight region for AI infill selection. */
function drawAiSelectionRegion(
  ctx: CanvasRenderingContext2D,
  startBeat: number,
  endBeat: number,
  beatToX: (beat: number) => number,
  noteAreaHeight: number,
  width: number,
) {
  const x1 = Math.max(beatToX(startBeat), PIANO_KEYBOARD_WIDTH);
  const x2 = Math.min(beatToX(endBeat), width);
  if (x2 <= x1) return;

  // Fill region with violet tint
  ctx.fillStyle = 'rgba(139, 92, 246, 0.08)';
  ctx.fillRect(x1, 0, x2 - x1, noteAreaHeight);

  // Left and right boundary lines
  ctx.strokeStyle = 'rgba(139, 92, 246, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(x1, 0);
  ctx.lineTo(x1, noteAreaHeight);
  ctx.moveTo(x2, 0);
  ctx.lineTo(x2, noteAreaHeight);
  ctx.stroke();
  ctx.setLineDash([]);

  // Label
  ctx.fillStyle = 'rgba(139, 92, 246, 0.7)';
  ctx.font = '9px "Geist", sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText('AI Region', x1 + 4, 4);
}

/** Draw a lock indicator on a locked note. */
function drawLockedIndicator(
  ctx: CanvasRenderingContext2D,
  noteX: number,
  noteY: number,
  noteHeight: number,
) {
  // Small amber lock icon in top-right corner
  const iconSize = Math.min(8, noteHeight * 0.6);
  const ix = noteX + 2;
  const iy = noteY + 1;

  ctx.fillStyle = 'rgba(245, 158, 11, 0.8)';
  // Lock body
  ctx.fillRect(ix, iy + iconSize * 0.4, iconSize, iconSize * 0.6);
  // Lock shackle
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.8)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(ix + iconSize / 2, iy + iconSize * 0.4, iconSize * 0.3, Math.PI, 0);
  ctx.stroke();
}

/** Draw AI preview notes (generated, not yet accepted). */
function drawPreviewNotes(
  ctx: CanvasRenderingContext2D,
  previewNotes: MidiNote[],
  beatToX: (beat: number) => number,
  pitchToY: (pitch: number) => number,
  pixelsPerBeat: number,
  keyHeight: number,
  width: number,
  noteAreaHeight: number,
) {
  for (const note of previewNotes) {
    const noteX = beatToX(note.startBeat);
    const noteY = pitchToY(note.pitch);
    const noteWidth = note.durationBeats * pixelsPerBeat;
    const noteHeight = keyHeight - 1;
    if (noteX + noteWidth < PIANO_KEYBOARD_WIDTH || noteX > width) continue;
    if (noteY + noteHeight < 0 || noteY > noteAreaHeight) continue;

    // Semi-transparent green fill for preview notes
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = 'rgba(34, 197, 94, 0.5)';
    ctx.beginPath();
    ctx.roundRect(noteX, noteY, Math.max(noteWidth, 3), noteHeight, 2);
    ctx.fill();

    // Dashed border
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.8)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.roundRect(noteX, noteY, Math.max(noteWidth, 3), noteHeight, 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1.0;

    // Note name
    if (noteWidth > 30 && noteHeight > 8) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.font = `${Math.min(9, noteHeight * 0.7)}px "Geist Mono", monospace`;
      ctx.textBaseline = 'middle';
      ctx.fillText(midiNoteToName(note.pitch), noteX + 3, noteY + noteHeight / 2);
    }
  }
}

/**
 * Main drawing function for the piano roll canvas.
 * Orchestrates all sub-drawing routines in correct order.
 */
export function drawPianoRoll(params: PianoRollDrawParams): void {
  const {
    ctx,
    width,
    height,
    velocityHeight,
    keyHeight,
    prZoomY,
    pixelsPerBeat,
    gridSize,
    prScrollX,
    activeTool,
    notes,
    selectedNoteIds,
    ghostNotes,
    beatToX,
    pitchToY,
    bpm,
    clipStartTime,
    clipDuration,
    currentBeat,
    drag,
    quantizePreviewPositions,
    lockedNoteIds,
    aiSelectionStartBeat,
    aiSelectionEndBeat,
    aiPreviewNotes,
  } = params;

  const noteAreaHeight = height - velocityHeight;
  const gridBeats = gridSizeToBeats(gridSize);

  // Background
  ctx.fillStyle = '#1a1a1e';
  ctx.fillRect(0, 0, width, height);

  // Keyboard
  drawPianoRollKeyboard({
    ctx,
    noteAreaHeight,
    keyHeight,
    prZoomY,
    pitchToY,
  });

  // Clip to note area (excludes keyboard and velocity lane)
  ctx.save();
  ctx.beginPath();
  ctx.rect(PIANO_KEYBOARD_WIDTH, 0, width - PIANO_KEYBOARD_WIDTH, noteAreaHeight);
  ctx.clip();

  // Key rows (horizontal lines + shading)
  drawKeyRows(ctx, width, noteAreaHeight, keyHeight, pitchToY);

  // Beat grid (vertical lines + bar numbers)
  drawBeatGrid(ctx, width, noteAreaHeight, pixelsPerBeat, gridBeats, prScrollX);

  // AI selection region overlay (drawn behind notes)
  if (aiSelectionStartBeat != null && aiSelectionEndBeat != null) {
    drawAiSelectionRegion(ctx, aiSelectionStartBeat, aiSelectionEndBeat, beatToX, noteAreaHeight, width);
  }

  // Ghost notes from other tracks
  drawGhostNotes(ctx, width, noteAreaHeight, ghostNotes, beatToX, pitchToY, pixelsPerBeat, keyHeight);

  // Main notes
  for (const note of notes) {
    const preview = quantizePreviewPositions?.[note.id];
    const drawStartBeat = preview ? preview.startBeat : note.startBeat;
    const drawDuration = preview ? preview.durationBeats : note.durationBeats;
    const hasPreview = !!preview;
    const isSelected = selectedNoteIds.has(note.id);
    drawNote(ctx, note, drawStartBeat, drawDuration, hasPreview, isSelected, beatToX, pitchToY, pixelsPerBeat, keyHeight, width, noteAreaHeight);

    // Lock indicator for AI-locked notes
    if (lockedNoteIds?.has(note.id)) {
      const noteX = beatToX(drawStartBeat);
      const noteY = pitchToY(note.pitch);
      const noteHeight = keyHeight - 1;
      drawLockedIndicator(ctx, noteX, noteY, noteHeight);
    }
  }

  // AI preview notes (generated, semi-transparent)
  if (aiPreviewNotes && aiPreviewNotes.length > 0) {
    drawPreviewNotes(ctx, aiPreviewNotes, beatToX, pitchToY, pixelsPerBeat, keyHeight, width, noteAreaHeight);
  }

  // Box selection overlay
  if (drag) {
    drawBoxSelection(ctx, drag);
  }

  // Playhead
  const clipStartBeat = clipStartTime * (bpm / 60);
  const clipDurationBeats = clipDuration * (bpm / 60);
  const playBeat = currentBeat * (bpm / 60) - clipStartBeat;
  drawPlayhead(ctx, playBeat, clipDurationBeats, beatToX, noteAreaHeight, width);

  ctx.restore();

  // Divider between note area and velocity lane
  const dividerY = noteAreaHeight;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, dividerY, width, 3);

  // Velocity lane
  drawVelocityLane({
    ctx,
    width,
    dividerY,
    velocityHeight,
    notes,
    selectedNoteIds,
    beatToX,
    pixelsPerBeat,
  });

  // Tool badge
  drawToolBadge(ctx, activeTool, width);
}
