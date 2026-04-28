import { describe, it, expect, beforeEach } from 'vitest';
import { MidiCaptureService } from '../midiCaptureService';

describe('MidiCaptureService', () => {
  let service: MidiCaptureService;

  beforeEach(() => {
    service = new MidiCaptureService(60); // 60 second buffer
  });

  describe('noteOn / noteOff', () => {
    it('records a note event with timing', () => {
      service.noteOn('track-1', 60, 100, 1.0);
      service.noteOff('track-1', 60, 1.5);
      const buffer = service.getBuffer('track-1');
      expect(buffer).toHaveLength(1);
      expect(buffer[0].pitch).toBe(60);
      expect(buffer[0].velocity).toBe(100);
      expect(buffer[0].timeOn).toBe(1.0);
      expect(buffer[0].timeOff).toBe(1.5);
    });

    it('supports multiple tracks independently', () => {
      service.noteOn('track-1', 60, 80, 1.0);
      service.noteOn('track-2', 64, 90, 1.2);
      service.noteOff('track-1', 60, 1.5);
      service.noteOff('track-2', 64, 1.7);
      expect(service.getBuffer('track-1')).toHaveLength(1);
      expect(service.getBuffer('track-2')).toHaveLength(1);
    });

    it('tracks active notes per track', () => {
      service.noteOn('track-1', 60, 80, 1.0);
      expect(service.hasEvents('track-1')).toBe(true);
      expect(service.hasEvents('track-2')).toBe(false);
    });
  });

  describe('drain', () => {
    it('drains buffered notes into beat-relative format', () => {
      // 120 BPM, 4/4 time, 1 beat = 0.5s, 1 bar = 2s
      service.noteOn('track-1', 60, 80, 10.0);
      service.noteOff('track-1', 60, 10.4);
      service.noteOn('track-1', 64, 90, 10.5);
      service.noteOff('track-1', 64, 10.9);

      const result = service.drain('track-1', 12.0, 120, 4, 4);
      expect(result).not.toBeNull();
      expect(result!.notes).toHaveLength(2);
      expect(result!.clipDuration).toBe(8); // 4 bars * 2s/bar
    });

    it('returns null when buffer is empty', () => {
      const result = service.drain('track-1', 10.0, 120, 4, 4);
      expect(result).toBeNull();
    });

    it('clears buffer after drain', () => {
      service.noteOn('track-1', 60, 80, 10.0);
      service.noteOff('track-1', 60, 10.4);
      service.drain('track-1', 12.0, 120, 4, 4);
      expect(service.hasEvents('track-1')).toBe(false);
    });

    it('closes held notes at capture time', () => {
      service.noteOn('track-1', 60, 80, 10.0);
      // No noteOff — the drain should close it at captureTime
      const result = service.drain('track-1', 11.0, 120, 4, 8);
      expect(result).not.toBeNull();
      expect(result!.notes).toHaveLength(1);
      expect(result!.notes[0].durationBeats).toBeGreaterThan(0);
    });

    it('respects configurable bar count', () => {
      service.noteOn('track-1', 60, 80, 5.0);
      service.noteOff('track-1', 60, 5.4);
      // At 120 BPM, 4/4, 1 bar = 2s. 2 bars = 4s window
      const result = service.drain('track-1', 6.0, 120, 4, 2);
      expect(result).not.toBeNull();
      expect(result!.clipDuration).toBe(4); // 2 bars * 2s
    });
  });

  describe('prune', () => {
    it('evicts events older than max buffer duration', () => {
      service.noteOn('track-1', 60, 80, 1.0);
      service.noteOff('track-1', 60, 1.5);
      // Prune with reference time 100s (buffer is 60s, so cutoff = 40s)
      service.prune(100);
      expect(service.hasEvents('track-1')).toBe(false);
    });

    it('keeps recent events', () => {
      service.noteOn('track-1', 60, 80, 50.0);
      service.noteOff('track-1', 60, 50.5);
      service.prune(60); // cutoff = 0, event at 50 is within range
      expect(service.hasEvents('track-1')).toBe(true);
    });
  });

  describe('getActiveTrackIds', () => {
    it('returns only tracks with events', () => {
      service.noteOn('track-1', 60, 80, 1.0);
      service.noteOff('track-1', 60, 1.5);
      service.noteOn('track-2', 64, 90, 2.0);
      service.noteOff('track-2', 64, 2.5);
      expect(service.getActiveTrackIds()).toEqual(['track-1', 'track-2']);
    });
  });

  describe('clearTrack / clearAll', () => {
    it('clears a specific track', () => {
      service.noteOn('track-1', 60, 80, 1.0);
      service.noteOff('track-1', 60, 1.5);
      service.clearTrack('track-1');
      expect(service.hasEvents('track-1')).toBe(false);
    });

    it('clears all tracks', () => {
      service.noteOn('track-1', 60, 80, 1.0);
      service.noteOn('track-2', 64, 90, 2.0);
      service.clearAll();
      expect(service.getActiveTrackIds()).toEqual([]);
    });
  });
});
