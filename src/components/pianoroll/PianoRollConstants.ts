import type { PianoRollGrid } from '../../types/project';

export const MIDI_MAX_NOTE = 127;
export const PIANO_ROLL_KEY_HEIGHT = 14;
export const PIANO_KEYBOARD_WIDTH = 56;
export const VELOCITY_LANE_HEIGHT = 60;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK_KEY_INDICES = new Set([1, 3, 6, 8, 10]);

export function isBlackKey(note: number): boolean {
  return BLACK_KEY_INDICES.has(note % 12);
}

export function midiNoteToName(note: number): string {
  return `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`;
}

export function gridSizeToBeats(size: PianoRollGrid): number {
  switch (size) {
    case '1/4':
      return 1;
    case '1/8':
      return 0.5;
    case '1/16':
      return 0.25;
    case '1/32':
      return 0.125;
  }
}

export function velocityToColor(velocity: number): string {
  const t = velocity / 127;
  const r = Math.round(80 + t * 150);
  const g = Math.round(130 - t * 60);
  const b = Math.round(255 - t * 80);
  return `rgb(${r},${g},${b})`;
}

export function velocityToBarColor(velocity: number): string {
  const t = velocity / 127;
  const r = Math.round(100 + t * 155);
  const g = Math.round(80 + t * 40);
  const b = Math.round(200 - t * 100);
  return `rgba(${r},${g},${b},0.8)`;
}

export function generateNoteId(): string {
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
