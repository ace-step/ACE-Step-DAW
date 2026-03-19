import type { MidiNote, TimeSignatureEvent } from '../types/project';

export interface ParsedMidiTrack {
  name: string;
  sourceTrackIndex: number;
  channel: number;
  notes: Array<Omit<MidiNote, 'id'>>;
}

export interface ParsedMidiFile {
  format: number;
  ticksPerQuarterNote: number;
  tracks: ParsedMidiTrack[];
  bpm?: number;
  timeSignature?: TimeSignatureEvent;
}

export interface MidiExportOptions {
  bpm?: number;
  timeSignature?: {
    numerator: number;
    denominator: number;
  };
  ticksPerQuarterNote?: number;
  channel?: number;
  trackName?: string;
  clipDurationBeats?: number;
}

interface ParsedTrackState {
  name?: string;
  notesByChannel: Map<number, Array<Omit<MidiNote, 'id'>>>;
}

interface ActiveNote {
  startTick: number;
  velocity: number;
}

function readUint32(view: DataView, offset: number) {
  return view.getUint32(offset, false);
}

function readUint16(view: DataView, offset: number) {
  return view.getUint16(offset, false);
}

function readVariableLength(data: Uint8Array, offset: number): { value: number; nextOffset: number } {
  let value = 0;
  let nextOffset = offset;

  while (nextOffset < data.length) {
    const byte = data[nextOffset++];
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      return { value, nextOffset };
    }
  }

  throw new Error('Unexpected end of MIDI data while reading variable-length value');
}

function decodeText(bytes: Uint8Array) {
  return new TextDecoder('utf-8').decode(bytes).replace(/\0/g, '').trim();
}

function encodeText(value: string) {
  return [...new TextEncoder().encode(value)];
}

function encodeVariableLength(value: number) {
  const safeValue = Math.max(0, Math.floor(value));
  const buffer = [safeValue & 0x7f];
  let remaining = safeValue >> 7;

  while (remaining > 0) {
    buffer.unshift((remaining & 0x7f) | 0x80);
    remaining >>= 7;
  }

  return buffer;
}

