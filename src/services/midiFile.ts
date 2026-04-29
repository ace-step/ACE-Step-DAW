/**
 * MIDI File Import/Export — Standard MIDI File (SMF) format support.
 *
 * Exports: Project → Type 1 MIDI file (multi-track)
 * Imports: MIDI file → parsed tracks/notes for project import
 *
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/974
 */

import type { Project } from '../types/project';

const TICKS_PER_BEAT = 480;

export interface MidiNoteEvent {
  pitch: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
  channel: number;
}

export interface MidiTrackData {
  name: string;
  channel: number;
  notes: MidiNoteEvent[];
}

export interface MidiFileData {
  format: number;
  ticksPerBeat: number;
  bpm: number;
  timeSignatureNumerator: number;
  timeSignatureDenominator: number;
  tracks: MidiTrackData[];
}

// ── Variable-length quantity encoding ──

function writeVLQ(value: number): number[] {
  if (value < 0) value = 0;
  const bytes: number[] = [];
  bytes.unshift(value & 0x7f);
  value >>= 7;
  while (value > 0) {
    bytes.unshift((value & 0x7f) | 0x80);
    value >>= 7;
  }
  return bytes;
}

function ensureAvailable(pos: number, count: number, limit: number, message: string): void {
  if (pos < 0 || count < 0 || pos + count > limit) {
    throw new Error(message);
  }
}

function readVLQ(data: Uint8Array, offset: number, limit = data.length): { value: number; length: number } {
  let value = 0;
  let length = 0;
  let byte: number;
  do {
    ensureAvailable(offset + length, 1, limit, 'Malformed MIDI file: truncated variable-length quantity');
    byte = data[offset + length];
    value = (value << 7) | (byte & 0x7f);
    length++;
    if (length > 4) {
      throw new Error('Malformed MIDI file: variable-length quantity too long');
    }
  } while (byte & 0x80);
  return { value, length };
}

// ── Helpers ──

function writeUint16BE(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function writeUint32BE(value: number): number[] {
  return [
    (value >> 24) & 0xff,
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff,
  ];
}

function writeString(str: string): number[] {
  return Array.from(new TextEncoder().encode(str));
}

function bpmToMicrosecondsPerBeat(bpm: number): number {
  return Math.round(60_000_000 / bpm);
}

function normalizeTimeSignatureDenominator(value: number | undefined): number {
  const denominator = value ?? 4;
  return denominator > 0 && Number.isInteger(denominator) && (denominator & (denominator - 1)) === 0
    ? denominator
    : 4;
}

// ── Export ──

function buildTempoTrack(project: Project): number[] {
  const events: number[] = [];

  // Track name meta event: FF 03 len "Tempo"
  const nameBytes = writeString('Tempo');
  events.push(...writeVLQ(0), 0xff, 0x03, ...writeVLQ(nameBytes.length), ...nameBytes);

  // Time signature meta event: FF 58 04 nn dd cc bb
  const ts = project.timeSignature || 4;
  const tsDenom = normalizeTimeSignatureDenominator(project.timeSignatureDenominator);
  const denomPower = Math.round(Math.log2(tsDenom));
  events.push(...writeVLQ(0), 0xff, 0x58, 0x04, ts, denomPower, 24, 8);

  // Tempo meta event: FF 51 03 tt tt tt
  const uspb = bpmToMicrosecondsPerBeat(project.bpm);
  events.push(
    ...writeVLQ(0), 0xff, 0x51, 0x03,
    (uspb >> 16) & 0xff,
    (uspb >> 8) & 0xff,
    uspb & 0xff,
  );

  // End of track: FF 2F 00
  events.push(...writeVLQ(0), 0xff, 0x2f, 0x00);

  return events;
}

function buildMidiTrack(
  trackName: string,
  notes: { pitch: number; startBeat: number; durationBeats: number; velocity: number }[],
  channel: number,
): number[] {
  const events: number[] = [];

  // Track name
  const nameBytes = writeString(trackName);
  events.push(...writeVLQ(0), 0xff, 0x03, ...writeVLQ(nameBytes.length), ...nameBytes);

  // Sort notes by start time then pitch
  const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch);

  // Build note-on/note-off events with absolute tick positions
  interface TimedEvent {
    tick: number;
    type: 'on' | 'off';
    pitch: number;
    velocity: number;
  }
  const timedEvents: TimedEvent[] = [];
  for (const note of sorted) {
    const onTick = Math.round(note.startBeat * TICKS_PER_BEAT);
    const offTick = Math.round((note.startBeat + note.durationBeats) * TICKS_PER_BEAT);
    timedEvents.push(
      { tick: onTick, type: 'on', pitch: note.pitch, velocity: note.velocity },
      { tick: offTick, type: 'off', pitch: note.pitch, velocity: 0 },
    );
  }

  // Sort by tick, note-offs before note-ons at same tick
  timedEvents.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    if (a.type !== b.type) return a.type === 'off' ? -1 : 1;
    return a.pitch - b.pitch;
  });

  let lastTick = 0;
  const ch = channel & 0x0f;
  for (const event of timedEvents) {
    const delta = event.tick - lastTick;
    lastTick = event.tick;
    const status = event.type === 'on' ? (0x90 | ch) : (0x80 | ch);
    events.push(...writeVLQ(delta), status, event.pitch & 0x7f, event.velocity & 0x7f);
  }

  // End of track
  events.push(...writeVLQ(0), 0xff, 0x2f, 0x00);

  return events;
}

