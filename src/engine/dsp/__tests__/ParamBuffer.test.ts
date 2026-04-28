import { describe, it, expect } from 'vitest';
import { ParamBuffer } from '../ParamBuffer';

describe('ParamBuffer', () => {
  it('has correct initial state', () => {
    const pb = ParamBuffer.create(8);
    expect(pb.count).toBe(8);
    for (let i = 0; i < 8; i++) {
      expect(pb.get(i)).toBe(0);
      expect(pb.isDirty(i)).toBe(false);
    }
  });

  it('set updates value and marks dirty', () => {
    const pb = ParamBuffer.create(4);
    pb.set(0, 440.0);
    expect(pb.get(0)).toBeCloseTo(440.0, 1);
    expect(pb.isDirty(0)).toBe(true);
    expect(pb.isDirty(1)).toBe(false);
  });

  it('consume returns value and clears dirty flag', () => {
    const pb = ParamBuffer.create(4);
    pb.set(2, 0.75);

    const [value, wasDirty] = pb.consume(2);
    expect(value).toBeCloseTo(0.75, 2);
    expect(wasDirty).toBe(true);

    // Second consume should not be dirty
    const [value2, wasDirty2] = pb.consume(2);
    expect(value2).toBeCloseTo(0.75, 2);
    expect(wasDirty2).toBe(false);
  });

  it('consumeAll reads all dirty params into target', () => {
    const pb = ParamBuffer.create(4);
    pb.set(0, 100);
    pb.set(2, 200);

    const target = new Float32Array(4);
    const dirtyCount = pb.consumeAll(target);
    expect(dirtyCount).toBe(2);
    expect(target[0]).toBeCloseTo(100, 1);
    expect(target[1]).toBe(0); // was not set
    expect(target[2]).toBeCloseTo(200, 1);

    // All should be clean now
    expect(pb.isDirty(0)).toBe(false);
    expect(pb.isDirty(2)).toBe(false);
  });

  it('reset clears all values and dirty flags', () => {
    const pb = ParamBuffer.create(4);
    pb.set(0, 1.0);
    pb.set(1, 2.0);
    pb.reset();

    for (let i = 0; i < 4; i++) {
      expect(pb.get(i)).toBe(0);
      expect(pb.isDirty(i)).toBe(false);
    }
  });

  it('wrap reconstructs from SharedArrayBuffer', () => {
    const pb1 = ParamBuffer.create(8);
    pb1.set(3, 99.5);

    const pb2 = ParamBuffer.wrap(pb1.sharedBuffer, 8);
    expect(pb2.get(3)).toBeCloseTo(99.5, 1);
    expect(pb2.isDirty(3)).toBe(true);
  });

  it('multiple sets to same param keep latest value', () => {
    const pb = ParamBuffer.create(4);
    pb.set(0, 100);
    pb.set(0, 200);
    pb.set(0, 300);

    const [value, dirty] = pb.consume(0);
    expect(value).toBeCloseTo(300, 1);
    expect(dirty).toBe(true);
  });
});
