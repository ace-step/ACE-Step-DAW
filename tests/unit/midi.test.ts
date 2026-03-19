import { describe, expect, it } from 'vitest';
import { encodeMidiFile, parseMidiFile } from '../../src/utils/midi';

function textBytes(value: string) {
  return [...new TextEncoder().encode(value)];
}

function vlq(value: number): number[] {
  const buffer = [value & 0x7f];
  let remaining = value >> 7;

  while (remaining > 0) {
    buffer.unshift((remaining & 0x7f) | 0x80);
    remaining >>= 7;
  }

  return buffer;
}

function meta(delta: number, type: number, data: number[]) {
  return [...vlq(delta), 0xff, type, ...vlq(data.length), ...data];
}

function midi(delta: number, status: number, data: number[]) {
  return [...vlq(delta), status, ...data];
}

function trackChunk(events: number[]) {
  const bytes = Uint8Array.from(events);
  return [
    ...textBytes('MTrk'),
    (bytes.length >>> 24) & 0xff,
    (bytes.length >>> 16) & 0xff,
    (bytes.length >>> 8) & 0xff,
    bytes.length & 0xff,
    ...bytes,
  ];
}

function midiFile(format: number, tracks: number[][], division: number = 480) {
  const header = [
    ...textBytes('MThd'),
    0x00, 0x00, 0x00, 0x06,
    0x00, format,
    0x00, tracks.length,
    (division >>> 8) & 0xff,
    division & 0xff,
  ];
  return Uint8Array.from([
    ...header,
    ...tracks.flatMap((events) => trackChunk(events)),
  ]).buffer;
}