function wrapTrackChunk(trackData: number[]): number[] {
  // MTrk + length + data
  const header = [...writeString('MTrk'), ...writeUint32BE(trackData.length)];
  return [...header, ...trackData];
}

export function exportProjectToMidi(project: Project): Uint8Array {
  // Collect MIDI-bearing tracks
  const midiTracks: { name: string; notes: { pitch: number; startBeat: number; durationBeats: number; velocity: number }[] }[] = [];

  for (const track of project.tracks) {
    if (track.trackType !== 'pianoRoll' && track.trackType !== 'drumMachine') continue;
    const notes: { pitch: number; startBeat: number; durationBeats: number; velocity: number }[] = [];
    for (const clip of track.clips) {
      if (!clip.midiData?.notes?.length) continue;
      // Convert clip-relative beat positions to project-absolute
      const clipStartBeat = (clip.startTime / 60) * project.bpm;
      for (const note of clip.midiData.notes) {
        notes.push({
          pitch: note.pitch,
          startBeat: clipStartBeat + note.startBeat,
          durationBeats: note.durationBeats,
          velocity: note.velocity,
        });
      }
    }
    if (notes.length > 0) {
      midiTracks.push({ name: track.displayName, notes });
    }
  }

  if (midiTracks.length > 16) {
    throw new Error('MIDI export supports up to 16 MIDI tracks');
  }

  const totalTrackCount = 1 + midiTracks.length; // tempo track + data tracks

  // Build header: MThd, length=6, format=1, nTracks, ticksPerBeat
  const header = [
    ...writeString('MThd'),
    ...writeUint32BE(6),
    ...writeUint16BE(1),
    ...writeUint16BE(totalTrackCount),
    ...writeUint16BE(TICKS_PER_BEAT),
  ];

  // Build track chunks
  const chunks: number[] = [];
  chunks.push(...wrapTrackChunk(buildTempoTrack(project)));

  for (let i = 0; i < midiTracks.length; i++) {
    const { name, notes } = midiTracks[i];
    chunks.push(...wrapTrackChunk(buildMidiTrack(name, notes, i)));
  }

  return new Uint8Array([...header, ...chunks]);
}

// ── Import ──

