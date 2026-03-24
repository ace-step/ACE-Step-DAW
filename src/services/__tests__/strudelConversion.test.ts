import { describe, it, expect } from 'vitest';
import {
  strudelEventsToMidiNotes,
  strudelEventsToDrumPattern,
  STRUDEL_TO_DAW_DRUM,
} from '../strudelConversion';
import type { StrudelEvent } from '../../engine/strudelEngine';

describe('strudelEventsToMidiNotes', () => {
  it('converts melodic events to MIDI notes', () => {
    const events: StrudelEvent[] = [
      { startCycle: 0, endCycle: 0.25, durationCycles: 0.25, hasOnset: true, value: { note: 48 }, note: 48 },
      { startCycle: 0.25, endCycle: 0.5, durationCycles: 0.25, hasOnset: true, value: { note: 52 }, note: 52 },
      { startCycle: 0.5, endCycle: 0.75, durationCycles: 0.25, hasOnset: true, value: { note: 55 }, note: 55 },
      { startCycle: 0.75, endCycle: 1, durationCycles: 0.25, hasOnset: true, value: { note: 60 }, note: 60 },
    ];

    const notes = strudelEventsToMidiNotes(events, 4);

    expect(notes).toHaveLength(4);
    expect(notes[0].pitch).toBe(48);
    expect(notes[0].startBeat).toBe(0);
    expect(notes[0].durationBeats).toBe(1);
    expect(notes[1].pitch).toBe(52);
    expect(notes[1].startBeat).toBe(1);
    expect(notes[2].pitch).toBe(55);
    expect(notes[2].startBeat).toBe(2);
    expect(notes[3].pitch).toBe(60);
    expect(notes[3].startBeat).toBe(3);
  });

  it('extracts velocity from event value', () => {
    const events: StrudelEvent[] = [
      { startCycle: 0, endCycle: 0.5, durationCycles: 0.5, hasOnset: true, value: { note: 60, velocity: 0.5 }, note: 60 },
    ];

    const notes = strudelEventsToMidiNotes(events, 4);
    expect(notes[0].velocity).toBe(0.5);
  });

  it('uses default velocity when not specified', () => {
    const events: StrudelEvent[] = [
      { startCycle: 0, endCycle: 1, durationCycles: 1, hasOnset: true, value: { note: 60 }, note: 60 },
    ];

    const notes = strudelEventsToMidiNotes(events, 4);
    expect(notes[0].velocity).toBe(0.8);
  });

  it('filters out percussion-only events (no note)', () => {
    const events: StrudelEvent[] = [
      { startCycle: 0, endCycle: 0.25, durationCycles: 0.25, hasOnset: true, value: 'bd', sound: 'bd' },
      { startCycle: 0.25, endCycle: 0.5, durationCycles: 0.25, hasOnset: true, value: { note: 60 }, note: 60 },
    ];

    const notes = strudelEventsToMidiNotes(events, 4);
    expect(notes).toHaveLength(1);
    expect(notes[0].pitch).toBe(60);
  });

  it('returns empty array for empty events', () => {
    expect(strudelEventsToMidiNotes([], 4)).toEqual([]);
  });

  it('handles multi-bar patterns', () => {
    const events: StrudelEvent[] = [
      { startCycle: 0, endCycle: 0.5, durationCycles: 0.5, hasOnset: true, value: { note: 60 }, note: 60 },
      { startCycle: 1.5, endCycle: 2, durationCycles: 0.5, hasOnset: true, value: { note: 64 }, note: 64 },
    ];

    const notes = strudelEventsToMidiNotes(events, 4);
    expect(notes).toHaveLength(2);
    expect(notes[0].startBeat).toBe(0);
    expect(notes[1].startBeat).toBe(6); // 1.5 cycles * 4 beats/cycle
  });

  it('rounds fractional pitches', () => {
    const events: StrudelEvent[] = [
      { startCycle: 0, endCycle: 1, durationCycles: 1, hasOnset: true, value: { note: 60.4 }, note: 60.4 },
    ];

    const notes = strudelEventsToMidiNotes(events, 4);
    expect(notes[0].pitch).toBe(60);
  });
});

