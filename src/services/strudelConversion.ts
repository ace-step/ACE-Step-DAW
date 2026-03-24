/**
 * strudelConversion — Convert Strudel pattern events to DAW-native formats.
 *
 * Pure functions that transform StrudelEvent[] into:
 * - MidiNote[] for piano roll tracks
 * - SequencerPattern for drum machine tracks
 */

import type { StrudelEvent } from '../engine/strudelEngine';
import type { MidiClipData, MidiNote, SequencerPattern, SequencerRow, SequencerStep } from '../types/project';

// ─── Strudel → MIDI ─────────────────────────────────────────

/**
 * Convert Strudel events with note data to MidiNote objects.
 *
 * Cycle time → beat time: `startBeat = event.startCycle * beatsPerCycle`
 * Strudel resolves note names to MIDI numbers internally, so
 * `event.note` is already a numeric pitch (e.g., c3 → 48).
 */
export function strudelEventsToMidiNotes(
  events: StrudelEvent[],
  beatsPerCycle: number = 4,
): MidiNote[] {
  return events
    .filter((e) => e.note !== undefined && !isNaN(e.note as number))
    .map((e, i) => {
      const value = e.value as Record<string, unknown> | undefined;
      const velocity = typeof value === 'object' && value !== null && typeof value.velocity === 'number'
        ? value.velocity
        : 0.8;

      return {
        id: `strudel-midi-${i}-${Date.now()}`,
        pitch: Math.round(e.note as number),
        startBeat: e.startCycle * beatsPerCycle,
        durationBeats: e.durationCycles * beatsPerCycle,
        velocity,
      };
    });
}

// ─── Strudel → Drum Machine ─────────────────────────────────

/** Map Strudel percussion short names to DAW drum sample keys. */
export const STRUDEL_TO_DAW_DRUM: Record<string, string> = {
  bd: 'kick',
  sd: 'snare',
  sn: 'snare',
  hh: 'closed_hh',
  ch: 'closed_hh',
  oh: 'open_hh',
  cp: 'clap',
  rm: 'rim',
  rim: 'rim',
  ht: 'high_tom',
  mt: 'mid_tom',
  lt: 'low_tom',
  cy: 'crash',
  cr: 'crash',
  rd: 'ride',
  rc: 'ride',
  cb: 'cowbell',
  sh: 'shaker',
  cl: 'claves',
  ma: 'maracas',
  rs: 'rim',
  perc: 'perc',
};

/** Display names for DAW drum sample keys. */
const DRUM_DISPLAY_NAMES: Record<string, string> = {
  kick: 'Kick',
  snare: 'Snare',
  closed_hh: 'Closed HH',
  open_hh: 'Open HH',
  clap: 'Clap',
  rim: 'Rim',
  high_tom: 'High Tom',
  mid_tom: 'Mid Tom',
  low_tom: 'Low Tom',
  crash: 'Crash',
  ride: 'Ride',
  cowbell: 'Cowbell',
  shaker: 'Shaker',
  claves: 'Claves',
  maracas: 'Maracas',
  perc: 'Perc',
};

/**
 * Convert Strudel percussion events to a SequencerPattern.
 *
 * Groups events by mapped drum name, quantizes to step grid.
 * `stepIndex = Math.round(event.startCycle * stepsPerBar) % totalSteps`
 */
export function strudelEventsToDrumPattern(
  events: StrudelEvent[],
  bars: number = 1,
  stepsPerBar: number = 16,
): SequencerPattern {
  const totalSteps = bars * stepsPerBar;

  // Filter to percussion events (those with `sound` but no `note`)
  const percEvents = events.filter(
    (e) => e.sound !== undefined && (e.note === undefined || isNaN(e.note as number)),
  );

  // Group by mapped drum name
  const groups = new Map<string, { stepIndex: number; velocity: number }[]>();

  for (const e of percEvents) {
    const dawDrum = STRUDEL_TO_DAW_DRUM[e.sound!] ?? 'perc';
    if (!groups.has(dawDrum)) groups.set(dawDrum, []);

    const stepIndex = Math.round(e.startCycle * stepsPerBar) % totalSteps;
    const value = e.value as Record<string, unknown> | undefined;
    const velocity = typeof value === 'object' && value !== null && typeof value.velocity === 'number'
      ? value.velocity
      : 0.8;

    groups.get(dawDrum)!.push({ stepIndex, velocity });
  }

  // Build rows
  const rows: SequencerRow[] = [];
  for (const [sampleKey, hits] of groups) {
    const steps: SequencerStep[] = Array.from({ length: totalSteps }, () => ({
      active: false,
      velocity: 0.8,
    }));

    for (const hit of hits) {
      if (hit.stepIndex >= 0 && hit.stepIndex < totalSteps) {
        steps[hit.stepIndex] = { active: true, velocity: hit.velocity };
      }
    }

    rows.push({
      id: `strudel-row-${sampleKey}-${Date.now()}`,
      name: DRUM_DISPLAY_NAMES[sampleKey] ?? sampleKey,
      sampleKey,
      steps,
      volume: 0.8,
      pan: 0,
      muted: false,
      color: '#888888',
    });
  }

  return {
    id: `strudel-pattern-${Date.now()}`,
    name: 'Strudel Pattern',
    rows,
    stepsPerBar,
    bars,
    swing: 0,
  };
}

// ─── Sequencer Pattern → MIDI Clip Data ─────────────────────

/** Map DAW drum sample keys to GM drum MIDI pitches. */
export const DAW_DRUM_TO_MIDI_PITCH: Record<string, number> = {
  kick: 36, snare: 38, closed_hh: 42, open_hh: 46,
  clap: 39, rim: 37, high_tom: 50, mid_tom: 47,
  low_tom: 45, crash: 49, ride: 51, cowbell: 56,
  shaker: 70, claves: 75, maracas: 70, perc: 47,
};

/**
 * Convert a SequencerPattern to MidiClipData for timeline visualization.
 *
 * Each active step becomes a MidiNote with GM drum pitch mapping.
 * Muted rows are skipped.
 */
export function sequencerPatternToMidiData(
  pattern: SequencerPattern,
  beatsPerBar: number = 4,
): MidiClipData {
  const notes: MidiNote[] = [];
  const beatsPerStep = beatsPerBar / pattern.stepsPerBar;

  for (const row of pattern.rows) {
    if (row.muted) continue;
    const pitch = DAW_DRUM_TO_MIDI_PITCH[row.sampleKey] ?? 47;

    for (let i = 0; i < row.steps.length; i++) {
      const step = row.steps[i];
      if (!step.active) continue;

      notes.push({
        id: `seq-midi-${row.sampleKey}-${i}-${Date.now()}`,
        pitch,
        startBeat: i * beatsPerStep,
        durationBeats: beatsPerStep,
        velocity: step.velocity,
      });
    }
  }

  return { notes, grid: '1/16' };
}
