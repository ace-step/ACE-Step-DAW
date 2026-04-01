/**
 * Shared mock types and factory functions for Web Audio API testing.
 *
 * Used by TrackNode and ReturnTrackNode test suites to avoid `as any` casts
 * while providing type-safe access to mock internals (e.g. rampCalls).
 */
import { vi, type Mock } from 'vitest';

export interface MockAudioParam {
  value: number;
  linearRampToValueAtTime(value: number, endTime: number): MockAudioParam;
  setValueAtTime(value: number, time: number): MockAudioParam;
  cancelScheduledValues(time?: number): MockAudioParam;
  rampCalls: { value: number; endTime: number }[];
}

export interface MockNode {
  connect: Mock;
  disconnect: Mock;
  [key: string]: unknown;
}

export function makeAudioParam(initial = 0): MockAudioParam {
  let _value = initial;
  const rampCalls: { value: number; endTime: number }[] = [];
  const param: MockAudioParam = {
    get value() { return _value; },
    set value(v: number) { _value = v; },
    linearRampToValueAtTime(value: number, endTime: number) {
      rampCalls.push({ value, endTime });
      _value = value;
      return param;
    },
    setValueAtTime(value: number, _time: number) {
      _value = value;
      return param;
    },
    cancelScheduledValues() { return param; },
    rampCalls,
  };
  return param;
}

export function makeNode(overrides: Record<string, unknown> = {}): MockNode {
  return {
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    ...overrides,
  };
}
