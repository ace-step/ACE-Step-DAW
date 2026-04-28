import type { PianoRollGrid } from '../../types/project';

export type PianoRollTool =
  | 'select'
  | 'pencil'
  | 'paint'
  | 'erase'
  | 'slide'
  | 'velocityPaint';

export const MIDI_MAX_NOTE = 127;
export const PIANO_ROLL_KEY_HEIGHT = 14;
export const PIANO_KEYBOARD_WIDTH = 56;
export const VELOCITY_LANE_HEIGHT = 60;

/** PianoRollGrid → quarter-note beats mapping. Derived from gridSizeToBeats to avoid drift. */
const SUPPORTED_GRIDS: PianoRollGrid[] = ['1/4', '1/8', '1/16', '1/32'];
export const GRID_BEATS_MAP: Record<PianoRollGrid, number> = Object.fromEntries(
  SUPPORTED_GRIDS.map((grid) => [grid, gridSizeToBeats(grid)]),
) as Record<PianoRollGrid, number>;

interface PianoRollVisualState {
  isSelected: boolean;
  isSlide: boolean;
}

interface PianoRollNoteVisualStyle {
  fillStyle: string;
  strokeStyle: string;
  strokeWidth: number;
  globalAlpha: number;
  velocityAccentOpacity: number;
}

interface VelocityLaneBarVisualStyle {
  fillStyle: string;
  globalAlpha: number;
  highlightAlpha: number;
}

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

export function getPianoRollNoteVisualStyle(
  velocity: number,
  { isSelected, isSlide }: PianoRollVisualState,
): PianoRollNoteVisualStyle {
  const normalizedVelocity = normalizeMidiVelocity(velocity);
  const velocityRatio = normalizedVelocity / 127;

  if (isSlide) {
    return {
      fillStyle: 'rgba(251, 191, 36, 0.92)',
      strokeStyle: isSelected ? '#fff7d6' : 'rgba(251,191,36,0.9)',
      strokeWidth: isSelected ? 1.5 : 0.5,
      globalAlpha: isSelected ? 1 : 0.8,
      velocityAccentOpacity: 0,
    };
  }

  return {
    fillStyle: velocityToColor(velocity),
    strokeStyle: isSelected ? '#fff' : 'rgba(255,255,255,0.3)',
    strokeWidth: isSelected ? 1.5 : 0.5,
    globalAlpha: isSelected ? 1 : 0.8,
    velocityAccentOpacity: 0.35 + velocityRatio * 0.2,
  };
}

export function getVelocityLaneBarVisualStyle(
  velocity: number,
  { isSelected, isSlide }: PianoRollVisualState,
): VelocityLaneBarVisualStyle {
  return {
    fillStyle: isSlide ? 'rgba(251,191,36,0.85)' : velocityToBarColor(velocity),
    globalAlpha: isSelected ? 1 : 0.6,
    highlightAlpha: isSelected ? 0.95 : 0.45,
  };
}

export const getPianoRollNoteVisuals = getPianoRollNoteVisualStyle;
export const getVelocityLaneBarVisuals = getVelocityLaneBarVisualStyle;

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
    case 'velocityPaint':
      return '6';
  }
}

export function generateNoteId(): string {
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
