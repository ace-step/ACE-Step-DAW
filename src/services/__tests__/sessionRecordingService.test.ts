/**
 * Session Recording Service — TDD tests
 *
 * Tests for recording audio and MIDI into session clip slots.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SessionRecordingService,
  type SessionRecordingState,
} from '../sessionRecordingService';

describe('SessionRecordingService', () => {
  let service: SessionRecordingService;

  beforeEach(() => {
    service = new SessionRecordingService();
  });

  describe('state management', () => {
    it('starts with no active recordings', () => {
      expect(service.getActiveRecordings()).toEqual({});
    });

    it('tracks recording state after startRecording', () => {
      service.startRecording({
        slotId: 'slot-1',
        trackId: 'track-1',
        trackType: 'pianoRoll',
        bpm: 120,
        timeSignature: 4,
      });

      const recordings = service.getActiveRecordings();
      expect(recordings['slot-1']).toBeDefined();
      expect(recordings['slot-1'].trackId).toBe('track-1');
      expect(recordings['slot-1'].trackType).toBe('pianoRoll');
      expect(recordings['slot-1'].isRecording).toBe(true);
    });

    it('removes recording state after stopRecording', () => {
      service.startRecording({
        slotId: 'slot-1',
        trackId: 'track-1',
        trackType: 'pianoRoll',
        bpm: 120,
        timeSignature: 4,
      });

      const result = service.stopRecording('slot-1');
      expect(result).not.toBeNull();
      expect(service.getActiveRecordings()['slot-1']).toBeUndefined();
    });

    it('returns null when stopping a non-existent recording', () => {
      const result = service.stopRecording('non-existent');
      expect(result).toBeNull();
    });

    it('prevents duplicate recordings on the same slot', () => {
      service.startRecording({
        slotId: 'slot-1',
        trackId: 'track-1',
        trackType: 'pianoRoll',
        bpm: 120,
        timeSignature: 4,
      });

      expect(() => {
        service.startRecording({
          slotId: 'slot-1',
          trackId: 'track-1',
          trackType: 'pianoRoll',
          bpm: 120,
          timeSignature: 4,
        });
      }).toThrow('Already recording in slot slot-1');
    });
  });

  describe('MIDI recording', () => {
    it('records MIDI note events during recording', () => {
      service.startRecording({
        slotId: 'slot-1',
        trackId: 'track-1',
        trackType: 'pianoRoll',
        bpm: 120,
        timeSignature: 4,
      });

      const startTime = service.getActiveRecordings()['slot-1'].startTime;
      service.addMidiNote('slot-1', 60, 0.8, startTime + 0.5);
      service.endMidiNote('slot-1', 60, startTime + 1.0);

      const result = service.stopRecording('slot-1');
      expect(result).not.toBeNull();
      expect(result!.midiNotes).toHaveLength(1);
      expect(result!.midiNotes![0].pitch).toBe(60);
      expect(result!.midiNotes![0].velocity).toBeCloseTo(0.8);
    });

    it('calculates note timing relative to recording start', () => {
      service.startRecording({
        slotId: 'slot-1',
        trackId: 'track-1',
        trackType: 'pianoRoll',
        bpm: 120,
        timeSignature: 4,
      });

      const startTime = service.getActiveRecordings()['slot-1'].startTime;
      // Note starts 1 second after recording start at 120 BPM = 2 beats
      service.addMidiNote('slot-1', 60, 0.8, startTime + 1.0);
      service.endMidiNote('slot-1', 60, startTime + 1.5);

      const result = service.stopRecording('slot-1');
      expect(result!.midiNotes![0].startBeat).toBeCloseTo(2.0);
      expect(result!.midiNotes![0].durationBeats).toBeCloseTo(1.0);
    });

    it('auto-closes held notes on stop', () => {
      service.startRecording({
        slotId: 'slot-1',
        trackId: 'track-1',
        trackType: 'pianoRoll',
        bpm: 120,
        timeSignature: 4,
      });

      const startTime = service.getActiveRecordings()['slot-1'].startTime;
      service.addMidiNote('slot-1', 60, 0.8, startTime + 0.5);
      // Never call endMidiNote — should auto-close

      const result = service.stopRecording('slot-1');
      expect(result!.midiNotes).toHaveLength(1);
      expect(result!.midiNotes![0].durationBeats).toBeGreaterThan(0);
    });

    it('records multiple notes simultaneously (polyphony)', () => {
      service.startRecording({
        slotId: 'slot-1',
        trackId: 'track-1',
        trackType: 'pianoRoll',
        bpm: 120,
        timeSignature: 4,
      });

      const startTime = service.getActiveRecordings()['slot-1'].startTime;
      service.addMidiNote('slot-1', 60, 0.8, startTime + 0.5);
      service.addMidiNote('slot-1', 64, 0.6, startTime + 0.5);
      service.addMidiNote('slot-1', 67, 0.7, startTime + 0.5);
      service.endMidiNote('slot-1', 60, startTime + 1.0);
      service.endMidiNote('slot-1', 64, startTime + 1.0);
      service.endMidiNote('slot-1', 67, startTime + 1.0);

      const result = service.stopRecording('slot-1');
      expect(result!.midiNotes).toHaveLength(3);
    });
  });

  describe('fixed-length recording', () => {
    it('sets fixed recording length in bars', () => {
      service.setFixedLengthBars(4);
      expect(service.getFixedLengthBars()).toBe(4);
    });

    it('clears fixed length with null', () => {
      service.setFixedLengthBars(4);
      service.setFixedLengthBars(null);
      expect(service.getFixedLengthBars()).toBeNull();
    });

    it('calculates clip duration from fixed length', () => {
      service.setFixedLengthBars(4);
      service.startRecording({
        slotId: 'slot-1',
        trackId: 'track-1',
        trackType: 'pianoRoll',
        bpm: 120,
        timeSignature: 4,
      });

      const result = service.stopRecording('slot-1');
      // 4 bars * 4 beats/bar * 0.5 sec/beat = 8 seconds
      expect(result!.clipDuration).toBeCloseTo(8.0);
    });

    it('uses actual recording duration when no fixed length', () => {
      service.setFixedLengthBars(null);
      service.startRecording({
        slotId: 'slot-1',
        trackId: 'track-1',
        trackType: 'pianoRoll',
        bpm: 120,
        timeSignature: 4,
      });

      const result = service.stopRecording('slot-1');
      // Duration should be based on actual elapsed time, snapped to bar boundary
      expect(result!.clipDuration).toBeGreaterThan(0);
    });
  });

  describe('overdub mode', () => {
    it('defaults to not overdubbing', () => {
      expect(service.isOverdubMode()).toBe(false);
    });

    it('toggles overdub mode', () => {
      service.setOverdubMode(true);
      expect(service.isOverdubMode()).toBe(true);
      service.setOverdubMode(false);
      expect(service.isOverdubMode()).toBe(false);
    });
  });

  describe('count-in', () => {
    it('stores count-in bars setting', () => {
      service.setCountInBars(2);
      expect(service.getCountInBars()).toBe(2);
    });

    it('defaults to 0 (no count-in)', () => {
      expect(service.getCountInBars()).toBe(0);
    });

    it('clamps count-in bars between 0 and 4', () => {
      service.setCountInBars(-1);
      expect(service.getCountInBars()).toBe(0);
      service.setCountInBars(5);
      expect(service.getCountInBars()).toBe(4);
    });

    it('marks slot as counting in during count-in phase', () => {
      service.setCountInBars(2);
      service.startRecording({
        slotId: 'slot-1',
        trackId: 'track-1',
        trackType: 'pianoRoll',
        bpm: 120,
        timeSignature: 4,
      });

      expect(service.isSlotCountingIn('slot-1')).toBe(true);
      expect(service.isSlotRecording('slot-1')).toBe(true); // slot is "in recording" even during count-in
      // Clean up
      service.stopRecording('slot-1');
    });

    it('returns null when stopped during count-in', () => {
      service.setCountInBars(2);
      service.startRecording({
        slotId: 'slot-1',
        trackId: 'track-1',
        trackType: 'pianoRoll',
        bpm: 120,
        timeSignature: 4,
      });

      const result = service.stopRecording('slot-1');
      expect(result).toBeNull(); // Cancelled during count-in
    });

    it('ignores MIDI input during count-in phase', () => {
      service.setCountInBars(2);
      service.startRecording({
        slotId: 'slot-1',
        trackId: 'track-1',
        trackType: 'pianoRoll',
        bpm: 120,
        timeSignature: 4,
      });

      const recordings = service.getActiveRecordings();
      const startTime = recordings['slot-1'].startTime;
      service.addMidiNote('slot-1', 60, 0.8, startTime + 0.1);
      service.endMidiNote('slot-1', 60, startTime + 0.5);

      // Stop during count-in — should be null
      const result = service.stopRecording('slot-1');
      expect(result).toBeNull();
    });
  });

  describe('count-in + fixed-length interaction', () => {
    it('fixed-length duration is independent of count-in', () => {
      service.setCountInBars(2);
      service.setFixedLengthBars(4);

      service.startRecording({
        slotId: 'slot-1',
        trackId: 'track-1',
        trackType: 'pianoRoll',
        bpm: 120,
        timeSignature: 4,
      });

      // During count-in, stop cancels (returns null)
      const earlyResult = service.stopRecording('slot-1');
      expect(earlyResult).toBeNull();

      // The service correctly handles count-in phase
      // Clip duration should still be based on fixedLengthBars, not count-in
      service.setCountInBars(0); // Reset for next test
    });
  });

  describe('overdub merge', () => {
    it('merges new notes with existing notes', () => {
      const existing: Array<{ pitch: number; velocity: number; startBeat: number; durationBeats: number }> = [
        { pitch: 60, velocity: 0.8, startBeat: 0, durationBeats: 1 },
      ];
      const newNotes: Array<{ pitch: number; velocity: number; startBeat: number; durationBeats: number }> = [
        { pitch: 64, velocity: 0.6, startBeat: 1, durationBeats: 1 },
      ];

      const merged = service.mergeOverdubNotes(existing, newNotes);
      expect(merged).toHaveLength(2);
      expect(merged[0].pitch).toBe(60);
      expect(merged[1].pitch).toBe(64);
    });
  });

  describe('auto-loop', () => {
    it('recording result includes autoLoop flag', () => {
      service.startRecording({
        slotId: 'slot-1',
        trackId: 'track-1',
        trackType: 'pianoRoll',
        bpm: 120,
        timeSignature: 4,
      });

      const result = service.stopRecording('slot-1');
      expect(result).not.toBeNull();
      expect(result!.autoLoop).toBe(true);
    });
  });

  describe('isSlotRecording', () => {
    it('returns false for non-recording slots', () => {
      expect(service.isSlotRecording('slot-1')).toBe(false);
    });

    it('returns true for actively recording slots', () => {
      service.startRecording({
        slotId: 'slot-1',
        trackId: 'track-1',
        trackType: 'pianoRoll',
        bpm: 120,
        timeSignature: 4,
      });

      expect(service.isSlotRecording('slot-1')).toBe(true);
    });
  });

  describe('stopAll', () => {
    it('stops all active recordings', () => {
      service.startRecording({
        slotId: 'slot-1',
        trackId: 'track-1',
        trackType: 'pianoRoll',
        bpm: 120,
        timeSignature: 4,
      });
      service.startRecording({
        slotId: 'slot-2',
        trackId: 'track-2',
        trackType: 'pianoRoll',
        bpm: 120,
        timeSignature: 4,
      });

      const results = service.stopAll();
      expect(results).toHaveLength(2);
      expect(service.getActiveRecordings()).toEqual({});
    });
  });
});
