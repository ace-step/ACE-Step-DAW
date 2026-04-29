import { describe, it, expect } from 'vitest';
import {
  exportProjectToMidi,
  parseMidiFile,
  type MidiTrackData,
  type MidiNoteEvent,
} from '../midiFile';
import type { Project, Track, Clip, MidiNote } from '../../types/project';

function makeNote(pitch: number, startBeat: number, durationBeats: number, velocity = 100): MidiNote {
  return {
    id: `note-${pitch}-${startBeat}`,
    pitch,
    startBeat,
    durationBeats,
    velocity,
  };
}

function makeMidiClip(startTime: number, notes: MidiNote[]): Clip {
  return {
    id: `clip-${startTime}`,
    startTime,
    duration: 4,
    midiData: { notes, grid: { resolution: 16, swing: 0 } },
  } as unknown as Clip;
}

function makeTrack(name: string, clips: Clip[], trackType: 'pianoRoll' | 'drumMachine' = 'pianoRoll'): Track {
  return {
    id: `track-${name}`,
    trackName: 'custom',
    trackType,
    displayName: name,
    color: '#ff0000',
    volume: 0.8,
    clips,
    localCaption: '',
  } as Track;
}

function makeProject(tracks: Track[], bpm = 120, timeSignature = 4): Project {
  return {
    id: 'proj-1',
    name: 'Test Song',
    createdAt: 1000,
    updatedAt: 2000,
    bpm,
    keyScale: 'C major',
    timeSignature,
    totalDuration: 60,
    tracks,
    generationDefaults: {} as Project['generationDefaults'],
  };
}

function makeSingleTrackMidi(trackEvents: number[], division = 480, appendEnd = true): Uint8Array {
  const track = appendEnd ? [...trackEvents, 0x00, 0xff, 0x2f, 0x00] : trackEvents;
  return new Uint8Array([
    0x4d, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    (division >> 8) & 0xff, division & 0xff,
    0x4d, 0x54, 0x72, 0x6b,
    (track.length >> 24) & 0xff,
    (track.length >> 16) & 0xff,
    (track.length >> 8) & 0xff,
    track.length & 0xff,
    ...track,
  ]);
}

