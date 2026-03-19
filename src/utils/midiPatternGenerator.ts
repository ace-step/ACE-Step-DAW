/**
 * AI MIDI Pattern Generator
 *
 * Generates editable MIDI note patterns from genre, role, scale, and density constraints.
 * All output notes conform to the MidiNote interface (without `id` — caller assigns IDs).
 */

import { SCALES } from './midiTransforms';

// ── Types ───────────────────────────────────────────────────────────────

export type PatternRole = 'melody' | 'chords' | 'bass' | 'arp';
export type PatternGenre = 'pop' | 'jazz' | 'electronic' | 'hiphop' | 'classical' | 'rock';

export interface PatternOptions {
  role: PatternRole;
  genre: PatternGenre;
  root: number;          // 0-11 (C=0, C#=1, …)
  scale: string;         // key into SCALES from midiTransforms
  bars: number;          // length of pattern in bars
  density: number;       // 0-1 (sparse to dense)
  beatsPerBar: number;   // time signature numerator (default 4)
  seed: number;          // deterministic seed for reproducibility
}

export interface GeneratedNote {
  pitch: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
}

// ── Seeded PRNG (mulberry32) ────────────────────────────────────────────

function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Scale helpers ───────────────────────────────────────────────────────

/**
 * Get all MIDI pitches in a given scale within a range.
 */
export function getScalePitches(root: number, scale: string, minPitch: number, maxPitch: number): number[] {
  const intervals = SCALES[scale] ?? SCALES.major;
  const pitches: number[] = [];
  for (let octave = -1; octave <= 10; octave++) {
    for (const interval of intervals) {
      const pitch = (octave + 1) * 12 + root + interval;
      if (pitch >= minPitch && pitch <= maxPitch) {
        pitches.push(pitch);
      }
    }
  }
  return pitches.sort((a, b) => a - b);
}

// ── Genre rhythm profiles ───────────────────────────────────────────────

interface GenreProfile {
  /** Probability of note on each subdivision (affects density scaling) */
  subdivisions: number;
  /** Velocity range [min, max] (0-1) */
  velocityRange: [number, number];
  /** Swing amount (0 = straight, 0.5 = heavy) */
  swing: number;
  /** Note duration multiplier */
  durationFactor: number;
}

const GENRE_PROFILES: Record<PatternGenre, GenreProfile> = {
  pop:        { subdivisions: 2, velocityRange: [0.6, 0.85], swing: 0, durationFactor: 0.9 },
  jazz:       { subdivisions: 3, velocityRange: [0.5, 0.9], swing: 0.3, durationFactor: 0.8 },
  electronic: { subdivisions: 4, velocityRange: [0.7, 0.95], swing: 0, durationFactor: 0.7 },
  hiphop:     { subdivisions: 4, velocityRange: [0.6, 0.9], swing: 0.2, durationFactor: 0.85 },
  classical:  { subdivisions: 2, velocityRange: [0.4, 0.8], swing: 0, durationFactor: 1.0 },
  rock:       { subdivisions: 2, velocityRange: [0.7, 0.95], swing: 0, durationFactor: 0.9 },
};

// ── Role-specific generators ────────────────────────────────────────────

