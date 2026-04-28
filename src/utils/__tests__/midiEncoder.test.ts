import { describe, it, expect } from 'vitest';
import { encodeMidiFile, type MidiExportTrack } from '../midiEncoder';
import type { MidiNote } from '../../types/project';

function makeNote(overrides: Partial<MidiNote> = {}): MidiNote {
  return {
    id: 'test-note-1',
    pitch: 60,
    startBeat: 0,
    durationBeats: 1,
    velocity: 0.8,
    ...overrides,
  };
}

function readBytes(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer);
}

function readString(bytes: Uint8Array, offset: number, length: number): string {
  let str = '';
  for (let i = 0; i < length; i++) {
    str += String.fromCharCode(bytes[offset + i]);
  }
  return str;
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
}

// ─── MIDI File Structure ────────────────────────────────────────────────────

describe('encodeMidiFile', () => {
  it('produces a valid MIDI file header (MThd)', () => {
    const buffer = encodeMidiFile([makeNote()]);
    const bytes = readBytes(buffer);
    expect(readString(bytes, 0, 4)).toBe('MThd');
    expect(readUint32BE(bytes, 4)).toBe(6); // header length
    expect(readUint16BE(bytes, 8)).toBe(1); // format 1
  });

  it('sets TPQN to 480', () => {
    const buffer = encodeMidiFile([makeNote()]);
    const bytes = readBytes(buffer);
    expect(readUint16BE(bytes, 12)).toBe(480);
  });

  it('creates 2 tracks for single-track input (tempo + notes)', () => {
    const buffer = encodeMidiFile([makeNote()]);
    const bytes = readBytes(buffer);
    expect(readUint16BE(bytes, 10)).toBe(2); // 2 tracks
  });

  it('creates correct number of tracks for multi-track input', () => {
    const tracks: MidiExportTrack[] = [
      { name: 'Track 1', channel: 0, notes: [makeNote()] },
      { name: 'Track 2', channel: 1, notes: [makeNote({ pitch: 64 })] },
      { name: 'Track 3', channel: 2, notes: [makeNote({ pitch: 67 })] },
    ];
    const buffer = encodeMidiFile(tracks);
    const bytes = readBytes(buffer);
    // 1 tempo track + 3 note tracks = 4
    expect(readUint16BE(bytes, 10)).toBe(4);
  });

  it('handles empty input gracefully', () => {
    const buffer = encodeMidiFile([]);
    const bytes = readBytes(buffer);
    expect(readString(bytes, 0, 4)).toBe('MThd');
    // 1 track (tempo only)
    expect(readUint16BE(bytes, 10)).toBe(1);
  });

  it('produces track chunks starting with MTrk', () => {
    const buffer = encodeMidiFile([makeNote()]);
    const bytes = readBytes(buffer);
    // First track chunk starts at offset 14
    expect(readString(bytes, 14, 4)).toBe('MTrk');
  });

  it('encodes tempo correctly', () => {
    const buffer = encodeMidiFile([makeNote()], { bpm: 120 });
    const bytes = readBytes(buffer);

    // Find tempo meta event (FF 51 03 xx xx xx) in tempo track
    // Tempo track starts at offset 14 (after MThd header)
    // Track data starts at offset 14 + 8 = 22 (after MTrk + length)
    const trackDataStart = 22;
    // Expected: delta=0 (00), FF 51 03, then 3 bytes of microseconds per quarter
    // 120 BPM = 500000 μs/quarter = 0x07A120
    let found = false;
    for (let i = trackDataStart; i < bytes.length - 5; i++) {
      if (bytes[i] === 0xff && bytes[i + 1] === 0x51 && bytes[i + 2] === 0x03) {
        const micros = (bytes[i + 3] << 16) | (bytes[i + 4] << 8) | bytes[i + 5];
        expect(micros).toBe(500000); // 60000000 / 120
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('encodes a different BPM correctly', () => {
    const buffer = encodeMidiFile([makeNote()], { bpm: 140 });
    const bytes = readBytes(buffer);
    const trackDataStart = 22;
    let found = false;
    for (let i = trackDataStart; i < bytes.length - 5; i++) {
      if (bytes[i] === 0xff && bytes[i + 1] === 0x51 && bytes[i + 2] === 0x03) {
        const micros = (bytes[i + 3] << 16) | (bytes[i + 4] << 8) | bytes[i + 5];
        expect(micros).toBe(Math.round(60000000 / 140));
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('defaults to 120 BPM when not specified', () => {
    const buffer = encodeMidiFile([makeNote()]);
    const bytes = readBytes(buffer);
    const trackDataStart = 22;
    let found = false;
    for (let i = trackDataStart; i < bytes.length - 5; i++) {
      if (bytes[i] === 0xff && bytes[i + 1] === 0x51 && bytes[i + 2] === 0x03) {
        const micros = (bytes[i + 3] << 16) | (bytes[i + 4] << 8) | bytes[i + 5];
        expect(micros).toBe(500000);
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('includes time signature meta event when specified', () => {
    const buffer = encodeMidiFile([makeNote()], {
      timeSignature: { bar: 1, numerator: 3, denominator: 4 },
    });
    const bytes = readBytes(buffer);
    // Look for time signature meta event: FF 58 04 nn dd cc bb
    let found = false;
    for (let i = 0; i < bytes.length - 6; i++) {
      if (bytes[i] === 0xff && bytes[i + 1] === 0x58 && bytes[i + 2] === 0x04) {
        expect(bytes[i + 3]).toBe(3); // numerator
        expect(bytes[i + 4]).toBe(2); // denominator power (log2(4) = 2)
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('encodes note-on and note-off events', () => {
    const note = makeNote({ pitch: 60, velocity: 1.0, startBeat: 0, durationBeats: 1 });
    const buffer = encodeMidiFile([note]);
    const bytes = readBytes(buffer);

    // Find note-on event (9x pp vv) where x=channel, pp=pitch, vv=velocity
    let foundOn = false;
    let foundOff = false;
    for (let i = 0; i < bytes.length - 2; i++) {
      if ((bytes[i] & 0xf0) === 0x90 && bytes[i + 1] === 60) {
        expect(bytes[i + 2]).toBe(127); // velocity 1.0 → 127
        foundOn = true;
      }
      if ((bytes[i] & 0xf0) === 0x80 && bytes[i + 1] === 60) {
        foundOff = true;
      }
    }
    expect(foundOn).toBe(true);
    expect(foundOff).toBe(true);
  });

  it('clamps velocity to 0-127 range', () => {
    const note = makeNote({ velocity: 1.5 }); // exceeds 1.0
    const buffer = encodeMidiFile([note]);
    const bytes = readBytes(buffer);

    let found = false;
    for (let i = 0; i < bytes.length - 2; i++) {
      if ((bytes[i] & 0xf0) === 0x90 && bytes[i + 1] === 60) {
        expect(bytes[i + 2]).toBeLessThanOrEqual(127);
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('handles zero velocity note', () => {
    const note = makeNote({ velocity: 0 });
    const buffer = encodeMidiFile([note]);
    const bytes = readBytes(buffer);

    let found = false;
    for (let i = 0; i < bytes.length - 2; i++) {
      if ((bytes[i] & 0xf0) === 0x90 && bytes[i + 1] === 60) {
        expect(bytes[i + 2]).toBe(0);
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('encodes multiple notes correctly', () => {
    const notes = [
      makeNote({ id: 'n1', pitch: 60, startBeat: 0, durationBeats: 1 }),
      makeNote({ id: 'n2', pitch: 64, startBeat: 1, durationBeats: 1 }),
      makeNote({ id: 'n3', pitch: 67, startBeat: 2, durationBeats: 1 }),
    ];
    const buffer = encodeMidiFile(notes);
    const bytes = readBytes(buffer);

    // All three pitches should appear in note-on events
    const pitchesFound = new Set<number>();
    for (let i = 0; i < bytes.length - 2; i++) {
      if ((bytes[i] & 0xf0) === 0x90) {
        pitchesFound.add(bytes[i + 1]);
      }
    }
    expect(pitchesFound.has(60)).toBe(true);
    expect(pitchesFound.has(64)).toBe(true);
    expect(pitchesFound.has(67)).toBe(true);
  });

  it('respects channel assignment in multi-track export', () => {
    const tracks: MidiExportTrack[] = [
      { name: 'Bass', channel: 1, notes: [makeNote({ pitch: 36 })] },
      { name: 'Lead', channel: 5, notes: [makeNote({ pitch: 72 })] },
    ];
    const buffer = encodeMidiFile(tracks);
    const bytes = readBytes(buffer);

    // Channel 1: note-on = 0x91
    let foundCh1 = false;
    let foundCh5 = false;
    for (let i = 0; i < bytes.length - 2; i++) {
      if (bytes[i] === 0x91 && bytes[i + 1] === 36) foundCh1 = true;
      if (bytes[i] === 0x95 && bytes[i + 1] === 72) foundCh5 = true;
    }
    expect(foundCh1).toBe(true);
    expect(foundCh5).toBe(true);
  });

  it('each track ends with end-of-track meta event (FF 2F 00)', () => {
    const buffer = encodeMidiFile([makeNote()]);
    const bytes = readBytes(buffer);

    // Count end-of-track events
    let eotCount = 0;
    for (let i = 0; i < bytes.length - 2; i++) {
      if (bytes[i] === 0xff && bytes[i + 1] === 0x2f && bytes[i + 2] === 0x00) {
        eotCount++;
      }
    }
    // 2 tracks (tempo + notes) = 2 EOT events
    expect(eotCount).toBe(2);
  });

  it('returns an ArrayBuffer', () => {
    const result = encodeMidiFile([makeNote()]);
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(result.byteLength).toBeGreaterThan(14); // at least header
  });
});