function writeUint16(value: number) {
  return [
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}

function writeUint32(value: number) {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}

function normalizeVelocity(velocity: number) {
  if (!Number.isFinite(velocity)) return 100;

  if (velocity <= 1) {
    return Math.max(1, Math.min(127, Math.round(velocity * 127)));
  }

  return Math.max(1, Math.min(127, Math.round(velocity)));
}

function buildMetaEvent(deltaTicks: number, type: number, data: number[]) {
  return [...encodeVariableLength(deltaTicks), 0xff, type, ...encodeVariableLength(data.length), ...data];
}

function buildMidiEvent(deltaTicks: number, status: number, data: number[]) {
  return [...encodeVariableLength(deltaTicks), status, ...data];
}

interface EncodedEvent {
  tick: number;
  order: number;
  bytes: number[];
}

function getOrCreateActiveNotes(
  activeNotes: Map<number, Map<number, ActiveNote[]>>,
  channel: number,
  pitch: number,
) {
  let byPitch = activeNotes.get(channel);
  if (!byPitch) {
    byPitch = new Map<number, ActiveNote[]>();
    activeNotes.set(channel, byPitch);
  }

  let stack = byPitch.get(pitch);
  if (!stack) {
    stack = [];
    byPitch.set(pitch, stack);
  }

  return stack;
}

function pushCompletedNote(
  notesByChannel: Map<number, Array<Omit<MidiNote, 'id'>>>,
  channel: number,
  pitch: number,
  startTick: number,
  endTick: number,
  velocity: number,
  ticksPerQuarterNote: number,
) {
  const durationTicks = endTick - startTick;
  if (durationTicks <= 0) return;

  const existing = notesByChannel.get(channel) ?? [];
  existing.push({
    pitch,
    startBeat: startTick / ticksPerQuarterNote,
    durationBeats: durationTicks / ticksPerQuarterNote,
    velocity,
  });
  notesByChannel.set(channel, existing);
}

export function parseMidiFile(arrayBuffer: ArrayBuffer): ParsedMidiFile {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);

  if (bytes.length < 14 || decodeText(bytes.slice(0, 4)) !== 'MThd') {
    throw new Error('Invalid MIDI header');
  }

  const headerLength = readUint32(view, 4);
  if (headerLength < 6) {
    throw new Error('Unsupported MIDI header length');
  }

  const format = readUint16(view, 8);
  const trackCount = readUint16(view, 10);
  const division = readUint16(view, 12);
  if ((division & 0x8000) !== 0) {
    throw new Error('SMPTE time division is not supported');
  }

  const ticksPerQuarterNote = division;
  let offset = 8 + headerLength;
  let firstTempoBpm: number | undefined;
  let firstTimeSignature: TimeSignatureEvent | undefined;
  const parsedTracks: ParsedTrackState[] = [];

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex++) {
    if (offset + 8 > bytes.length || decodeText(bytes.slice(offset, offset + 4)) !== 'MTrk') {
      throw new Error(`Invalid MIDI track header at track ${trackIndex + 1}`);
    }

    const trackLength = readUint32(view, offset + 4);
    const trackStart = offset + 8;
    const trackEnd = trackStart + trackLength;
    if (trackEnd > bytes.length) {
      throw new Error(`Track ${trackIndex + 1} exceeds file length`);
    }

    let cursor = trackStart;
    let tick = 0;
    let runningStatus: number | null = null;
    const notesByChannel = new Map<number, Array<Omit<MidiNote, 'id'>>>();
    const activeNotes = new Map<number, Map<number, ActiveNote[]>>();
    let trackName: string | undefined;

    while (cursor < trackEnd) {
      const delta = readVariableLength(bytes, cursor);
      tick += delta.value;
      cursor = delta.nextOffset;
      if (cursor >= trackEnd) break;

      let statusByte = bytes[cursor++];
      let firstDataByte: number | undefined;

      if (statusByte < 0x80) {
        if (runningStatus === null) {
          throw new Error(`Running status encountered without previous status in track ${trackIndex + 1}`);
        }
        firstDataByte = statusByte;
        statusByte = runningStatus;
      } else if (statusByte < 0xf0) {
        runningStatus = statusByte;
      }

      if (statusByte === 0xff) {
        runningStatus = null;
        if (cursor >= trackEnd) break;
        const metaType = bytes[cursor++];
        const metaLength = readVariableLength(bytes, cursor);
        cursor = metaLength.nextOffset;
        const metaData = bytes.slice(cursor, cursor + metaLength.value);
        cursor += metaLength.value;

        if (metaType === 0x03 && metaData.length > 0) {
          trackName = decodeText(metaData);
        } else if (metaType === 0x51 && metaData.length === 3 && firstTempoBpm === undefined) {
          const microsPerQuarter = (metaData[0] << 16) | (metaData[1] << 8) | metaData[2];
          if (microsPerQuarter > 0) {
            firstTempoBpm = 60000000 / microsPerQuarter;
          }
        } else if (metaType === 0x58 && metaData.length >= 2 && firstTimeSignature === undefined) {
          firstTimeSignature = {
            bar: 1,
            numerator: metaData[0],
            denominator: 2 ** metaData[1],
          };
        }

        continue;
      }

      if (statusByte === 0xf0 || statusByte === 0xf7) {
        runningStatus = null;
        const sysexLength = readVariableLength(bytes, cursor);
        cursor = sysexLength.nextOffset + sysexLength.value;
        continue;
      }

      const command = statusByte & 0xf0;
      const channel = statusByte & 0x0f;
      const needsOneDataByte = command === 0xc0 || command === 0xd0;
      const data1 = firstDataByte ?? bytes[cursor++];
      const data2 = needsOneDataByte ? undefined : bytes[cursor++];

      if (command === 0x90 && data2 !== undefined && data2 > 0) {
        getOrCreateActiveNotes(activeNotes, channel, data1).push({
          startTick: tick,
          velocity: data2 / 127,
        });
      } else if ((command === 0x80 && data2 !== undefined) || (command === 0x90 && data2 === 0)) {
        const stack = getOrCreateActiveNotes(activeNotes, channel, data1);
        const active = stack.shift();
        if (active) {
          pushCompletedNote(
            notesByChannel,
            channel,
            data1,
            active.startTick,
            tick,
            active.velocity,
            ticksPerQuarterNote,
          );
        }
      }
    }

    parsedTracks.push({ name: trackName, notesByChannel });
    offset = trackEnd;
  }

  const flattenedTracks: ParsedMidiTrack[] = [];
  parsedTracks.forEach((track, sourceTrackIndex) => {
    const channels = [...track.notesByChannel.entries()]
      .filter(([, notes]) => notes.length > 0)
      .sort((a, b) => a[0] - b[0]);

    const hasMultipleChannels = channels.length > 1;
    channels.forEach(([channel, notes]) => {
      const baseName = track.name || `MIDI Track ${sourceTrackIndex + 1}`;
      flattenedTracks.push({
        name: hasMultipleChannels ? `${baseName} Ch ${channel + 1}` : baseName,
        sourceTrackIndex,
        channel,
        notes: [...notes].sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch),
      });
    });
  });

  return {
    format,
    ticksPerQuarterNote,
    tracks: flattenedTracks,
    bpm: firstTempoBpm !== undefined ? Math.round(firstTempoBpm * 100) / 100 : undefined,
    timeSignature: firstTimeSignature,
  };
}