function generateMelody(opts: PatternOptions, rand: () => number, profile: GenreProfile): GeneratedNote[] {
  const totalBeats = opts.bars * opts.beatsPerBar;
  const scalePitches = getScalePitches(opts.root, opts.scale, 60, 84); // middle register
  if (scalePitches.length === 0) return [];

  const notes: GeneratedNote[] = [];
  const stepsPerBeat = profile.subdivisions;
  const totalSteps = totalBeats * stepsPerBeat;
  const stepDuration = 1 / stepsPerBeat;

  // Density controls probability of placing a note on each step
  const baseProbability = 0.15 + opts.density * 0.55; // 0.15 to 0.70

  let currentPitchIdx = Math.floor(scalePitches.length / 2);

  for (let step = 0; step < totalSteps; step++) {
    if (rand() > baseProbability) continue;

    // Melodic movement: prefer small intervals
    const movement = Math.floor(rand() * 5) - 2; // -2 to +2
    currentPitchIdx = Math.max(0, Math.min(scalePitches.length - 1, currentPitchIdx + movement));

    const startBeat = step * stepDuration;
    // Duration: 1-3 subdivisions
    const durSteps = 1 + Math.floor(rand() * 3);
    const durationBeats = Math.min(durSteps * stepDuration * profile.durationFactor, totalBeats - startBeat);

    if (durationBeats <= 0) continue;

    const [vMin, vMax] = profile.velocityRange;
    const velocity = vMin + rand() * (vMax - vMin);

    notes.push({
      pitch: scalePitches[currentPitchIdx],
      startBeat,
      durationBeats,
      velocity,
    });

    // Skip steps covered by this note's duration to avoid overlaps
    step += durSteps - 1;
  }

  return notes;
}

function generateChords(opts: PatternOptions, rand: () => number, profile: GenreProfile): GeneratedNote[] {
  const totalBeats = opts.bars * opts.beatsPerBar;
  const scalePitches = getScalePitches(opts.root, opts.scale, 48, 72);
  const intervals = SCALES[opts.scale] ?? SCALES.major;
  if (scalePitches.length < 3) return [];

  const notes: GeneratedNote[] = [];

  // Chord changes: typically every 1-4 beats depending on density
  const chordsPerBar = Math.max(1, Math.round(1 + opts.density * 3));
  const chordDuration = opts.beatsPerBar / chordsPerBar;

  for (let bar = 0; bar < opts.bars; bar++) {
    for (let c = 0; c < chordsPerBar; c++) {
      const startBeat = bar * opts.beatsPerBar + c * chordDuration;
      if (startBeat >= totalBeats) break;

      // Pick a scale degree as root (0-indexed into scale)
      const degreeIdx = Math.floor(rand() * intervals.length);
      const chordRoot = (opts.root + intervals[degreeIdx]) % 12;

      // Build triad from scale tones
      const chordPitches: number[] = [];
      // Find pitches in our scale that form a triad from this degree
      const rootPitch = scalePitches.find((p) => p % 12 === chordRoot && p >= 48 && p <= 66);
      if (rootPitch === undefined) continue;

      chordPitches.push(rootPitch);

      // Add 3rd and 5th by stepping through scale pitches
      const rootIdx = scalePitches.indexOf(rootPitch);
      if (rootIdx + 2 < scalePitches.length) chordPitches.push(scalePitches[rootIdx + 2]);
      if (rootIdx + 4 < scalePitches.length) chordPitches.push(scalePitches[rootIdx + 4]);

      const duration = Math.min(chordDuration * profile.durationFactor, totalBeats - startBeat);
      if (duration <= 0) continue;

      const [vMin, vMax] = profile.velocityRange;
      const velocity = vMin + rand() * (vMax - vMin);

      for (const pitch of chordPitches) {
        notes.push({ pitch, startBeat, durationBeats: duration, velocity });
      }
    }
  }

  return notes;
}

