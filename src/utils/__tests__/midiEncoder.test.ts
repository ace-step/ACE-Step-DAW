import { describe, it, expect } from 'vitest';
import { encodeMidiFile, type MidiExportTrack } from '../midiEncoder';
import type { MidiNote } from '../../types/project';

/** Helper to create a MidiNote with default id */
function note(pitch: number, startBeat: number, durationBeats: number, velocity = 0.8): MidiNote {
  return { id: `n-${pitch}-${startBeat}`, pitch, startBeat, durationBeats, velocity };
}

/** Read a big-endian uint32 from a DataView */
function readU32(dv: DataView, offset: number): number {
  return dv.getUint32(offset, false);
}

/** Read a big-endian uint16 from a DataView */
function readU16(dv: DataView, offset: number): number {
  return dv.getUint16(offset, false);
}

/** Read 4-char ASCII chunk id */
function readChunkId(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

/** Parse a variable-length quantity starting at offset, return [value, bytesConsumed] */
function readVLQ(bytes: Uint8Array, offset: number): [number, number] {
  let value = 0;
  let consumed = 0;
  let b: number;
  do {
    b = bytes[offset + consumed];
    value = (value << 7) | (b & 0x7f);
    consumed++;
  } while (b & 0x80);
  return [value, consumed];
}

describe('encodeMidiFile', () => {
  describe('MIDI file header', () => {
    it('starts with MThd chunk with correct format, TPQN, and track count', () => {
      const buf = encodeMidiFile([note(60, 0, 1)]);
      const bytes = new Uint8Array(buf);
      const dv = new DataView(buf);

      expect(readChunkId(bytes, 0)).toBe('MThd');
      expect(readU32(dv, 4)).toBe(6); // header data length
      expect(readU16(dv, 8)).toBe(1); // format 1
      expect(readU16(dv, 10)).toBe(2); // 2 tracks: tempo + note track
      expect(readU16(dv, 12)).toBe(480); // TPQN
    });

    it('has 1 track (tempo only) for empty input', () => {
      const buf = encodeMidiFile([]);
      const dv = new DataView(buf);

      expect(readU16(dv, 10)).toBe(1); // only tempo track
    });

    it('has N+1 tracks for N MidiExportTracks', () => {
      const tracks: MidiExportTrack[] = [
        { name: 'Track 1', channel: 0, notes: [note(60, 0, 1)] },
        { name: 'Track 2', channel: 1, notes: [note(64, 0, 1)] },
        { name: 'Track 3', channel: 2, notes: [note(67, 0, 1)] },
      ];
      const buf = encodeMidiFile(tracks);
      const dv = new DataView(buf);

      expect(readU16(dv, 10)).toBe(4); // 1 tempo + 3 note tracks
    });
  });

  describe('tempo track', () => {
    it('encodes default 120 BPM when no bpm option given', () => {
      const buf = encodeMidiFile([note(60, 0, 1)]);
      const bytes = new Uint8Array(buf);

      // After header (14 bytes), first MTrk chunk
      expect(readChunkId(bytes, 14)).toBe('MTrk');

      // Tempo meta event: delta=0, 0xFF 0x51 0x03 <3 bytes>
      // 120 BPM = 500000 microseconds/quarter = 0x07A120
      const trackDataStart = 22; // 14 (header) + 4 (MTrk) + 4 (length)
      expect(bytes[trackDataStart]).toBe(0x00); // delta
      expect(bytes[trackDataStart + 1]).toBe(0xff); // meta
      expect(bytes[trackDataStart + 2]).toBe(0x51); // tempo type
      expect(bytes[trackDataStart + 3]).toBe(0x03); // data length
      expect(bytes[trackDataStart + 4]).toBe(0x07); // 500000 >> 16
      expect(bytes[trackDataStart + 5]).toBe(0xa1); // (500000 >> 8) & 0xff
      expect(bytes[trackDataStart + 6]).toBe(0x20); // 500000 & 0xff
    });

    it('encodes custom BPM correctly', () => {
      const buf = encodeMidiFile([note(60, 0, 1)], { bpm: 140 });
      const bytes = new Uint8Array(buf);

      // 140 BPM = 60000000/140 = 428571 microseconds = 0x068DB3 (rounded)
      const microsPerQuarter = Math.round(60000000 / 140);
      const trackDataStart = 22;
      const encoded = (bytes[trackDataStart + 4] << 16) | (bytes[trackDataStart + 5] << 8) | bytes[trackDataStart + 6];
      expect(encoded).toBe(microsPerQuarter);
    });

    it('includes time signature meta event when provided', () => {
      const buf = encodeMidiFile([note(60, 0, 1)], {
        timeSignature: { bar: 1, numerator: 3, denominator: 4 },
      });
      const bytes = new Uint8Array(buf);

      // Find time signature meta event (0xFF 0x58) in the tempo track
      const trackDataStart = 22;
      // After tempo event (7 bytes: delta + FF 51 03 + 3 data bytes)
      const tsOffset = trackDataStart + 7;
      expect(bytes[tsOffset]).toBe(0x00); // delta
      expect(bytes[tsOffset + 1]).toBe(0xff); // meta
      expect(bytes[tsOffset + 2]).toBe(0x58); // time signature type
      expect(bytes[tsOffset + 3]).toBe(0x04); // data length
      expect(bytes[tsOffset + 4]).toBe(3); // numerator
      expect(bytes[tsOffset + 5]).toBe(2); // log2(4) = 2
      expect(bytes[tsOffset + 6]).toBe(0x18); // MIDI clocks per metronome click
      expect(bytes[tsOffset + 7]).toBe(0x08); // 32nd notes per MIDI quarter note
    });

    it('encodes 6/8 time signature denominator as log2(8)=3', () => {
      const buf = encodeMidiFile([], {
        timeSignature: { bar: 1, numerator: 6, denominator: 8 },
      });
      const bytes = new Uint8Array(buf);
      const trackDataStart = 22;
      const tsOffset = trackDataStart + 7;
      expect(bytes[tsOffset + 4]).toBe(6); // numerator
      expect(bytes[tsOffset + 5]).toBe(3); // log2(8)
    });
  });

  describe('note encoding', () => {
    it('encodes a single note with correct pitch and velocity', () => {
      const buf = encodeMidiFile([note(60, 0, 1, 1.0)]);
      const bytes = new Uint8Array(buf);
      const dv = new DataView(buf);

      // Skip header (14) and tempo track (4 + 4 + track data)
      const tempoTrackLen = readU32(dv, 18);
      const noteTrackStart = 14 + 8 + tempoTrackLen;

      expect(readChunkId(bytes, noteTrackStart)).toBe('MTrk');
      const noteTrackDataStart = noteTrackStart + 8;

      // Find note-on event (skip track name meta event)
      let pos = noteTrackDataStart;
      // Skip track name: delta=0, FF 03, VLQ(len), name bytes
      const [, deltaLen] = readVLQ(bytes, pos);
      pos += deltaLen; // skip delta
      pos++; // skip 0xFF
      pos++; // skip 0x03
      const [nameLen, nameLenBytes] = readVLQ(bytes, pos);
      pos += nameLenBytes + nameLen;

      // Now at note-on event
      const [noteOnDelta, noteOnDeltaLen] = readVLQ(bytes, pos);
      pos += noteOnDeltaLen;
      expect(noteOnDelta).toBe(0); // note starts at beat 0
      expect(bytes[pos]).toBe(0x90); // note on, channel 0
      expect(bytes[pos + 1]).toBe(60); // pitch
      expect(bytes[pos + 2]).toBe(127); // velocity 1.0 * 127
    });

    it('encodes velocity 0.5 as MIDI velocity 64', () => {
      const buf = encodeMidiFile([note(60, 0, 1, 0.5)]);
      const bytes = new Uint8Array(buf);
      const dv = new DataView(buf);

      const tempoTrackLen = readU32(dv, 18);
      const noteTrackDataStart = 14 + 8 + tempoTrackLen + 8;

      // Find first 0x90 byte (note-on)
      let pos = noteTrackDataStart;
      while (pos < bytes.length && bytes[pos] !== 0x90) pos++;
      expect(bytes[pos + 2]).toBe(64); // Math.round(0.5 * 127)
    });

    it('clamps velocity above 1.0 to 127', () => {
      const buf = encodeMidiFile([note(60, 0, 1, 1.5)]);
      const bytes = new Uint8Array(buf);
      const dv = new DataView(buf);

      const tempoTrackLen = readU32(dv, 18);
      const noteTrackDataStart = 14 + 8 + tempoTrackLen + 8;

      let pos = noteTrackDataStart;
      while (pos < bytes.length && bytes[pos] !== 0x90) pos++;
      expect(bytes[pos + 2]).toBe(127);
    });

    it('clamps velocity below 0 to 0', () => {
      const buf = encodeMidiFile([note(60, 0, 1, -0.5)]);
      const bytes = new Uint8Array(buf);
      const dv = new DataView(buf);

      const tempoTrackLen = readU32(dv, 18);
      const noteTrackDataStart = 14 + 8 + tempoTrackLen + 8;

      let pos = noteTrackDataStart;
      while (pos < bytes.length && bytes[pos] !== 0x90) pos++;
      expect(bytes[pos + 2]).toBe(0);
    });

    it('encodes note duration as delta between note-on and note-off', () => {
      // 2 beats at 480 TPQN = 960 ticks
      const buf = encodeMidiFile([note(60, 0, 2, 0.8)]);
      const bytes = new Uint8Array(buf);
      const dv = new DataView(buf);

      const tempoTrackLen = readU32(dv, 18);
      const noteTrackDataStart = 14 + 8 + tempoTrackLen + 8;

      // Find note-on (0x90), then note-off (0x80) after it
      let pos = noteTrackDataStart;
      while (pos < bytes.length && bytes[pos] !== 0x90) pos++;
      pos += 3; // skip note-on event (status + pitch + velocity)

      // Read delta before note-off
      const [offDelta] = readVLQ(bytes, pos);
      expect(offDelta).toBe(960); // 2 beats * 480
    });

    it('encodes note starting at beat 4 with correct delta', () => {
      const buf = encodeMidiFile([note(60, 4, 1, 0.8)]);
      const bytes = new Uint8Array(buf);
      const dv = new DataView(buf);

      const tempoTrackLen = readU32(dv, 18);
      const noteTrackDataStart = 14 + 8 + tempoTrackLen + 8;

      // Find note-on (0x90)
      let pos = noteTrackDataStart;
      // Skip track name meta event
      const [, d1] = readVLQ(bytes, pos);
      pos += d1;
      pos++; // 0xFF
      pos++; // 0x03
      const [nLen, nLenB] = readVLQ(bytes, pos);
      pos += nLenB + nLen;

      // Delta before note-on should be 4 * 480 = 1920
      const [noteOnDelta] = readVLQ(bytes, pos);
      expect(noteOnDelta).toBe(1920);
    });
  });

  describe('edge cases', () => {
    it('handles empty note array gracefully', () => {
      const buf = encodeMidiFile([]);
      const bytes = new Uint8Array(buf);

      expect(readChunkId(bytes, 0)).toBe('MThd');
      expect(bytes.length).toBeGreaterThan(14); // at least header + tempo track
    });

    it('encodes lowest MIDI pitch (0)', () => {
      const buf = encodeMidiFile([note(0, 0, 1)]);
      const bytes = new Uint8Array(buf);
      const dv = new DataView(buf);

      const tempoTrackLen = readU32(dv, 18);
      const noteTrackDataStart = 14 + 8 + tempoTrackLen + 8;

      let pos = noteTrackDataStart;
      while (pos < bytes.length && bytes[pos] !== 0x90) pos++;
      expect(bytes[pos + 1]).toBe(0);
    });

    it('encodes highest MIDI pitch (127)', () => {
      const buf = encodeMidiFile([note(127, 0, 1)]);
      const bytes = new Uint8Array(buf);
      const dv = new DataView(buf);

      const tempoTrackLen = readU32(dv, 18);
      const noteTrackDataStart = 14 + 8 + tempoTrackLen + 8;

      let pos = noteTrackDataStart;
      while (pos < bytes.length && bytes[pos] !== 0x90) pos++;
      expect(bytes[pos + 1]).toBe(127);
    });

    it('encodes a chord (simultaneous notes) with correct pitches', () => {
      const notes = [note(60, 0, 1), note(64, 0, 1), note(67, 0, 1)];
      const buf = encodeMidiFile(notes);
      const bytes = new Uint8Array(buf);
      const dv = new DataView(buf);

      const tempoTrackLen = readU32(dv, 18);
      const noteTrackDataStart = 14 + 8 + tempoTrackLen + 8;

      // Collect all note-on pitches
      const pitches: number[] = [];
      for (let pos = noteTrackDataStart; pos < bytes.length - 2; pos++) {
        if (bytes[pos] === 0x90) {
          pitches.push(bytes[pos + 1]);
        }
      }
      // note-offs come first for simultaneous events (sort order), but all 3 on-events exist
      expect(pitches.sort()).toEqual([60, 64, 67]);
    });

    it('orders note-off before note-on at the same tick', () => {
      // Two notes: first ends at beat 2, second starts at beat 2
      const notes = [note(60, 0, 2), note(64, 2, 2)];
      const buf = encodeMidiFile(notes);
      const bytes = new Uint8Array(buf);
      const dv = new DataView(buf);

      const tempoTrackLen = readU32(dv, 18);
      const noteTrackDataStart = 14 + 8 + tempoTrackLen + 8;

      // Find the sequence of events at tick 960 (beat 2)
      // After note-on for pitch 60 at tick 0, we should see note-off 60 then note-on 64
      const events: Array<{ status: number; pitch: number }> = [];
      let pos = noteTrackDataStart;
      // Skip track name meta
      while (pos < bytes.length) {
        if (bytes[pos] === 0x80 || bytes[pos] === 0x90) {
          events.push({ status: bytes[pos], pitch: bytes[pos + 1] });
          pos += 3;
        } else if (bytes[pos] === 0xff) {
          // meta event — skip
          pos++; // FF
          pos++; // type
          const [len, lenBytes] = readVLQ(bytes, pos);
          pos += lenBytes + len;
        } else {
          pos++;
        }
      }

      // Events should be: note-on 60, note-off 60, note-on 64, note-off 64
      expect(events.length).toBe(4);
      expect(events[0]).toEqual({ status: 0x90, pitch: 60 });
      expect(events[1]).toEqual({ status: 0x80, pitch: 60 });
      expect(events[2]).toEqual({ status: 0x90, pitch: 64 });
      expect(events[3]).toEqual({ status: 0x80, pitch: 64 });
    });
  });

  describe('multi-track export', () => {
    it('encodes multiple tracks on different channels', () => {
      const tracks: MidiExportTrack[] = [
        { name: 'Piano', channel: 0, notes: [note(60, 0, 1)] },
        { name: 'Bass', channel: 1, notes: [note(36, 0, 2)] },
      ];
      const buf = encodeMidiFile(tracks);
      const bytes = new Uint8Array(buf);
      const dv = new DataView(buf);

      expect(readU16(dv, 10)).toBe(3); // tempo + 2 note tracks

      // Find note-on events and check channels
      const noteOns: Array<{ channel: number; pitch: number }> = [];
      for (let pos = 0; pos < bytes.length - 2; pos++) {
        if ((bytes[pos] & 0xf0) === 0x90) {
          noteOns.push({ channel: bytes[pos] & 0x0f, pitch: bytes[pos + 1] });
        }
      }

      expect(noteOns).toContainEqual({ channel: 0, pitch: 60 });
      expect(noteOns).toContainEqual({ channel: 1, pitch: 36 });
    });

    it('uses channel 9 for drums', () => {
      const tracks: MidiExportTrack[] = [
        { name: 'Drums', channel: 9, notes: [note(36, 0, 0.5)] },
      ];
      const buf = encodeMidiFile(tracks);
      const bytes = new Uint8Array(buf);

      let found = false;
      for (let pos = 0; pos < bytes.length - 2; pos++) {
        if (bytes[pos] === (0x90 | 9)) {
          expect(bytes[pos + 1]).toBe(36);
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });
  });

  describe('single-track options', () => {
    it('uses provided trackName option', () => {
      const buf = encodeMidiFile([note(60, 0, 1)], { trackName: 'My Piano' });
      const bytes = new Uint8Array(buf);
      const dv = new DataView(buf);

      const tempoTrackLen = readU32(dv, 18);
      const noteTrackDataStart = 14 + 8 + tempoTrackLen + 8;

      // Track name meta event: delta=0, FF 03, len, "My Piano"
      let pos = noteTrackDataStart;
      const [delta, dLen] = readVLQ(bytes, pos);
      pos += dLen;
      expect(delta).toBe(0);
      expect(bytes[pos]).toBe(0xff);
      expect(bytes[pos + 1]).toBe(0x03);
      pos += 2;
      const [nameLen, nameLenBytes] = readVLQ(bytes, pos);
      pos += nameLenBytes;
      const nameBytes = bytes.slice(pos, pos + nameLen);
      const name = new TextDecoder().decode(nameBytes);
      expect(name).toBe('My Piano');
    });

    it('defaults trackName to "MIDI Track 1"', () => {
      const buf = encodeMidiFile([note(60, 0, 1)]);
      const bytes = new Uint8Array(buf);
      const dv = new DataView(buf);

      const tempoTrackLen = readU32(dv, 18);
      const noteTrackDataStart = 14 + 8 + tempoTrackLen + 8;

      let pos = noteTrackDataStart;
      pos++; // delta = 0
      pos += 2; // FF 03
      const [nameLen, nameLenBytes] = readVLQ(bytes, pos);
      pos += nameLenBytes;
      const name = new TextDecoder().decode(bytes.slice(pos, pos + nameLen));
      expect(name).toBe('MIDI Track 1');
    });
  });

  describe('output is valid ArrayBuffer', () => {
    it('returns an ArrayBuffer instance', () => {
      const buf = encodeMidiFile([note(60, 0, 1)]);
      expect(buf).toBeInstanceOf(ArrayBuffer);
    });

    it('every MTrk chunk length matches actual data', () => {
      const buf = encodeMidiFile([
        note(60, 0, 1),
        note(64, 1, 1),
        note(67, 2, 1),
      ]);
      const bytes = new Uint8Array(buf);
      const dv = new DataView(buf);

      let pos = 14; // skip MThd header
      const trackCount = readU16(dv, 10);
      for (let i = 0; i < trackCount; i++) {
        expect(readChunkId(bytes, pos)).toBe('MTrk');
        const chunkLen = readU32(dv, pos + 4);
        pos += 8 + chunkLen;
      }
      // Should have consumed all bytes
      expect(pos).toBe(bytes.length);
    });

    it('every track ends with End of Track meta event (FF 2F 00)', () => {
      const buf = encodeMidiFile([note(60, 0, 1), note(72, 0, 2)]);
      const bytes = new Uint8Array(buf);
      const dv = new DataView(buf);

      let pos = 14;
      const trackCount = readU16(dv, 10);
      for (let i = 0; i < trackCount; i++) {
        const chunkLen = readU32(dv, pos + 4);
        const trackEnd = pos + 8 + chunkLen;
        // Last 4 bytes of track data: delta(00) FF 2F 00
        expect(bytes[trackEnd - 3]).toBe(0xff);
        expect(bytes[trackEnd - 2]).toBe(0x2f);
        expect(bytes[trackEnd - 1]).toBe(0x00);
        pos = trackEnd;
      }
    });
  });

  describe('fractional beats and VLQ encoding', () => {
    it('encodes fractional beat positions correctly', () => {
      // Start at beat 0.5 = 240 ticks
      const buf = encodeMidiFile([note(60, 0.5, 0.5, 0.8)]);
      const bytes = new Uint8Array(buf);
      const dv = new DataView(buf);

      const tempoTrackLen = readU32(dv, 18);
      const noteTrackDataStart = 14 + 8 + tempoTrackLen + 8;

      // Skip track name
      let pos = noteTrackDataStart;
      const [, d1] = readVLQ(bytes, pos);
      pos += d1;
      pos++; // FF
      pos++; // 03
      const [nLen, nLenB] = readVLQ(bytes, pos);
      pos += nLenB + nLen;

      // Note-on delta should be 240 ticks
      const [noteOnDelta] = readVLQ(bytes, pos);
      expect(noteOnDelta).toBe(240);
    });

    it('encodes large tick values using multi-byte VLQ', () => {
      // Start at beat 100 = 48000 ticks — requires multi-byte VLQ
      const buf = encodeMidiFile([note(60, 100, 1, 0.8)]);
      const bytes = new Uint8Array(buf);
      const dv = new DataView(buf);

      const tempoTrackLen = readU32(dv, 18);
      const noteTrackDataStart = 14 + 8 + tempoTrackLen + 8;

      // Skip track name
      let pos = noteTrackDataStart;
      const [, d1] = readVLQ(bytes, pos);
      pos += d1;
      pos++; // FF
      pos++; // 03
      const [nLen, nLenB] = readVLQ(bytes, pos);
      pos += nLenB + nLen;

      const [noteOnDelta, deltaBytes] = readVLQ(bytes, pos);
      expect(noteOnDelta).toBe(48000);
      expect(deltaBytes).toBeGreaterThan(1); // multi-byte VLQ
    });
  });
});
