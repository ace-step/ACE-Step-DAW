import type { MidiNote, GrooveTemplate } from '../types/project';

export interface ExtractGrooveOptions {
  /** Grid size in beats (e.g. 0.25 = 16th note, 0.5 = 8th). */
  gridBeats: number;
  /** Total length in beats to analyze (e.g. 4 = one bar of 4/4). */
  lengthBeats: number;
}

export interface ApplyGrooveOptions {
  /** How strongly to apply the groove (0–100). 0 = no change, 100 = full groove. */
  strength: number;
  /** Apply timing offsets. Default true. */
  applyTiming?: boolean;
  /** Apply velocity pattern. Default true. */
  applyVelocity?: boolean;
}

/**
 * Extract a groove template from MIDI notes by analyzing their timing
 * deviation from the quantized grid and their velocity pattern.
 *
 * The groove is expressed as arrays of timing offsets and velocity multipliers,
 * one entry per grid position within `lengthBeats`.
 */
export function extractGroove(
  notes: MidiNote[],
  options: ExtractGrooveOptions,
): Pick<GrooveTemplate, 'timingOffsets' | 'velocityPattern' | 'gridBeats' | 'lengthBeats'> {
  const { gridBeats, lengthBeats } = options;
  const slotCount = Math.round(lengthBeats / gridBeats);

  // Accumulate per-slot: sum of offsets, sum of velocities, count
  const slotOffsetSums = new Array<number>(slotCount).fill(0);
  const slotVelocitySums = new Array<number>(slotCount).fill(0);
  const slotCounts = new Array<number>(slotCount).fill(0);

  // Average velocity of all notes for normalization
  const avgVelocity = notes.length > 0
    ? notes.reduce((s, n) => s + n.velocity, 0) / notes.length
    : 80;

  for (const note of notes) {
    // Wrap the note position within the groove length
    const posInLoop = ((note.startBeat % lengthBeats) + lengthBeats) % lengthBeats;
    // Find nearest grid slot
    const slotIndex = Math.round(posInLoop / gridBeats) % slotCount;
    const quantizedBeat = slotIndex * gridBeats;
    const offset = posInLoop - quantizedBeat;

    slotOffsetSums[slotIndex] += offset;
    slotVelocitySums[slotIndex] += note.velocity;
    slotCounts[slotIndex] += 1;
  }

  const timingOffsets: number[] = [];
  const velocityPattern: number[] = [];

  for (let i = 0; i < slotCount; i++) {
    if (slotCounts[i] > 0) {
      timingOffsets.push(slotOffsetSums[i] / slotCounts[i]);
      velocityPattern.push((slotVelocitySums[i] / slotCounts[i]) / avgVelocity);
    } else {
      timingOffsets.push(0);
      velocityPattern.push(1);
    }
  }

  return { timingOffsets, velocityPattern, gridBeats, lengthBeats };
}

/**
 * Apply a groove template to MIDI notes. Returns new note objects (non-mutating).
 *
 * Each note is shifted toward the groove's timing offset for its nearest grid
 * position, and its velocity is scaled by the groove's velocity multiplier.
 * The `strength` parameter (0–100) controls interpolation.
 */
export function applyGroove(
  notes: MidiNote[],
  groove: Pick<GrooveTemplate, 'timingOffsets' | 'velocityPattern' | 'gridBeats' | 'lengthBeats'>,
  options: ApplyGrooveOptions,
): MidiNote[] {
  const { strength, applyTiming = true, applyVelocity = true } = options;
  if (strength === 0) return notes.map((n) => ({ ...n }));

  const factor = strength / 100;
  const slotCount = groove.timingOffsets.length;

  return notes.map((note) => {
    // Find the groove slot for this note
    const posInLoop = ((note.startBeat % groove.lengthBeats) + groove.lengthBeats) % groove.lengthBeats;
    const slotIndex = Math.round(posInLoop / groove.gridBeats) % slotCount;

    let newStart = note.startBeat;
    if (applyTiming) {
      const currentOffset = posInLoop - slotIndex * groove.gridBeats;
      const targetOffset = groove.timingOffsets[slotIndex];
      const delta = targetOffset - currentOffset;
      newStart = Math.max(0, note.startBeat + delta * factor);
    }

    let newVelocity = note.velocity;
    if (applyVelocity) {
      const velMultiplier = groove.velocityPattern[slotIndex];
      const targetVelocity = note.velocity * velMultiplier;
      newVelocity = note.velocity + (targetVelocity - note.velocity) * factor;
      newVelocity = Math.max(1, Math.min(127, Math.round(newVelocity)));
    }

    return {
      ...note,
      startBeat: newStart,
      velocity: newVelocity,
    };
  });
}
