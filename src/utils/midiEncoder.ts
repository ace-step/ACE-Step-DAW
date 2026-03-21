import type { MidiNote, TempoEvent, TimeSignatureEvent } from '../types/project';
import { getBeatAtBar } from './tempoMap';

export interface MidiExportTrack {
  name: string;
  channel: number;
  notes: MidiNote[];
}

export interface MidiExportOptions {
  bpm?: number;
  timeSignature?: TimeSignatureEvent;
  tempoMap?: TempoEvent[];
  timeSignatureMap?: TimeSignatureEvent[];
  trackName?: string;
}

const ENCODER_TPQN = 480;

function writeUint32BE(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function writeUint16BE(value: number): number[] {
  return [(value >>> 8) & 0xff, value & 0xff];
}

function writeVLQ(value: number): number[] {
  if (value < 0) value = 0;
  const bytes: number[] = [value & 0x7f];
  let remaining = value >>> 7;
  while (remaining > 0) {
    bytes.unshift((remaining & 0x7f) | 0x80);
    remaining >>>= 7;
  }
  return bytes;
}

function encodeText(text: string): number[] {
  return [...new TextEncoder().encode(text)];
}

function encodeMeta(delta: number, type: number, data: number[]): number[] {
  return [...writeVLQ(delta), 0xff, type, ...writeVLQ(data.length), ...data];
}

function encodeMidiEvent(delta: number, status: number, data: number[]): number[] {
  return [...writeVLQ(delta), status, ...data];
}

interface TempoMetaEvent {
  tick: number;
  type: number;
  data: number[];
}

function buildTempoTrack(
  bpm: number,
  ts?: TimeSignatureEvent,
  tempoMap?: TempoEvent[],
  timeSignatureMap?: TimeSignatureEvent[],
): number[] {
  const events: TempoMetaEvent[] = [];
  const normalizedTempoMap = tempoMap && tempoMap.length > 0
    ? tempoMap
    : [{ beat: 0, bpm }];
  const normalizedTimeSignatureMap = timeSignatureMap && timeSignatureMap.length > 0
    ? timeSignatureMap
    : ts
      ? [{ bar: ts.bar ?? 1, numerator: ts.numerator, denominator: ts.denominator }]
      : [];

  for (const tempoEvent of normalizedTempoMap) {
    const microsPerQuarter = Math.round(60000000 / tempoEvent.bpm);
    events.push({
      tick: Math.round(tempoEvent.beat * ENCODER_TPQN),
      type: 0x51,
      data: [
        (microsPerQuarter >>> 16) & 0xff,
        (microsPerQuarter >>> 8) & 0xff,
        microsPerQuarter & 0xff,
      ],
    });
  }

  const fallbackNumerator = normalizedTimeSignatureMap[0]?.numerator ?? ts?.numerator ?? 4;
  for (const signatureEvent of normalizedTimeSignatureMap) {
    const denomLog2 = Math.round(Math.log2(signatureEvent.denominator));
    const beat = getBeatAtBar(signatureEvent.bar, normalizedTimeSignatureMap, fallbackNumerator);
    events.push({
      tick: Math.round(beat * ENCODER_TPQN),
      type: 0x58,
      data: [signatureEvent.numerator, denomLog2, 0x18, 0x08],
    });
  }

  events.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    return a.type - b.type;
  });

  const encoded: number[] = [];
  let previousTick = 0;
  for (const event of events) {
    encoded.push(...encodeMeta(event.tick - previousTick, event.type, event.data));
    previousTick = event.tick;
  }

  encoded.push(...encodeMeta(0, 0x2f, []));
  return encoded;
}

interface NoteEvent {
  tick: number;
  type: 'on' | 'off';
  pitch: number;
  velocity: number;
}

function buildNoteTrack(notes: MidiNote[], channel: number, name?: string): number[] {
  const events: number[] = [];

  if (name) {
    events.push(...encodeMeta(0, 0x03, encodeText(name)));
  }

  const noteEvents: NoteEvent[] = [];
  for (const note of notes) {
    const startTick = Math.round(note.startBeat * ENCODER_TPQN);
    const endTick = Math.round((note.startBeat + note.durationBeats) * ENCODER_TPQN);
    const vel = Math.round(Math.min(1, Math.max(0, note.velocity)) * 127);
    noteEvents.push({ tick: startTick, type: 'on', pitch: note.pitch, velocity: vel });
    noteEvents.push({ tick: endTick, type: 'off', pitch: note.pitch, velocity: 0 });
  }

  noteEvents.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    if (a.type !== b.type) return a.type === 'off' ? -1 : 1;
    return a.pitch - b.pitch;
  });

  let prevTick = 0;
  const ch = channel & 0x0f;
  for (const evt of noteEvents) {
    const delta = evt.tick - prevTick;
    if (evt.type === 'on') {
      events.push(...encodeMidiEvent(delta, 0x90 | ch, [evt.pitch, evt.velocity]));
    } else {
      events.push(...encodeMidiEvent(delta, 0x80 | ch, [evt.pitch, 0]));
    }
    prevTick = evt.tick;
  }

  events.push(...encodeMeta(0, 0x2f, []));
  return events;
}

function wrapTrackChunk(events: number[]): number[] {
  return [...encodeText('MTrk'), ...writeUint32BE(events.length), ...events];
}

/**
 * Encode MIDI notes into a Standard MIDI File (format 1) ArrayBuffer.
 *
 * Accepts either:
 * - `MidiNote[]` for a single-track export (use `options.trackName` for name)
 * - `MidiExportTrack[]` for multi-track export
 */
export function encodeMidiFile(
  input: MidiNote[] | MidiExportTrack[],
  options: MidiExportOptions = {},
): ArrayBuffer {
  const bpm = options.bpm ?? 120;

  let tracks: MidiExportTrack[];
  if (input.length === 0) {
    tracks = [];
  } else if ('pitch' in input[0]) {
    tracks = [{ name: options.trackName ?? 'MIDI Track 1', channel: 0, notes: input as MidiNote[] }];
  } else {
    tracks = input as MidiExportTrack[];
  }

  const trackChunks: number[][] = [];
  trackChunks.push(wrapTrackChunk(
    buildTempoTrack(bpm, options.timeSignature, options.tempoMap, options.timeSignatureMap),
  ));

  for (const track of tracks) {
    trackChunks.push(wrapTrackChunk(buildNoteTrack(track.notes, track.channel, track.name)));
  }

  const totalTrackCount = trackChunks.length;
  const header = [
    ...encodeText('MThd'),
    ...writeUint32BE(6),
    ...writeUint16BE(1),
    ...writeUint16BE(totalTrackCount),
    ...writeUint16BE(ENCODER_TPQN),
  ];

  const allBytes = [...header, ...trackChunks.flat()];
  return new Uint8Array(allBytes).buffer;
}