describe('parseMidiFile', () => {
  it('parses notes, tempo, time signature, and track names from a type 1 file', () => {
    const tempoTrack = [
      meta(0, 0x03, textBytes('Conductor')),
      meta(0, 0x51, [0x07, 0xa1, 0x20]), // 120 BPM
      meta(0, 0x58, [0x04, 0x02, 0x18, 0x08]), // 4/4
      meta(0, 0x2f, []),
    ].flat();

    const pianoTrack = [
      meta(0, 0x03, textBytes('Piano')),
      midi(0, 0x90, [60, 100]),
      midi(480, 0x80, [60, 0]),
      midi(0, 0x90, [64, 80]),
      midi(240, 0x80, [64, 0]),
      meta(0, 0x2f, []),
    ].flat();

    const parsed = parseMidiFile(midiFile(1, [tempoTrack, pianoTrack]));

    expect(parsed.bpm).toBe(120);
    expect(parsed.timeSignature).toEqual({ bar: 1, numerator: 4, denominator: 4 });
    expect(parsed.tracks).toHaveLength(1);
    expect(parsed.tracks[0].name).toBe('Piano');
    expect(parsed.tracks[0].notes).toEqual([
      { pitch: 60, startBeat: 0, durationBeats: 1, velocity: 100 / 127 },
      { pitch: 64, startBeat: 1, durationBeats: 0.5, velocity: 80 / 127 },
    ]);
  });

  it('splits a type 0 file into separate imported tracks by MIDI channel', () => {
    const mergedTrack = [
      meta(0, 0x03, textBytes('Merged')),
      midi(0, 0x90, [60, 96]),
      midi(0, 0x91, [67, 64]),
      midi(480, 0x80, [60, 0]),
      midi(0, 0x81, [67, 0]),
      meta(0, 0x2f, []),
    ].flat();

    const parsed = parseMidiFile(midiFile(0, [mergedTrack]));

    expect(parsed.tracks).toHaveLength(2);
    expect(parsed.tracks.map((track) => track.name)).toEqual(['Merged Ch 1', 'Merged Ch 2']);
    expect(parsed.tracks[0].channel).toBe(0);
    expect(parsed.tracks[1].channel).toBe(1);
    expect(parsed.tracks[0].notes[0]).toMatchObject({ pitch: 60, startBeat: 0, durationBeats: 1 });
    expect(parsed.tracks[1].notes[0]).toMatchObject({ pitch: 67, startBeat: 0, durationBeats: 1 });
  });

  it('throws on invalid MIDI header', () => {
    const badData = new Uint8Array([0x00, 0x01, 0x02]).buffer;
    expect(() => parseMidiFile(badData)).toThrow('Invalid MIDI header');
  });

  it('returns empty tracks array for a file with no note events', () => {
    const emptyTrack = [
      meta(0, 0x03, textBytes('Empty')),
      meta(0, 0x2f, []),
    ].flat();

    const parsed = parseMidiFile(midiFile(0, [emptyTrack]));
    expect(parsed.tracks).toHaveLength(0);
  });

  it('handles running status (repeated note-on without re-sending status byte)', () => {
    // Running status: after a note-on, subsequent data bytes reuse the status.
    // We send the first note-on with a full status byte, then the note-off and
    // second note use running status (data bytes only, no status byte).
    const trackEvents = [
      // First note-on with full status byte
      ...midi(0, 0x90, [60, 100]),
      // Note-off via running status note-on with velocity 0
      ...vlq(480), 60, 0,
      // Second note via running status
      ...vlq(0), 64, 90,
      // Second note-off via running status
      ...vlq(240), 64, 0,
      ...meta(0, 0x2f, []),
    ];

    const parsed = parseMidiFile(midiFile(0, [trackEvents]));
    expect(parsed.tracks).toHaveLength(1);
    expect(parsed.tracks[0].notes).toHaveLength(2);
    expect(parsed.tracks[0].notes[0]).toMatchObject({ pitch: 60, startBeat: 0, durationBeats: 1 });
    expect(parsed.tracks[0].notes[1]).toMatchObject({ pitch: 64, startBeat: 1, durationBeats: 0.5 });
  });

  it('normalizes velocity to 0-1 range', () => {
    const trackEvents = [
      midi(0, 0x90, [60, 127]),  // max velocity
      midi(480, 0x80, [60, 0]),
      midi(0, 0x90, [62, 1]),    // min velocity
      midi(480, 0x80, [62, 0]),
      meta(0, 0x2f, []),
    ].flat();

    const parsed = parseMidiFile(midiFile(0, [trackEvents]));
    expect(parsed.tracks[0].notes[0].velocity).toBe(1);        // 127/127
    expect(parsed.tracks[0].notes[1].velocity).toBeCloseTo(1 / 127, 4);  // 1/127
  });

  it('parses tempo from meta event', () => {
    const microsPerQuarter = Math.round(60000000 / 140);
    const b0 = (microsPerQuarter >>> 16) & 0xff;
    const b1 = (microsPerQuarter >>> 8) & 0xff;
    const b2 = microsPerQuarter & 0xff;

    const trackEvents = [
      meta(0, 0x51, [b0, b1, b2]),
      midi(0, 0x90, [60, 80]),
      midi(480, 0x80, [60, 0]),
      meta(0, 0x2f, []),
    ].flat();

    const parsed = parseMidiFile(midiFile(0, [trackEvents]));
    expect(parsed.bpm).toBeCloseTo(140, 0);
  });

  it('uses default name for unnamed tracks', () => {
    const trackEvents = [
      midi(0, 0x90, [60, 80]),
      midi(480, 0x80, [60, 0]),
      meta(0, 0x2f, []),
    ].flat();

    const parsed = parseMidiFile(midiFile(0, [trackEvents]));
    expect(parsed.tracks[0].name).toBe('MIDI Track 1');
  });

  it('handles multi-track type 1 files with multiple instrument tracks', () => {
    const conductor = [
      meta(0, 0x51, [0x07, 0xa1, 0x20]), // 120 BPM
      meta(0, 0x2f, []),
    ].flat();

    const bass = [
      meta(0, 0x03, textBytes('Bass')),
      midi(0, 0x90, [36, 110]),
      midi(960, 0x80, [36, 0]),
      meta(0, 0x2f, []),
    ].flat();

    const lead = [
      meta(0, 0x03, textBytes('Lead')),
      midi(0, 0x90, [72, 90]),
      midi(480, 0x80, [72, 0]),
      meta(0, 0x2f, []),
    ].flat();

    const parsed = parseMidiFile(midiFile(1, [conductor, bass, lead]));
    expect(parsed.tracks).toHaveLength(2);
    expect(parsed.tracks[0].name).toBe('Bass');
    expect(parsed.tracks[0].notes[0]).toMatchObject({ pitch: 36, durationBeats: 2 });
    expect(parsed.tracks[1].name).toBe('Lead');
    expect(parsed.tracks[1].notes[0]).toMatchObject({ pitch: 72, durationBeats: 1 });
  });

  it('throws on SMPTE time division', () => {
    const header = [
      ...textBytes('MThd'),
      0x00, 0x00, 0x00, 0x06,
      0x00, 0x00, // format 0
      0x00, 0x01, // 1 track
      0x80, 0x00, // SMPTE division (bit 15 set)
    ];
    const track = trackChunk([...meta(0, 0x2f, [])]);
    const data = Uint8Array.from([...header, ...track]).buffer;
    expect(() => parseMidiFile(data)).toThrow('SMPTE');
  });

  it('ignores zero-duration notes', () => {
    const trackEvents = [
      midi(0, 0x90, [60, 100]),
      midi(0, 0x80, [60, 0]),   // immediate note-off = 0 duration
      midi(0, 0x90, [64, 80]),
      midi(480, 0x80, [64, 0]),
      meta(0, 0x2f, []),
    ].flat();

    const parsed = parseMidiFile(midiFile(0, [trackEvents]));
    expect(parsed.tracks[0].notes).toHaveLength(1);
    expect(parsed.tracks[0].notes[0].pitch).toBe(64);
  });

  it('parses time signature from meta event', () => {
    const trackEvents = [
      meta(0, 0x58, [0x03, 0x03, 0x18, 0x08]), // 3/8
      midi(0, 0x90, [60, 80]),
      midi(480, 0x80, [60, 0]),
      meta(0, 0x2f, []),
    ].flat();

    const parsed = parseMidiFile(midiFile(0, [trackEvents]));
    expect(parsed.timeSignature).toEqual({ bar: 1, numerator: 3, denominator: 8 });
  });
});

