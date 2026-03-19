import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('tempoMap store actions', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject({ bpm: 120 });
  });

  describe('addTempoEvent', () => {
    it('adds a tempo event to an empty map', () => {
      useProjectStore.getState().addTempoEvent({ beat: 0, bpm: 100 });
      const map = useProjectStore.getState().project!.tempoMap!;
      expect(map).toHaveLength(1);
      expect(map[0]).toEqual({ beat: 0, bpm: 100 });
    });

    it('keeps events sorted by beat', () => {
      useProjectStore.getState().addTempoEvent({ beat: 8, bpm: 140 });
      useProjectStore.getState().addTempoEvent({ beat: 0, bpm: 100 });
      const map = useProjectStore.getState().project!.tempoMap!;
      expect(map).toHaveLength(2);
      expect(map[0].beat).toBe(0);
      expect(map[1].beat).toBe(8);
    });

    it('replaces an event at the same beat', () => {
      useProjectStore.getState().addTempoEvent({ beat: 4, bpm: 100 });
      useProjectStore.getState().addTempoEvent({ beat: 4, bpm: 160 });
      const map = useProjectStore.getState().project!.tempoMap!;
      expect(map).toHaveLength(1);
      expect(map[0].bpm).toBe(160);
    });

    it('supports ramp flag', () => {
      useProjectStore.getState().addTempoEvent({ beat: 0, bpm: 100 });
      useProjectStore.getState().addTempoEvent({ beat: 8, bpm: 140, ramp: true });
      const map = useProjectStore.getState().project!.tempoMap!;
      expect(map[1].ramp).toBe(true);
    });
  });

  describe('removeTempoEvent', () => {
    it('removes an event by beat', () => {
      useProjectStore.getState().addTempoEvent({ beat: 0, bpm: 100 });
      useProjectStore.getState().addTempoEvent({ beat: 8, bpm: 140 });
      useProjectStore.getState().removeTempoEvent(0);
      const map = useProjectStore.getState().project!.tempoMap!;
      expect(map).toHaveLength(1);
      expect(map[0].beat).toBe(8);
    });
  });

  describe('updateTempoEvent', () => {
    it('updates BPM of an existing event', () => {
      useProjectStore.getState().addTempoEvent({ beat: 4, bpm: 100 });
      useProjectStore.getState().updateTempoEvent(4, { bpm: 180 });
      const map = useProjectStore.getState().project!.tempoMap!;
      expect(map[0].bpm).toBe(180);
      expect(map[0].beat).toBe(4);
    });
  });

  describe('clearTempoMap', () => {
    it('removes all tempo events', () => {
      useProjectStore.getState().addTempoEvent({ beat: 0, bpm: 100 });
      useProjectStore.getState().addTempoEvent({ beat: 8, bpm: 140 });
      useProjectStore.getState().clearTempoMap();
      expect(useProjectStore.getState().project!.tempoMap).toEqual([]);
    });
  });

  describe('totalDuration recomputation', () => {
    it('recomputes totalDuration when tempo event is added', () => {
      const durationBefore = useProjectStore.getState().project!.totalDuration;
      // Adding a slower tempo should increase total duration
      useProjectStore.getState().addTempoEvent({ beat: 0, bpm: 60 });
      const durationAfter = useProjectStore.getState().project!.totalDuration;
      expect(durationAfter).toBeGreaterThan(durationBefore);
    });

    it('recomputes totalDuration when tempo event is removed', () => {
      useProjectStore.getState().addTempoEvent({ beat: 0, bpm: 60 });
      const durationWithSlow = useProjectStore.getState().project!.totalDuration;
      useProjectStore.getState().removeTempoEvent(0);
      const durationAfter = useProjectStore.getState().project!.totalDuration;
      expect(durationAfter).toBeLessThan(durationWithSlow);
    });

    it('recomputes totalDuration when tempo map is cleared', () => {
      useProjectStore.getState().addTempoEvent({ beat: 0, bpm: 60 });
      const durationWithSlow = useProjectStore.getState().project!.totalDuration;
      useProjectStore.getState().clearTempoMap();
      const durationAfter = useProjectStore.getState().project!.totalDuration;
      expect(durationAfter).toBeLessThan(durationWithSlow);
    });
  });
});

describe('timeSignatureMap store actions', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
  });

  describe('addTimeSignatureEvent', () => {
    it('adds a time signature event', () => {
      useProjectStore.getState().addTimeSignatureEvent({ bar: 1, numerator: 3, denominator: 4 });
      const map = useProjectStore.getState().project!.timeSignatureMap!;
      expect(map).toHaveLength(1);
      expect(map[0]).toEqual({ bar: 1, numerator: 3, denominator: 4 });
    });

    it('keeps events sorted by bar', () => {
      useProjectStore.getState().addTimeSignatureEvent({ bar: 5, numerator: 3, denominator: 4 });
      useProjectStore.getState().addTimeSignatureEvent({ bar: 1, numerator: 4, denominator: 4 });
      const map = useProjectStore.getState().project!.timeSignatureMap!;
      expect(map[0].bar).toBe(1);
      expect(map[1].bar).toBe(5);
    });

    it('replaces an event at the same bar', () => {
      useProjectStore.getState().addTimeSignatureEvent({ bar: 1, numerator: 4, denominator: 4 });
      useProjectStore.getState().addTimeSignatureEvent({ bar: 1, numerator: 6, denominator: 8 });
      const map = useProjectStore.getState().project!.timeSignatureMap!;
      expect(map).toHaveLength(1);
      expect(map[0].numerator).toBe(6);
    });
  });

  describe('removeTimeSignatureEvent', () => {
    it('removes event by bar', () => {
      useProjectStore.getState().addTimeSignatureEvent({ bar: 1, numerator: 4, denominator: 4 });
      useProjectStore.getState().addTimeSignatureEvent({ bar: 5, numerator: 3, denominator: 4 });
      useProjectStore.getState().removeTimeSignatureEvent(1);
      const map = useProjectStore.getState().project!.timeSignatureMap!;
      expect(map).toHaveLength(1);
      expect(map[0].bar).toBe(5);
    });
  });

  describe('clearTimeSignatureMap', () => {
    it('removes all time signature events', () => {
      useProjectStore.getState().addTimeSignatureEvent({ bar: 1, numerator: 4, denominator: 4 });
      useProjectStore.getState().clearTimeSignatureMap();
      expect(useProjectStore.getState().project!.timeSignatureMap).toEqual([]);
    });
  });

  describe('totalDuration recomputation', () => {
    it('recomputes totalDuration when time signature event changes beats per bar', () => {
      const durationBefore = useProjectStore.getState().project!.totalDuration;
      // Changing to 6/8 effectively increases beats per bar from 4 to 6
      useProjectStore.getState().addTimeSignatureEvent({ bar: 1, numerator: 6, denominator: 8 });
      const durationAfter = useProjectStore.getState().project!.totalDuration;
      expect(durationAfter).toBeGreaterThan(durationBefore);
    });
  });
});
