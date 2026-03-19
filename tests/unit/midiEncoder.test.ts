import { describe, expect, it } from 'vitest';
import { parseMidiFile } from '../../src/utils/midi';
import { encodeMidiFile } from '../../src/utils/midiEncoder';

describe('encodeMidiFile', () => {
  it('round-trips notes through encode then parse', () => {
    const notes = [
      { id: '1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 100 / 127 },
      { id: '2', pitch: 64, startBeat: 1, durationBeats: 0.5, velocity: 80 / 127 },
      { id: '3', pitch: 67, startBeat: 1.5, durationBeats: 2, velocity: 1 },
    ];

    const encoded = encodeMidiFile(notes, { bpm: 140, trackName: 'Lead' });
    const parsed = parseMidiFile(encoded);

    expect(parsed.bpm).toBe(140);
    expect(parsed.tracks).toHaveLength(1);
    expect(parsed.tracks[0].name).toBe('Lead');
    expect(parsed.tracks[0].notes).toHaveLength(3);

    for (let i = 0; i < notes.length; i++) {
      expect(parsed.tracks[0].notes[i].pitch).toBe(notes[i].pitch);
      expect(parsed.tracks[0].notes[i].startBeat).toBeCloseTo(notes[i].startBeat, 5);
      expect(parsed.tracks[0].notes[i].durationBeats).toBeCloseTo(notes[i].durationBeats, 5);
      expect(parsed.tracks[0].notes[i].velocity).toBeCloseTo(notes[i].velocity, 2);
    }
  });

  it('encodes an empty note list without errors', () => {
    const encoded = encodeMidiFile([], { bpm: 120 });
    const parsed = parseMidiFile(encoded);

    expect(parsed.bpm).toBe(120);
    expect(parsed.tracks).toHaveLength(0);
  });

  it('encodes time signature when provided', () => {
    const notes = [{ id: '1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 }];
    const encoded = encodeMidiFile(notes, {
      bpm: 90,
      timeSignature: { bar: 1, numerator: 3, denominator: 4 },
    });
    const parsed = parseMidiFile(encoded);

    expect(parsed.timeSignature).toEqual({ bar: 1, numerator: 3, denominator: 4 });
  });

  it('encodes multi-track MIDI file', () => {
    const tracks = [
      {
        name: 'Piano',
        channel: 0,
        notes: [
          { id: '1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 },
        ],
      },
      {
        name: 'Bass',
        channel: 1,
        notes: [
          { id: '2', pitch: 36, startBeat: 0, durationBeats: 2, velocity: 1 },
        ],
      },
    ];

    const encoded = encodeMidiFile(tracks, { bpm: 120 });
    const parsed = parseMidiFile(encoded);

    expect(parsed.tracks).toHaveLength(2);
    expect(parsed.tracks[0].name).toBe('Piano');
    expect(parsed.tracks[0].notes[0].pitch).toBe(60);
    expect(parsed.tracks[1].name).toBe('Bass');
    expect(parsed.tracks[1].notes[0].pitch).toBe(36);
  });
});