describe('encodeMidiFile', () => {
  it('round-trips MIDI notes with tempo, time signature, and track name metadata', () => {
    const bytes = encodeMidiFile([
      { pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 },
      { pitch: 67, startBeat: 1.5, durationBeats: 0.5, velocity: 96 },
    ], {
      bpm: 132,
      timeSignature: { numerator: 3, denominator: 4 },
      trackName: 'Exported Piano',
      clipDurationBeats: 4,
    });

    const parsed = parseMidiFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

    expect(parsed.format).toBe(0);
    expect(parsed.ticksPerQuarterNote).toBe(96);
    expect(parsed.bpm).toBe(132);
    expect(parsed.timeSignature).toEqual({ bar: 1, numerator: 3, denominator: 4 });
    expect(parsed.tracks).toHaveLength(1);
    expect(parsed.tracks[0].name).toBe('Exported Piano');
    expect(parsed.tracks[0].notes).toHaveLength(2);
    expect(parsed.tracks[0].notes[0]).toMatchObject({ pitch: 60, startBeat: 0, durationBeats: 1 });
    expect(parsed.tracks[0].notes[1]).toMatchObject({ pitch: 67, startBeat: 1.5, durationBeats: 0.5 });
    expect(parsed.tracks[0].notes[0].velocity).toBeCloseTo(0.8, 1);
    expect(parsed.tracks[0].notes[1].velocity).toBeCloseTo(96 / 127, 1);
  });
});
