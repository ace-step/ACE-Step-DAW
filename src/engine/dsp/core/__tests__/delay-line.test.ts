import { describe, it, expect, beforeEach } from 'vitest';
import { DelayLine } from '../delay-line';

describe('DelayLine', () => {
  let dl: DelayLine;

  beforeEach(() => {
    dl = new DelayLine(1024);
  });

  it('capacity is rounded to power of 2', () => {
    const d = new DelayLine(100);
    expect(d.capacity).toBe(128); // next pow2 of 101
  });

  it('minimum capacity is 4', () => {
    const d = new DelayLine(1);
    expect(d.capacity).toBeGreaterThanOrEqual(4);
  });

  it('readInt returns 0 for empty delay line', () => {
    expect(dl.readInt(0)).toBe(0);
    expect(dl.readInt(100)).toBe(0);
  });

  it('push + readInt(0) returns the last pushed sample', () => {
    dl.push(0.5);
    expect(dl.readInt(0)).toBeCloseTo(0.5, 10);
  });

  it('readInt returns correct delayed sample', () => {
    for (let i = 0; i < 10; i++) {
      dl.push(i * 0.1);
    }
    // readInt(0) = most recent = 0.9
    expect(dl.readInt(0)).toBeCloseTo(0.9, 5);
    // readInt(9) = oldest = 0.0
    expect(dl.readInt(9)).toBeCloseTo(0.0, 5);
    // readInt(5) = 0.4
    expect(dl.readInt(5)).toBeCloseTo(0.4, 5);
  });

  it('readLinear interpolates between samples', () => {
    dl.push(0);
    dl.push(1);
    // readLinear(0.5) should be between 0 and 1
    const val = dl.readLinear(0.5);
    expect(val).toBeCloseTo(0.5, 5);
  });

  it('readCubic returns value close to readInt for integer delay', () => {
    for (let i = 0; i < 20; i++) {
      dl.push(Math.sin(i * 0.5));
    }
    // For integer delay, cubic should be very close to integer read
    const intVal = dl.readInt(5);
    const cubicVal = dl.readCubic(5);
    expect(cubicVal).toBeCloseTo(intVal, 2);
  });

  it('processBlock applies delay with feedback', () => {
    const input = new Float32Array(128);
    input[0] = 1; // impulse
    const output = new Float32Array(128);

    const newDl = new DelayLine(128);
    newDl.processBlock(input, output, 0, 128, 10, 0.5);

    // Output at sample 0 should be 0 (no previous delay content)
    expect(Math.abs(output[0])).toBeLessThan(0.01);

    // Find the peak — the delayed impulse should appear near sample 10-11
    let peakIdx = 0;
    let peakVal = 0;
    for (let i = 0; i < 30; i++) {
      if (Math.abs(output[i]) > peakVal) {
        peakVal = Math.abs(output[i]);
        peakIdx = i;
      }
    }
    expect(peakIdx).toBeGreaterThanOrEqual(10);
    expect(peakIdx).toBeLessThanOrEqual(12);
    expect(peakVal).toBeGreaterThan(0.5);

    // Should have a second, smaller echo from feedback
    let secondPeakVal = 0;
    for (let i = peakIdx + 8; i < peakIdx + 14; i++) {
      if (Math.abs(output[i]) > secondPeakVal) {
        secondPeakVal = Math.abs(output[i]);
      }
    }
    expect(secondPeakVal).toBeGreaterThan(0);
    expect(secondPeakVal).toBeLessThan(peakVal);
  });

  it('reset clears all state', () => {
    for (let i = 0; i < 50; i++) dl.push(1);
    dl.reset();
    expect(dl.readInt(0)).toBe(0);
    expect(dl.readInt(10)).toBe(0);
  });
});