describe('strudelEventsToDrumPattern', () => {
  it('maps basic percussion sounds to sequencer rows', () => {
    const events: StrudelEvent[] = [
      { startCycle: 0, endCycle: 0.25, durationCycles: 0.25, hasOnset: true, value: 'bd', sound: 'bd' },
      { startCycle: 0.25, endCycle: 0.5, durationCycles: 0.25, hasOnset: true, value: 'sd', sound: 'sd' },
      { startCycle: 0.5, endCycle: 0.75, durationCycles: 0.25, hasOnset: true, value: 'hh', sound: 'hh' },
      { startCycle: 0.75, endCycle: 1, durationCycles: 0.25, hasOnset: true, value: 'oh', sound: 'oh' },
    ];

    const pattern = strudelEventsToDrumPattern(events, 1, 16);

    expect(pattern.rows).toHaveLength(4);
    expect(pattern.stepsPerBar).toBe(16);
    expect(pattern.bars).toBe(1);

    const kickRow = pattern.rows.find((r) => r.sampleKey === 'kick');
    expect(kickRow).toBeDefined();
    expect(kickRow!.steps[0].active).toBe(true);
    expect(kickRow!.steps[4].active).toBe(false);

    const snareRow = pattern.rows.find((r) => r.sampleKey === 'snare');
    expect(snareRow).toBeDefined();
    expect(snareRow!.steps[4].active).toBe(true); // 0.25 * 16 = 4
  });

  it('quantizes events to nearest step', () => {
    const events: StrudelEvent[] = [
      // At 0.12 cycles → step 1.92 → rounds to 2
      { startCycle: 0.12, endCycle: 0.25, durationCycles: 0.13, hasOnset: true, value: 'bd', sound: 'bd' },
    ];

    const pattern = strudelEventsToDrumPattern(events, 1, 16);
    const kickRow = pattern.rows.find((r) => r.sampleKey === 'kick');
    expect(kickRow!.steps[2].active).toBe(true);
  });

  it('maps unknown sounds to perc', () => {
    const events: StrudelEvent[] = [
      { startCycle: 0, endCycle: 0.25, durationCycles: 0.25, hasOnset: true, value: 'unknown_sound', sound: 'unknown_sound' },
    ];

    const pattern = strudelEventsToDrumPattern(events, 1, 16);
    expect(pattern.rows).toHaveLength(1);
    expect(pattern.rows[0].sampleKey).toBe('perc');
  });

  it('propagates velocity to steps', () => {
    const events: StrudelEvent[] = [
      { startCycle: 0, endCycle: 0.25, durationCycles: 0.25, hasOnset: true, value: { s: 'bd', velocity: 0.5 }, sound: 'bd' },
    ];

    const pattern = strudelEventsToDrumPattern(events, 1, 16);
    const kickRow = pattern.rows.find((r) => r.sampleKey === 'kick');
    expect(kickRow!.steps[0].velocity).toBe(0.5);
  });

  it('handles multi-bar patterns', () => {
    const events: StrudelEvent[] = [
      { startCycle: 0, endCycle: 0.25, durationCycles: 0.25, hasOnset: true, value: 'bd', sound: 'bd' },
      { startCycle: 1, endCycle: 1.25, durationCycles: 0.25, hasOnset: true, value: 'bd', sound: 'bd' },
    ];

    const pattern = strudelEventsToDrumPattern(events, 2, 16);
    expect(pattern.bars).toBe(2);
    const kickRow = pattern.rows.find((r) => r.sampleKey === 'kick');
    expect(kickRow!.steps).toHaveLength(32); // 2 bars * 16 steps
    expect(kickRow!.steps[0].active).toBe(true);
    expect(kickRow!.steps[16].active).toBe(true);
  });

  it('returns empty pattern for no percussion events', () => {
    const events: StrudelEvent[] = [
      { startCycle: 0, endCycle: 1, durationCycles: 1, hasOnset: true, value: { note: 60 }, note: 60 },
    ];

    const pattern = strudelEventsToDrumPattern(events, 1, 16);
    expect(pattern.rows).toHaveLength(0);
  });
});

