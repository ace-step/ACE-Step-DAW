import { describe, it, expect } from 'vitest';
import { MidiCaptureBuffer } from '../midiCaptureBuffer';

function createBuffer(maxDurationSeconds = 30, maxEvents = 100) {
  return new MidiCaptureBuffer({ maxDurationSeconds, maxEvents });
}

describe('MidiCaptureBuffer', () => {
  describe('noteOn / noteOff', () => {
    it('records a completed note after noteOn + noteOff', () => {
      const buf = createBuffer();
      buf.noteOn(60, 0.8, 1.0);
      buf.noteOff(60, 1.5);
      const events = buf.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].pitch).toBe(60);
      expect(events[0].velocity).toBe(0.8);
      expect(events[0].timestamp).toBe(1.0);
      expect(events[0].duration).toBeCloseTo(0.5, 10);
    });

    it('ignores noteOff without a preceding noteOn', () => {
      const buf = createBuffer();
      buf.noteOff(60, 1.0);
      expect(buf.getEventCount()).toBe(0);
    });

    it('auto-closes a pending note on retrigger', () => {
      const buf = createBuffer();
      buf.noteOn(60, 0.8, 1.0);
      // Retrigger same pitch before noteOff
      buf.noteOn(60, 0.6, 1.3);
      // First note should be auto-closed with duration 0.3
      const events = buf.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].velocity).toBe(0.8);
      expect(events[0].duration).toBeCloseTo(0.3, 10);

      // Complete the second note
      buf.noteOff(60, 1.8);
      const allEvents = buf.getEvents();
      expect(allEvents.length).toBe(2);
      expect(allEvents[1].velocity).toBe(0.6);
      expect(allEvents[1].duration).toBeCloseTo(0.5, 10);
    });

    it('handles multiple pitches simultaneously', () => {
      const buf = createBuffer();
      buf.noteOn(60, 0.7, 1.0);
      buf.noteOn(64, 0.9, 1.0);
      buf.noteOff(60, 1.5);
      buf.noteOff(64, 2.0);
      const events = buf.getEvents();
      expect(events.length).toBe(2);
      expect(events[0].pitch).toBe(60);
      expect(events[0].duration).toBeCloseTo(0.5, 10);
      expect(events[1].pitch).toBe(64);
      expect(events[1].duration).toBeCloseTo(1.0, 10);
    });
  });

  describe('getEvents / getEventCount', () => {
    it('returns copies, not references', () => {
      const buf = createBuffer();
      buf.noteOn(60, 0.8, 1.0);
      buf.noteOff(60, 1.5);
      const events1 = buf.getEvents();
      const events2 = buf.getEvents();
      expect(events1[0]).not.toBe(events2[0]);
      expect(events1[0]).toEqual(events2[0]);
    });

    it('getEventCount matches getEvents length', () => {
      const buf = createBuffer();
      buf.noteOn(60, 0.8, 1.0);
      buf.noteOff(60, 1.5);
      buf.noteOn(64, 0.9, 2.0);
      buf.noteOff(64, 2.5);
      expect(buf.getEventCount()).toBe(2);
      expect(buf.getEvents().length).toBe(2);
    });
  });

  describe('eviction', () => {
    it('evicts events older than maxDurationSeconds', () => {
      const buf = createBuffer(5, 100);
      buf.noteOn(60, 0.8, 1.0);
      buf.noteOff(60, 1.5);
      // Add event far in the future to trigger eviction
      buf.noteOn(64, 0.9, 10.0);
      buf.noteOff(64, 10.5);
      // The first event at t=1.0 should be evicted (cutoff = 10.5 - 5 = 5.5)
      expect(buf.getEventCount()).toBe(1);
      expect(buf.getEvents()[0].pitch).toBe(64);
    });

    it('evicts oldest events when maxEvents exceeded', () => {
      const buf = createBuffer(9999, 3);
      for (let i = 0; i < 5; i++) {
        buf.noteOn(60 + i, 0.5, i);
        buf.noteOff(60 + i, i + 0.5);
      }
      expect(buf.getEventCount()).toBe(3);
      // Should keep the 3 most recent
      const events = buf.getEvents();
      expect(events[0].pitch).toBe(62);
      expect(events[1].pitch).toBe(63);
      expect(events[2].pitch).toBe(64);
    });
  });

  describe('capture', () => {
    it('captures all events when no window specified', () => {
      const buf = createBuffer();
      buf.noteOn(60, 0.8, 5.0);
      buf.noteOff(60, 5.5);
      buf.noteOn(64, 0.9, 6.0);
      buf.noteOff(64, 6.5);
      const captured = buf.capture();
      expect(captured.length).toBe(2);
      // Timestamps normalized to start at 0
      expect(captured[0].timestamp).toBe(0);
      expect(captured[1].timestamp).toBeCloseTo(1.0, 10);
    });

    it('captures events within a time window', () => {
      const buf = createBuffer();
      buf.noteOn(60, 0.8, 1.0);
      buf.noteOff(60, 1.5);
      buf.noteOn(64, 0.9, 3.0);
      buf.noteOff(64, 3.5);
      buf.noteOn(67, 0.7, 5.0);
      buf.noteOff(67, 5.5);

      const captured = buf.capture(2.5, 4.0);
      expect(captured.length).toBe(1);
      expect(captured[0].pitch).toBe(64);
      expect(captured[0].timestamp).toBe(0); // normalized
    });

    it('returns empty array when no events match window', () => {
      const buf = createBuffer();
      buf.noteOn(60, 0.8, 1.0);
      buf.noteOff(60, 1.5);
      const captured = buf.capture(5.0, 10.0);
      expect(captured).toEqual([]);
    });

    it('normalizes timestamps to start at 0', () => {
      const buf = createBuffer();
      buf.noteOn(60, 0.8, 100.0);
      buf.noteOff(60, 100.3);
      buf.noteOn(64, 0.5, 100.5);
      buf.noteOff(64, 100.8);

      const captured = buf.capture();
      expect(captured[0].timestamp).toBe(0);
      expect(captured[1].timestamp).toBeCloseTo(0.5, 10);
      // Durations should be preserved
      expect(captured[0].duration).toBeCloseTo(0.3, 10);
      expect(captured[1].duration).toBeCloseTo(0.3, 10);
    });
  });

  describe('clear', () => {
    it('removes all events and pending notes', () => {
      const buf = createBuffer();
      buf.noteOn(60, 0.8, 1.0);
      buf.noteOff(60, 1.5);
      buf.noteOn(64, 0.9, 2.0); // pending (no noteOff)
      buf.clear();
      expect(buf.getEventCount()).toBe(0);
      // noteOff after clear should not produce an event
      buf.noteOff(64, 3.0);
      expect(buf.getEventCount()).toBe(0);
    });
  });
});