describe('midiFile', () => {
  describe('exportProjectToMidi', () => {
    it('exports an empty project as valid MIDI with header', () => {
      const project = makeProject([]);
      const bytes = exportProjectToMidi(project);

      // MIDI header: "MThd"
      expect(bytes[0]).toBe(0x4D); // M
      expect(bytes[1]).toBe(0x54); // T
      expect(bytes[2]).toBe(0x68); // h
      expect(bytes[3]).toBe(0x64); // d
      // Header length = 6
      expect(bytes[7]).toBe(6);
    });

    it('includes a tempo track with the project BPM', () => {
      const project = makeProject([], 140);
      const bytes = exportProjectToMidi(project);
      const data = new DataView(bytes.buffer, bytes.byteOffset);

      // Format type 1 (multi-track)
      expect(data.getUint16(8)).toBe(1);
      // Should have at least 1 track (tempo)
      expect(data.getUint16(10)).toBeGreaterThanOrEqual(1);
    });

    it('encodes MIDI notes from pianoRoll tracks', () => {
      const notes = [makeNote(60, 0, 1), makeNote(64, 1, 0.5)];
      const clip = makeMidiClip(0, notes);
      const track = makeTrack('Piano', [clip], 'pianoRoll');
      const project = makeProject([track]);

      const bytes = exportProjectToMidi(project);
      // Should produce valid MIDI (at minimum >14 bytes for header + at least one track)
      expect(bytes.length).toBeGreaterThan(22);
    });

    it('skips tracks with no MIDI notes', () => {
      const stemTrack = {
        id: 'stem-1',
        trackName: 'vocals' as const,
        trackType: 'stems' as const,
        displayName: 'Vocals',
        color: '#00ff00',
        volume: 1,
        clips: [{ id: 'c1', startTime: 0, duration: 10 }] as unknown as Clip[],
        localCaption: '',
      } as Track;
      const project = makeProject([stemTrack]);
      const bytes = exportProjectToMidi(project);
      const data = new DataView(bytes.buffer, bytes.byteOffset);

      // Only tempo track (no MIDI data tracks)
      expect(data.getUint16(10)).toBe(1);
    });

    it('uses 480 ticks per quarter note', () => {
      const project = makeProject([]);
      const bytes = exportProjectToMidi(project);
      const data = new DataView(bytes.buffer, bytes.byteOffset);
      expect(data.getUint16(12)).toBe(480);
    });

    it('throws instead of wrapping channels for more than 16 MIDI tracks', () => {
      const tracks = Array.from({ length: 17 }, (_, i) => (
        makeTrack(`Track ${i + 1}`, [makeMidiClip(0, [makeNote(60, 0, 1)])])
      ));

      expect(() => exportProjectToMidi(makeProject(tracks))).toThrow('up to 16 MIDI tracks');
    });

    it('defaults unsupported time signature denominators to 4', () => {
      const project = {
        ...makeProject([]),
        timeSignatureDenominator: 3,
      };
      const bytes = exportProjectToMidi(project);
      const result = parseMidiFile(bytes);

      expect(result.timeSignatureDenominator).toBe(4);
    });
  });

  describe('parseMidiFile', () => {
    it('parses a valid MIDI file header', () => {
      const project = makeProject([]);
      const bytes = exportProjectToMidi(project);
      const result = parseMidiFile(bytes);

      expect(result.format).toBe(1);
      expect(result.ticksPerBeat).toBe(480);
      expect(result.bpm).toBe(120);
    });

    it('round-trips notes through export → import', () => {
      const notes = [
        makeNote(60, 0, 1, 100),
        makeNote(64, 1, 0.5, 80),
        makeNote(67, 2, 2, 127),
      ];
      const clip = makeMidiClip(0, notes);
      const track = makeTrack('Piano', [clip]);
      const project = makeProject([track], 120);

      const bytes = exportProjectToMidi(project);
      const result = parseMidiFile(bytes);

      expect(result.tracks.length).toBeGreaterThanOrEqual(1);
      // Find the data track (skip tempo track)
      const dataTracks = result.tracks.filter(t => t.notes.length > 0);
      expect(dataTracks.length).toBe(1);

      const imported = dataTracks[0].notes;
      expect(imported.length).toBe(3);

      // Check first note
      expect(imported[0].pitch).toBe(60);
      expect(imported[0].velocity).toBe(100);
      expect(imported[0].startBeat).toBeCloseTo(0, 2);
      expect(imported[0].durationBeats).toBeCloseTo(1, 2);

      // Check second note
      expect(imported[1].pitch).toBe(64);
      expect(imported[1].velocity).toBe(80);
      expect(imported[1].startBeat).toBeCloseTo(1, 2);
    });

    it('parses BPM from tempo meta event', () => {
      const project = makeProject([], 145);
      const bytes = exportProjectToMidi(project);
      const result = parseMidiFile(bytes);
      expect(result.bpm).toBeCloseTo(145, 0);
    });

    it('parses track names', () => {
      const track = makeTrack('Lead Synth', [makeMidiClip(0, [makeNote(60, 0, 1)])]);
      const project = makeProject([track]);
      const bytes = exportProjectToMidi(project);
      const result = parseMidiFile(bytes);

      const namedTrack = result.tracks.find(t => t.name === 'Lead Synth');
      expect(namedTrack).toBeTruthy();
    });

    it('reports the actual MIDI event channel for parsed tracks', () => {
      const bytes = makeSingleTrackMidi([
        0x00, 0x99, 60, 100,
        0x81, 0x70, 0x89, 60, 0,
      ]);

      const result = parseMidiFile(bytes);
      expect(result.tracks[0].channel).toBe(9);
      expect(result.tracks[0].notes[0].channel).toBe(9);
    });

    it('throws on invalid MIDI data', () => {
      const garbage = new Uint8Array([0, 1, 2, 3, 4]);
      expect(() => parseMidiFile(garbage)).toThrow();
    });

    it('throws on unsupported SMPTE time division', () => {
      const bytes = makeSingleTrackMidi([], 0x8000);
      expect(() => parseMidiFile(bytes)).toThrow('SMPTE time division not supported');
    });

    it('throws when running status is used before a status byte', () => {
      const bytes = makeSingleTrackMidi([
        0x00, 0x40, 0x40,
      ]);

      expect(() => parseMidiFile(bytes)).toThrow('running status used before status byte');
    });

    it('throws on a truncated variable-length quantity', () => {
      const bytes = makeSingleTrackMidi([0x81], 480, false);
      expect(() => parseMidiFile(bytes)).toThrow('truncated variable-length quantity');
    });

    it('throws when a meta event exceeds the track length', () => {
      const bytes = makeSingleTrackMidi([
        0x00, 0xff, 0x03, 0x05, 0x41,
      ], 480, false);

      expect(() => parseMidiFile(bytes)).toThrow('meta event exceeds track length');
    });

    it('throws when a declared track chunk exceeds the file length', () => {
      const bytes = makeSingleTrackMidi([]);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      view.setUint32(18, 1024);

      expect(() => parseMidiFile(bytes)).toThrow('track chunk exceeds file length');
    });

    it('preserves overlapping notes with the same pitch and channel', () => {
      const bytes = makeSingleTrackMidi([
        0x00, 0x90, 60, 100,
        0x81, 0x70, 0x90, 60, 80,
        0x81, 0x70, 0x80, 60, 0,
        0x00, 0x80, 60, 0,
      ]);

      const result = parseMidiFile(bytes);
      const notes = result.tracks.flatMap((track) => track.notes);

      expect(notes).toHaveLength(2);
      expect(notes[0].startBeat).toBeCloseTo(0);
      expect(notes[0].durationBeats).toBeCloseTo(1);
      expect(notes[1].startBeat).toBeCloseTo(0.5);
      expect(notes[1].durationBeats).toBeCloseTo(0.5);
    });
  });
});