describe('sequencerPatternToMidiData', () => {
  let sequencerPatternToMidiData: typeof import('../strudelConversion').sequencerPatternToMidiData;

  beforeAll(async () => {
    ({ sequencerPatternToMidiData } = await import('../strudelConversion'));
  });

  it('converts sequencer rows/steps to MIDI notes with GM drum pitches', () => {
    const pattern: import('../../types/project').SequencerPattern = {
      id: 'test-pattern',
      name: 'Test',
      stepsPerBar: 16,
      bars: 1,
      swing: 0,
      rows: [
        {
          id: 'r1', name: 'Kick', sampleKey: 'kick',
          steps: Array.from({ length: 16 }, (_, i) => ({
            active: i === 0 || i === 8, velocity: 0.9,
          })),
          volume: 0.8, pan: 0, muted: false, color: '#f00',
        },
        {
          id: 'r2', name: 'Snare', sampleKey: 'snare',
          steps: Array.from({ length: 16 }, (_, i) => ({
            active: i === 4 || i === 12, velocity: 0.7,
          })),
          volume: 0.8, pan: 0, muted: false, color: '#0f0',
        },
      ],
    };

    const midiData = sequencerPatternToMidiData(pattern, 4);

    expect(midiData.notes).toHaveLength(4);

    const kicks = midiData.notes.filter(n => n.pitch === 36);
    expect(kicks).toHaveLength(2);
    expect(kicks[0].startBeat).toBe(0);
    expect(kicks[1].startBeat).toBe(2);
    expect(kicks[0].velocity).toBe(0.9);

    const snares = midiData.notes.filter(n => n.pitch === 38);
    expect(snares).toHaveLength(2);
    expect(snares[0].startBeat).toBe(1);
    expect(snares[1].startBeat).toBe(3);
    expect(snares[0].velocity).toBe(0.7);

    expect(midiData.notes[0].durationBeats).toBeCloseTo(0.25);
    expect(midiData.grid).toBe('1/16');
  });

  it('returns empty notes for empty pattern', () => {
    const pattern: import('../../types/project').SequencerPattern = {
      id: 'empty', name: 'Empty', stepsPerBar: 16, bars: 1, swing: 0, rows: [],
    };

    const midiData = sequencerPatternToMidiData(pattern, 4);
    expect(midiData.notes).toHaveLength(0);
  });

  it('uses fallback pitch 47 for unknown drum keys', () => {
    const pattern: import('../../types/project').SequencerPattern = {
      id: 'test', name: 'Test', stepsPerBar: 16, bars: 1, swing: 0,
      rows: [{
        id: 'r1', name: 'Unknown', sampleKey: 'unknown_thing',
        steps: Array.from({ length: 16 }, (_, i) => ({
          active: i === 0, velocity: 0.8,
        })),
        volume: 0.8, pan: 0, muted: false, color: '#888',
      }],
    };

    const midiData = sequencerPatternToMidiData(pattern, 4);
    expect(midiData.notes).toHaveLength(1);
    expect(midiData.notes[0].pitch).toBe(47);
  });

  it('skips muted rows', () => {
    const pattern: import('../../types/project').SequencerPattern = {
      id: 'test', name: 'Test', stepsPerBar: 16, bars: 1, swing: 0,
      rows: [{
        id: 'r1', name: 'Kick', sampleKey: 'kick',
        steps: Array.from({ length: 16 }, (_, i) => ({
          active: i === 0, velocity: 0.8,
        })),
        volume: 0.8, pan: 0, muted: true, color: '#f00',
      }],
    };

    const midiData = sequencerPatternToMidiData(pattern, 4);
    expect(midiData.notes).toHaveLength(0);
  });
});

describe('STRUDEL_TO_DAW_DRUM', () => {
  it('maps common strudel drum names', () => {
    expect(STRUDEL_TO_DAW_DRUM['bd']).toBe('kick');
    expect(STRUDEL_TO_DAW_DRUM['sd']).toBe('snare');
    expect(STRUDEL_TO_DAW_DRUM['hh']).toBe('closed_hh');
    expect(STRUDEL_TO_DAW_DRUM['oh']).toBe('open_hh');
    expect(STRUDEL_TO_DAW_DRUM['cp']).toBe('clap');
  });
});
