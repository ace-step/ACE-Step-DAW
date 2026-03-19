import type { MidiNote } from '../types/project';

// ── Scale definitions (semitone offsets from root) ──────────────────────
export const SCALES: Record<string, number[]> = {
  major:            [0, 2, 4, 5, 7, 9, 11],
  minor:            [0, 2, 3, 5, 7, 8, 10],
  dorian:           [0, 2, 3, 5, 7, 9, 10],
  mixolydian:       [0, 2, 4, 5, 7, 9, 10],
  pentatonic:       [0, 2, 4, 7, 9],
  'minor-pentatonic': [0, 3, 5, 7, 10],
  blues:            [0, 3, 5, 6, 7, 10],
  chromatic:        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

// ── Transform option types ──────────────────────────────────────────────

export interface HumanizeOptions {
  type: 'humanize';
  timingAmount: number;   // max ± beats to randomize timing
  velocityAmount: number; // max ± to randomize velocity (0-127 range)
  seed?: number;          // optional seed for deterministic tests
}

export interface TransposeOptions {
  type: 'transpose';
  semitones: number;
}

export interface InvertOptions {
  type: 'invert';
  axis?: number; // pitch axis; defaults to midpoint of selected notes
}

export interface RetrogradeOptions {
  type: 'retrograde';
}

export interface LegatoOptions {
  type: 'legato';
  overlapBeats?: number; // optional overlap (default 0 = exactly touching)
}

export interface ScaleCorrectOptions {
  type: 'scaleCorrect';
  root: number;          // 0-11 (C=0, C#=1, …)
  scale: string;         // key into SCALES
}

export interface VelocityScaleOptions {
  type: 'velocityScale';
  min: number; // target minimum velocity (0-127)
  max: number; // target maximum velocity (0-127)
}

export type TransformOptions =
  | HumanizeOptions
  | TransposeOptions
  | InvertOptions
  | RetrogradeOptions
  | LegatoOptions
  | ScaleCorrectOptions
  | VelocityScaleOptions;

// ── Seeded random (simple mulberry32) ───────────────────────────────────

function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Individual transform functions ──────────────────────────────────────

export function humanize(notes: MidiNote[], opts: HumanizeOptions): MidiNote[] {
  const rand = opts.seed != null ? seededRandom(opts.seed) : Math.random;
  return notes.map((note) => {
    const timingShift = (rand() * 2 - 1) * opts.timingAmount;
    const velocityShift = Math.round((rand() * 2 - 1) * opts.velocityAmount);
    return {
      ...note,
      startBeat: Math.max(0, note.startBeat + timingShift),
      velocity: Math.max(1, Math.min(127, note.velocity + velocityShift)),
    };
  });
}

export function transpose(notes: MidiNote[], opts: TransposeOptions): MidiNote[] {
  return notes.map((note) => ({
    ...note,
    pitch: Math.max(0, Math.min(127, note.pitch + opts.semitones)),
  }));
}

export function invert(notes: MidiNote[], opts: InvertOptions): MidiNote[] {
  if (notes.length === 0) return notes;
  const axis =
    opts.axis ??
    Math.round(
      (Math.min(...notes.map((n) => n.pitch)) + Math.max(...notes.map((n) => n.pitch))) / 2,
    );
  return notes.map((note) => ({
    ...note,
    pitch: Math.max(0, Math.min(127, 2 * axis - note.pitch)),
  }));
}

export function retrograde(notes: MidiNote[]): MidiNote[] {
  if (notes.length === 0) return notes;
  const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat);
  const minStart = sorted[0].startBeat;
  const maxEnd = Math.max(...sorted.map((n) => n.startBeat + n.durationBeats));
  return sorted.map((note) => ({
    ...note,
    startBeat: maxEnd - (note.startBeat - minStart) - note.durationBeats,
  }));
}

export function legato(notes: MidiNote[], opts: LegatoOptions): MidiNote[] {
  if (notes.length <= 1) return notes;
  const overlap = opts.overlapBeats ?? 0;
  const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat);
  const result: MidiNote[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i < sorted.length - 1) {
      const gap = sorted[i + 1].startBeat - sorted[i].startBeat;
      result.push({ ...sorted[i], durationBeats: gap + overlap });
    } else {
      result.push({ ...sorted[i] });
    }
  }
  return result;
}

export function scaleCorrect(notes: MidiNote[], opts: ScaleCorrectOptions): MidiNote[] {
  const scaleIntervals = SCALES[opts.scale];
  if (!scaleIntervals) return notes;

  // Build a set of all valid pitches in 0-127
  const validPitches = new Set<number>();
  for (let octave = -1; octave <= 10; octave++) {
    for (const interval of scaleIntervals) {
      const pitch = (octave + 1) * 12 + opts.root + interval;
      if (pitch >= 0 && pitch <= 127) validPitches.add(pitch);
    }
  }

  function snapToScale(pitch: number): number {
    if (validPitches.has(pitch)) return pitch;
    for (let offset = 1; offset <= 6; offset++) {
      if (validPitches.has(pitch - offset)) return pitch - offset;
      if (validPitches.has(pitch + offset)) return pitch + offset;
    }
    return pitch;
  }

  return notes.map((note) => ({
    ...note,
    pitch: snapToScale(note.pitch),
  }));
}

export function velocityScale(notes: MidiNote[], opts: VelocityScaleOptions): MidiNote[] {
  if (notes.length === 0) return notes;
  const velocities = notes.map((n) => n.velocity);
  const srcMin = Math.min(...velocities);
  const srcMax = Math.max(...velocities);
  const srcRange = srcMax - srcMin;

  return notes.map((note) => {
    const normalized = srcRange === 0 ? 0.5 : (note.velocity - srcMin) / srcRange;
    const newVel = Math.round(opts.min + normalized * (opts.max - opts.min));
    return { ...note, velocity: Math.max(1, Math.min(127, newVel)) };
  });
}

// ── Dispatcher ──────────────────────────────────────────────────────────

export function applyTransform(notes: MidiNote[], opts: TransformOptions): MidiNote[] {
  switch (opts.type) {
    case 'humanize':     return humanize(notes, opts);
    case 'transpose':    return transpose(notes, opts);
    case 'invert':       return invert(notes, opts);
    case 'retrograde':   return retrograde(notes);
    case 'legato':       return legato(notes, opts);
    case 'scaleCorrect': return scaleCorrect(notes, opts);
    case 'velocityScale': return velocityScale(notes, opts);
  }
}