function generateBass(opts: PatternOptions, rand: () => number, profile: GenreProfile): GeneratedNote[] {
  const totalBeats = opts.bars * opts.beatsPerBar;
  const scalePitches = getScalePitches(opts.root, opts.scale, 28, 55); // bass register
  if (scalePitches.length === 0) return [];

  const notes: GeneratedNote[] = [];
  const stepsPerBeat = profile.subdivisions;
  const totalSteps = totalBeats * stepsPerBeat;
  const stepDuration = 1 / stepsPerBeat;

  const baseProbability = 0.2 + opts.density * 0.5;
  let currentPitchIdx = Math.floor(scalePitches.length / 2);

  for (let step = 0; step < totalSteps; step++) {
    // Bass often emphasizes beat 1
    const isDownbeat = step % (stepsPerBeat * opts.beatsPerBar) === 0;
    const prob = isDownbeat ? Math.min(baseProbability + 0.3, 0.95) : baseProbability;

    if (rand() > prob) continue;

    // Bass: smaller movements, gravitate toward root
    const movement = Math.floor(rand() * 3) - 1; // -1 to +1
    currentPitchIdx = Math.max(0, Math.min(scalePitches.length - 1, currentPitchIdx + movement));

    // On downbeats, prefer the root
    if (isDownbeat && rand() > 0.4) {
      const rootPitchIdx = scalePitches.findIndex((p) => p % 12 === opts.root);
      if (rootPitchIdx >= 0) currentPitchIdx = rootPitchIdx;
    }

    const startBeat = step * stepDuration;
    const durSteps = 1 + Math.floor(rand() * 4);
    const durationBeats = Math.min(durSteps * stepDuration * profile.durationFactor, totalBeats - startBeat);

    if (durationBeats <= 0) continue;

    const [vMin, vMax] = profile.velocityRange;
    const velocity = vMin + rand() * (vMax - vMin);

    notes.push({
      pitch: scalePitches[currentPitchIdx],
      startBeat,
      durationBeats,
      velocity,
    });

    step += durSteps - 1;
  }

  return notes;
}

function generateArp(opts: PatternOptions, rand: () => number, profile: GenreProfile): GeneratedNote[] {
  const totalBeats = opts.bars * opts.beatsPerBar;
  const scalePitches = getScalePitches(opts.root, opts.scale, 48, 84);
  if (scalePitches.length === 0) return [];

  const notes: GeneratedNote[] = [];

  // Arp: fast, regular subdivisions
  const stepsPerBeat = Math.max(2, profile.subdivisions);
  const totalSteps = totalBeats * stepsPerBeat;
  const stepDuration = 1 / stepsPerBeat;

  // Select a chord (root, 3rd, 5th, octave) as arp base
  const rootIdx = Math.floor(scalePitches.length / 3);
  const arpIndices: number[] = [];
  for (let i = 0; i < Math.min(scalePitches.length, 6); i += 2) {
    arpIndices.push(rootIdx + i < scalePitches.length ? rootIdx + i : rootIdx);
  }
  // Add octave if possible
  if (rootIdx + 7 < scalePitches.length) arpIndices.push(rootIdx + 7);

  const baseProbability = 0.4 + opts.density * 0.5;
  let arpPosition = 0;
  let direction = 1;

  for (let step = 0; step < totalSteps; step++) {
    if (rand() > baseProbability) continue;

    const pitchIdx = arpIndices[arpPosition % arpIndices.length];
    const pitch = scalePitches[Math.min(pitchIdx, scalePitches.length - 1)];

    const startBeat = step * stepDuration;
    const durationBeats = Math.min(stepDuration * profile.durationFactor, totalBeats - startBeat);

    if (durationBeats <= 0) continue;

    const [vMin, vMax] = profile.velocityRange;
    // Arp: accent pattern
    const accent = arpPosition === 0 ? 0.1 : 0;
    const velocity = Math.min(1, vMin + rand() * (vMax - vMin) + accent);

    notes.push({ pitch, startBeat, durationBeats, velocity });

    // Move through arp pattern (up-down)
    arpPosition += direction;
    if (arpPosition >= arpIndices.length) {
      direction = -1;
      arpPosition = arpIndices.length - 2;
    } else if (arpPosition < 0) {
      direction = 1;
      arpPosition = 1;
    }
  }

  return notes;
}

// ── Main entry point ────────────────────────────────────────────────────

/**
 * Generate a MIDI pattern from the given constraints.
 * Returns notes without `id` — the store action assigns UUIDs.
 */
export function generatePattern(opts: PatternOptions): GeneratedNote[] {
  const rand = seededRandom(opts.seed);
  const profile = GENRE_PROFILES[opts.genre] ?? GENRE_PROFILES.pop;

  switch (opts.role) {
    case 'melody': return generateMelody(opts, rand, profile);
    case 'chords': return generateChords(opts, rand, profile);
    case 'bass':   return generateBass(opts, rand, profile);
    case 'arp':    return generateArp(opts, rand, profile);
  }
}