export function encodeMidiFile(
  notes: Array<MidiNote | Omit<MidiNote, 'id'>>,
  options: MidiExportOptions = {},
): Uint8Array {
  const ticksPerQuarterNote = options.ticksPerQuarterNote ?? 96;
  const bpm = options.bpm ?? 120;
  const channel = Math.max(0, Math.min(15, options.channel ?? 0));
  const trackName = options.trackName?.trim() || 'ACE-Step MIDI Clip';
  const timeSignature = options.timeSignature ?? { numerator: 4, denominator: 4 };
  const safeDenominator = Math.max(1, timeSignature.denominator);
  const denominatorPower = Math.round(Math.log2(safeDenominator));
  const clipDurationBeats = options.clipDurationBeats ?? 0;

  const events: EncodedEvent[] = [
    {
      tick: 0,
      order: 0,
      bytes: buildMetaEvent(0, 0x03, encodeText(trackName)),
    },
    {
      tick: 0,
      order: 1,
      bytes: buildMetaEvent(0, 0x51, writeUint32(Math.round(60000000 / bpm)).slice(1)),
    },
    {
      tick: 0,
      order: 2,
      bytes: buildMetaEvent(0, 0x58, [timeSignature.numerator, denominatorPower, 24, 8]),
    },
  ];

  let finalTick = Math.max(0, Math.round(clipDurationBeats * ticksPerQuarterNote));

  for (const note of notes) {
    const startTick = Math.max(0, Math.round(note.startBeat * ticksPerQuarterNote));
    const endTick = Math.max(startTick, Math.round((note.startBeat + note.durationBeats) * ticksPerQuarterNote));
    if (endTick <= startTick) continue;

    finalTick = Math.max(finalTick, endTick);

    events.push({
      tick: startTick,
      order: 4,
      bytes: buildMidiEvent(0, 0x90 | channel, [note.pitch, normalizeVelocity(note.velocity)]),
    });
    events.push({
      tick: endTick,
      order: 3,
      bytes: buildMidiEvent(0, 0x80 | channel, [note.pitch, 0]),
    });
  }

  events.sort((a, b) => a.tick - b.tick || a.order - b.order);

  const trackData: number[] = [];
  let previousTick = 0;
  for (const event of events) {
    const delta = event.tick - previousTick;
    const eventBytes = [...event.bytes];
    eventBytes.splice(0, encodeVariableLength(0).length, ...encodeVariableLength(delta));
    trackData.push(...eventBytes);
    previousTick = event.tick;
  }
  trackData.push(...buildMetaEvent(finalTick - previousTick, 0x2f, []));

  const trackChunk = [
    ...encodeText('MTrk'),
    ...writeUint32(trackData.length),
    ...trackData,
  ];

  const headerChunk = [
    ...encodeText('MThd'),
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    ...writeUint16(ticksPerQuarterNote),
  ];

  return Uint8Array.from([
    ...headerChunk,
    ...trackChunk,
  ]);
}
