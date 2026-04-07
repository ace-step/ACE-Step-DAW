import { describe, it, expect, beforeEach } from 'vitest';
import { MpeCaptureService } from '../mpeCaptureService';
import type { MpeExpressionData } from '../../types/project';

describe('MpeCaptureService', () => {
  let svc: MpeCaptureService;

  beforeEach(() => {
    svc = new MpeCaptureService();
  });

  describe('expression recording', () => {
    it('records pitch bend curve for a note', () => {
      svc.noteOn('track1', 1, 60, 100, 0.0);
      svc.recordPitchBend('track1', 1, 1000, 0.5);
      svc.recordPitchBend('track1', 1, 2000, 1.0);
      svc.noteOff('track1', 1, 60, 2.0);

      const events = svc.getBuffer('track1');
      expect(events).toHaveLength(1);
      expect(events[0].expression.pitchBendCurve).toEqual([
        { time: 0.5, value: 1000 },
        { time: 1.0, value: 2000 },
      ]);
    });

    it('records timbre (CC74) curve for a note', () => {
      svc.noteOn('track1', 1, 60, 100, 0.0);
      svc.recordTimbre('track1', 1, 120, 0.3);
      svc.noteOff('track1', 1, 60, 1.0);

      const events = svc.getBuffer('track1');
      expect(events[0].expression.timbreCurve).toEqual([
        { time: 0.3, value: 120 },
      ]);
    });

    it('records pressure (aftertouch) curve for a note', () => {
      svc.noteOn('track1', 1, 60, 100, 0.0);
      svc.recordPressure('track1', 1, 80, 0.2);
      svc.recordPressure('track1', 1, 100, 0.6);
      svc.noteOff('track1', 1, 60, 1.0);

      const events = svc.getBuffer('track1');
      expect(events[0].expression.pressureCurve).toEqual([
        { time: 0.2, value: 80 },
        { time: 0.6, value: 100 },
      ]);
    });

    it('tracks expression per channel (multiple simultaneous notes)', () => {
      svc.noteOn('track1', 1, 60, 100, 0.0);
      svc.noteOn('track1', 2, 64, 80, 0.1);

      svc.recordPitchBend('track1', 1, 500, 0.5);
      svc.recordPitchBend('track1', 2, -500, 0.5);

      svc.noteOff('track1', 1, 60, 1.0);
      svc.noteOff('track1', 2, 64, 1.0);

      const events = svc.getBuffer('track1');
      expect(events).toHaveLength(2);

      const note60 = events.find((e) => e.pitch === 60)!;
      const note64 = events.find((e) => e.pitch === 64)!;
      expect(note60.expression.pitchBendCurve![0].value).toBe(500);
      expect(note64.expression.pitchBendCurve![0].value).toBe(-500);
    });
  });

  describe('drain to MidiNote format', () => {
    it('converts expression times from absolute to beat-relative', () => {
      const bpm = 120;
      svc.noteOn('track1', 1, 60, 100, 1.0);
      svc.recordPitchBend('track1', 1, 4096, 1.5);
      svc.noteOff('track1', 1, 60, 2.0);

      const result = svc.drain('track1', 2.0, bpm, 4, 1);
      expect(result).not.toBeNull();
      expect(result!.notes).toHaveLength(1);

      const note = result!.notes[0];
      expect(note.mpeExpression).toBeDefined();
      // At 120 BPM, 1 beat = 0.5s
      // Note starts at 1.0s, expression at 1.5s → 0.5s offset = 1 beat
      expect(note.mpeExpression!.pitchBendCurve![0].beat).toBeCloseTo(1.0, 2);
      expect(note.mpeExpression!.pitchBendCurve![0].value).toBe(4096);
    });

    it('returns null when no events exist', () => {
      expect(svc.drain('notrack', 1.0, 120, 4, 1)).toBeNull();
    });

    it('omits empty expression curves', () => {
      svc.noteOn('track1', 1, 60, 100, 0.0);
      svc.noteOff('track1', 1, 60, 1.0);

      const result = svc.drain('track1', 1.0, 120, 4, 1);
      expect(result).not.toBeNull();
      // No expression data recorded → mpeExpression should be undefined
      expect(result!.notes[0].mpeExpression).toBeUndefined();
    });
  });

  describe('clearAll', () => {
    it('clears all buffers and active notes', () => {
      svc.noteOn('track1', 1, 60, 100, 0.0);
      svc.clearAll();
      expect(svc.getBuffer('track1')).toHaveLength(0);
    });
  });
});