export function parseMidiFile(data: Uint8Array): MidiFileData {
  if (data.length < 14) throw new Error('Invalid MIDI file: too short');

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // Validate header
  const magic = String.fromCharCode(data[0], data[1], data[2], data[3]);
  if (magic !== 'MThd') throw new Error('Invalid MIDI file: missing MThd header');

  const headerLength = view.getUint32(4);
  if (headerLength < 6) throw new Error('Invalid MIDI header length');

  const format = view.getUint16(8);
  const numTracks = view.getUint16(10);
  const division = view.getUint16(12);
  if ((division & 0x8000) !== 0) {
    throw new Error('SMPTE time division not supported');
  }
  const ticksPerBeat = division;

  let bpm = 120; // default
  let tsNumerator = 4;
  let tsDenominator = 4;

  const tracks: MidiTrackData[] = [];
  let offset = 8 + headerLength;

  for (let t = 0; t < numTracks && offset < data.length; t++) {
    // Read track header
    ensureAvailable(offset, 8, data.length, 'Invalid MIDI file: truncated track header');
    const chunkMagic = String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
    if (chunkMagic !== 'MTrk') {
      throw new Error(`Invalid MIDI track chunk at offset ${offset}`);
    }
    const trackLength = view.getUint32(offset + 4);
    const trackStart = offset + 8;
    const trackEnd = trackStart + trackLength;
    ensureAvailable(trackStart, trackLength, data.length, 'Invalid MIDI file: track chunk exceeds file length');

    let trackName = '';
    const notes: MidiNoteEvent[] = [];
    const activeNotes = new Map<number, { startTick: number; velocity: number; channel: number }[]>();

    let pos = trackStart;
    let tick = 0;
    let runningStatus = 0;

    while (pos < trackEnd) {
      // Read delta time
      const vlq = readVLQ(data, pos, trackEnd);
      tick += vlq.value;
      pos += vlq.length;

      if (pos >= trackEnd) break;

      let statusByte = data[pos];

      // Meta event
      if (statusByte === 0xff) {
        pos++;
        ensureAvailable(pos, 1, trackEnd, 'Malformed MIDI file: truncated meta event');
        const metaType = data[pos++];
        const metaVLQ = readVLQ(data, pos, trackEnd);
        const metaLength = metaVLQ.value;
        pos += metaVLQ.length;
        ensureAvailable(pos, metaLength, trackEnd, 'Malformed MIDI file: meta event exceeds track length');

        if (metaType === 0x03) {
          // Track name
          trackName = new TextDecoder().decode(data.slice(pos, pos + metaLength));
        } else if (metaType === 0x51 && metaLength === 3) {
          // Tempo
          const uspb = (data[pos] << 16) | (data[pos + 1] << 8) | data[pos + 2];
          bpm = 60_000_000 / uspb;
        } else if (metaType === 0x58 && metaLength >= 2) {
          // Time signature
          tsNumerator = data[pos];
          tsDenominator = Math.pow(2, data[pos + 1]);
        }
        pos += metaLength;
        continue;
      }

      // SysEx
      if (statusByte === 0xf0 || statusByte === 0xf7) {
        pos++;
        const sysexVLQ = readVLQ(data, pos, trackEnd);
        ensureAvailable(pos + sysexVLQ.length, sysexVLQ.value, trackEnd, 'Malformed MIDI file: sysex event exceeds track length');
        pos += sysexVLQ.length + sysexVLQ.value;
        continue;
      }

      // Channel message
      if (statusByte & 0x80) {
        runningStatus = statusByte;
        pos++;
      } else {
        if (runningStatus < 0x80 || runningStatus >= 0xf0) {
          throw new Error('Malformed MIDI track: running status used before status byte');
        }
        statusByte = runningStatus;
      }

      const msgType = statusByte & 0xf0;
      const channel = statusByte & 0x0f;

      if (msgType === 0x90 || msgType === 0x80) {
        // Note on/off
        ensureAvailable(pos, 2, trackEnd, 'Malformed MIDI file: truncated note event');
        const pitch = data[pos++] & 0x7f;
        const velocity = data[pos++] & 0x7f;

        if (msgType === 0x90 && velocity > 0) {
          // Note on
          const key = (channel << 8) | pitch;
          const activeStack = activeNotes.get(key);
          const noteState = { startTick: tick, velocity, channel };
          if (activeStack) {
            activeStack.push(noteState);
          } else {
            activeNotes.set(key, [noteState]);
          }
        } else {
          // Note off
          const key = (channel << 8) | pitch;
          const activeStack = activeNotes.get(key);
          const active = activeStack?.shift();
          if (active) {
            const startBeat = active.startTick / ticksPerBeat;
            const durationBeats = (tick - active.startTick) / ticksPerBeat;
            notes.push({
              pitch,
              startBeat,
              durationBeats,
              velocity: active.velocity,
              channel: active.channel,
            });
            if (activeStack && activeStack.length === 0) {
              activeNotes.delete(key);
            }
          }
        }
      } else if (msgType === 0xc0 || msgType === 0xd0) {
        // Program change / channel pressure — 1 data byte
        ensureAvailable(pos, 1, trackEnd, 'Malformed MIDI file: truncated channel event');
        pos++;
      } else {
        // Control change, pitch bend, etc — 2 data bytes
        ensureAvailable(pos, 2, trackEnd, 'Malformed MIDI file: truncated channel event');
        pos += 2;
      }
    }

    tracks.push({ name: trackName, channel: notes[0]?.channel ?? 0, notes });
    offset = trackEnd;
  }

  return {
    format,
    ticksPerBeat,
    bpm,
    timeSignatureNumerator: tsNumerator,
    timeSignatureDenominator: tsDenominator,
    tracks,
  };
}
