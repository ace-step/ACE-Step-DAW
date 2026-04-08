import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MidiMappingEngine } from '../midiMappingEngine';
import type { MidiMapping, MidiMessage } from '../../types/midiController';

function makeMapping(overrides: Partial<MidiMapping> = {}): MidiMapping {
  return {
    id: 'map-1',
    deviceId: 'dev-1',
    deviceName: 'Controller',
    channel: 0,
    controlType: 'cc',
    controlNumber: 7,
    targetParam: 'track:t1:volume',
    targetLabel: 'Track 1 Volume',
    min: 0,
    max: 1,
    ...overrides,
  };
}

function makeMessage(overrides: Partial<MidiMessage> = {}): MidiMessage {
  return {
    deviceId: 'dev-1',
    channel: 0,
    type: 'cc',
    control: 7,
    value: 64,
    timestamp: 1000,
    ...overrides,
  };
}

describe('MidiMappingEngine', () => {
  let engine: MidiMappingEngine;

  beforeEach(() => {
    engine = new MidiMappingEngine();
  });

  describe('value scaling', () => {
    it('scales CC 0 to min value', () => {
      const mapping = makeMapping({ min: 0, max: 1 });
      const result = engine.resolveValue(makeMessage({ value: 0 }), mapping);
      expect(result).toBeCloseTo(0);
    });

    it('scales CC 127 to max value', () => {
      const mapping = makeMapping({ min: 0, max: 1 });
      const result = engine.resolveValue(makeMessage({ value: 127 }), mapping);
      expect(result).toBeCloseTo(1);
    });

    it('scales CC 64 to midpoint', () => {
      const mapping = makeMapping({ min: 0, max: 1 });
      const result = engine.resolveValue(makeMessage({ value: 64 }), mapping);
      expect(result).toBeCloseTo(0.5039, 2);
    });

    it('respects custom min/max range', () => {
      const mapping = makeMapping({ min: -12, max: 12 });
      const result = engine.resolveValue(makeMessage({ value: 0 }), mapping);
      expect(result).toBeCloseTo(-12);

      const result2 = engine.resolveValue(makeMessage({ value: 127 }), mapping);
      expect(result2).toBeCloseTo(12);
    });

    it('scales pitchBend 14-bit values', () => {
      const mapping = makeMapping({ controlType: 'pitchBend', min: -1, max: 1 });
      // Center position (8192 of 16383)
      const result = engine.resolveValue(
        makeMessage({ type: 'pitchBend', value: 8192 }),
        mapping,
      );
      expect(result).toBeCloseTo(0, 1);

      // Max
      const resultMax = engine.resolveValue(
        makeMessage({ type: 'pitchBend', value: 16383 }),
        mapping,
      );
      expect(resultMax).toBeCloseTo(1);
    });
  });

  describe('parameter resolution', () => {
    it('parses track:id:volume target', () => {
      const result = engine.parseTarget('track:t1:volume');
      expect(result).toEqual({ scope: 'track', trackId: 't1', param: 'volume' });
    });

    it('parses track:id:pan target', () => {
      const result = engine.parseTarget('track:t2:pan');
      expect(result).toEqual({ scope: 'track', trackId: 't2', param: 'pan' });
    });

    it('parses track:id:send:idx target', () => {
      const result = engine.parseTarget('track:t1:send:0');
      expect(result).toEqual({ scope: 'track', trackId: 't1', param: 'send', index: 0 });
    });

    it('parses transport:bpm target', () => {
      const result = engine.parseTarget('transport:bpm');
      expect(result).toEqual({ scope: 'transport', param: 'bpm' });
    });

    it('parses master:volume target', () => {
      const result = engine.parseTarget('master:volume');
      expect(result).toEqual({ scope: 'master', param: 'volume' });
    });

    it('returns null for invalid target', () => {
      expect(engine.parseTarget('')).toBeNull();
      expect(engine.parseTarget('invalid')).toBeNull();
    });
  });

  describe('applyValue callback', () => {
    it('calls the registered handler for track volume', () => {
      const handler = vi.fn();
      engine.registerHandler('track', handler);

      const mapping = makeMapping({ targetParam: 'track:t1:volume' });
      engine.processMessage(makeMessage({ value: 100 }), mapping);

      expect(handler).toHaveBeenCalledWith(
        { scope: 'track', trackId: 't1', param: 'volume' },
        expect.closeTo(100 / 127, 2),
      );
    });

    it('calls the registered handler for transport', () => {
      const handler = vi.fn();
      engine.registerHandler('transport', handler);

      const mapping = makeMapping({
        targetParam: 'transport:bpm',
        min: 60,
        max: 200,
      });
      engine.processMessage(makeMessage({ value: 127 }), mapping);

      expect(handler).toHaveBeenCalledWith(
        { scope: 'transport', param: 'bpm' },
        200,
      );
    });

    it('does nothing when no handler is registered', () => {
      const mapping = makeMapping({ targetParam: 'track:t1:volume' });
      // Should not throw
      expect(() => engine.processMessage(makeMessage(), mapping)).not.toThrow();
    });
  });

  describe('buildTargetId', () => {
    it('builds track volume target', () => {
      expect(MidiMappingEngine.buildTargetId('track', 't1', 'volume')).toBe('track:t1:volume');
    });

    it('builds transport bpm target', () => {
      expect(MidiMappingEngine.buildTargetId('transport', undefined, 'bpm')).toBe('transport:bpm');
    });

    it('builds master volume target', () => {
      expect(MidiMappingEngine.buildTargetId('master', undefined, 'volume')).toBe('master:volume');
    });

    it('builds send target with index', () => {
      expect(MidiMappingEngine.buildTargetId('track', 't1', 'send', 0)).toBe('track:t1:send:0');
    });
  });
});
