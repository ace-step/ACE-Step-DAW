import type { PianoRollGrid } from '../../types/project';

export type PianoRollTool = 'select' | 'pencil' | 'paint' | 'erase' | 'slide';

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

export function normalizeMidiVelocity(velocity: number): number {
  if (!Number.isFinite(velocity)) return 1;
  const midiVelocity = Math.abs(velocity) <= 1 ? velocity * 127 : velocity;
  return Math.round(Math.max(1, Math.min(127, midiVelocity)));
}

export function velocityToColor(velocity: number): string {
  const t = (normalizeMidiVelocity(velocity) - 1) / 126;
  const r = Math.round(76 + t * 160);
  const g = Math.round(118 + t * 52);
  const b = Math.round(210 - t * 92);
  return `rgb(${r},${g},${b})`;
}

export function velocityToBarColor(velocity: number): string {
  const t = (normalizeMidiVelocity(velocity) - 1) / 126;
  const r = Math.round(88 + t * 167);
  const g = Math.round(122 + t * 42);
  const b = Math.round(214 - t * 124);
  return `rgba(${r},${g},${b},0.8)`;
}

export function getPianoRollToolShortcut(tool: PianoRollTool): string {
  switch (tool) {
    case 'select':
      return '1';
    case 'pencil':
      return '2';
    case 'paint':
      return '3';
    case 'erase':
      return '4';
    case 'slide':
      return '5';
  }
}

export function generateNoteId(): string {
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
