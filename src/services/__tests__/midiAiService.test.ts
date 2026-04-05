import { describe, it, expect } from 'vitest';
import { serializeNotesToMidiContext, deserializeMidiResult, type MidiStreamToken } from '../midiAiService';
import type { MidiNote } from '../../types/project';

describe('midiAiService', () => {
  describe('serializeNotesToMidiContext', () => {
    it('serializes notes to base64-encoded JSON', () => {
      const notes: MidiNote[] = [
        { id: 'n1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 100 },
        { id: 'n2', pitch: 64, startBeat: 1, durationBeats: 0.5, velocity: 80 },
      ];

      const result = serializeNotesToMidiContext(notes, 120);
      const decoded = JSON.parse(atob(result));

      expect(decoded.format).toBe('ace-step-midi-v1');
      expect(decoded.bpm).toBe(120);
      expect(decoded.notes).toHaveLength(2);
      expect(decoded.notes[0]).toEqual({
        pitch: 60,
        start_beat: 0,
        duration_beats: 1,
        velocity: 100,
      });
      expect(decoded.notes[1]).toEqual({
        pitch: 64,
        start_beat: 1,
        duration_beats: 0.5,
        velocity: 80,
      });
    });

    it('handles empty notes array', () => {
      const result = serializeNotesToMidiContext([], 140);
      const decoded = JSON.parse(atob(result));
      expect(decoded.notes).toHaveLength(0);
      expect(decoded.bpm).toBe(140);
    });
  });

  describe('deserializeMidiResult', () => {
    it('deserializes base64-encoded MIDI result to MidiNote array', () => {
      const payload = {
        notes: [
          { pitch: 60, start_beat: 0, duration_beats: 1, velocity: 100 },
          { pitch: 67, start_beat: 2, duration_beats: 2, velocity: 90 },
        ],
      };
      const base64 = btoa(JSON.stringify(payload));

      const notes = deserializeMidiResult(base64);

      expect(notes).toHaveLength(2);
      expect(notes[0].pitch).toBe(60);
      expect(notes[0].startBeat).toBe(0);
      expect(notes[0].durationBeats).toBe(1);
      expect(notes[0].velocity).toBe(100);
      expect(notes[0].id).toMatch(/^note-/);

      expect(notes[1].pitch).toBe(67);
      expect(notes[1].startBeat).toBe(2);
    });

    it('returns empty array for invalid base64', () => {
      const notes = deserializeMidiResult('invalid-base64!!!');
      expect(notes).toHaveLength(0);
    });

    it('returns empty array when notes field is missing', () => {
      const base64 = btoa(JSON.stringify({ foo: 'bar' }));
      const notes = deserializeMidiResult(base64);
      expect(notes).toHaveLength(0);
    });

    it('generates unique IDs for each note', () => {
      const payload = {
        notes: [
          { pitch: 60, start_beat: 0, duration_beats: 1, velocity: 100 },
          { pitch: 62, start_beat: 1, duration_beats: 1, velocity: 100 },
        ],
      };
      const base64 = btoa(JSON.stringify(payload));
      const notes = deserializeMidiResult(base64);
      expect(notes[0].id).not.toBe(notes[1].id);
    });
  });

  describe('MidiStreamToken type', () => {
    it('supports all expected token types', () => {
      const progressToken: MidiStreamToken = { type: 'progress', progress: 50 };
      expect(progressToken.type).toBe('progress');
      expect(progressToken.progress).toBe(50);

      const errorToken: MidiStreamToken = { type: 'error', error: 'timeout' };
      expect(errorToken.type).toBe('error');
      expect(errorToken.error).toBe('timeout');

      const completeToken: MidiStreamToken = { type: 'complete', results: [] };
      expect(completeToken.type).toBe('complete');
      expect(completeToken.results).toHaveLength(0);

      const tokenEvent: MidiStreamToken = {
        type: 'token',
        note: { pitch: 60, start_beat: 0, duration_beats: 1, velocity: 100 },
      };
      expect(tokenEvent.type).toBe('token');
      expect(tokenEvent.note?.pitch).toBe(60);
    });
  });
});
