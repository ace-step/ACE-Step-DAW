import {
  isBlackKey,
  MIDI_MAX_NOTE,
  midiNoteToName,
  PIANO_KEYBOARD_WIDTH,
} from './PianoRollConstants';

interface PianoRollKeyboardProps {
  ctx: CanvasRenderingContext2D;
  noteAreaHeight: number;
  keyHeight: number;
  prZoomY: number;
  pitchToY: (pitch: number) => number;
}

export function drawPianoRollKeyboard({
  ctx,
  noteAreaHeight,
  keyHeight,
  prZoomY,
  pitchToY,
}: PianoRollKeyboardProps) {
  ctx.fillStyle = '#0e0e26';
  ctx.fillRect(0, 0, PIANO_KEYBOARD_WIDTH, noteAreaHeight);

  for (let note = 0; note <= MIDI_MAX_NOTE; note++) {
    const y = pitchToY(note);
    if (y + keyHeight < 0 || y > noteAreaHeight) continue;

    const clippedY = Math.max(0, y);
    const clippedHeight = Math.min(keyHeight, noteAreaHeight - clippedY);
    if (clippedHeight <= 0) continue;

    const black = isBlackKey(note);
    ctx.fillStyle = black ? '#1a1a36' : '#2a2a4e';
    ctx.fillRect(0, clippedY, black ? PIANO_KEYBOARD_WIDTH - 8 : PIANO_KEYBOARD_WIDTH, clippedHeight);

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, clippedY + clippedHeight);
    ctx.lineTo(PIANO_KEYBOARD_WIDTH, clippedY + clippedHeight);
    ctx.stroke();

    if (note % 12 === 0 || prZoomY > 1.5) {
      ctx.fillStyle = note % 12 === 0 ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.25)';
      ctx.font = `${Math.min(10, keyHeight * 0.8)}px "Geist Mono", monospace`;
      ctx.textBaseline = 'middle';
      ctx.fillText(midiNoteToName(note), 4, clippedY + clippedHeight / 2);
    }
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PIANO_KEYBOARD_WIDTH, 0);
  ctx.lineTo(PIANO_KEYBOARD_WIDTH, noteAreaHeight);
  ctx.stroke();
}
