import { describe, it, expect } from 'vitest';
import { RingBuffer, nextPowerOf2 } from '../RingBuffer';

describe('nextPowerOf2', () => {
  it('returns 1 for 0 and 1', () => {
    expect(nextPowerOf2(0)).toBe(1);
    expect(nextPowerOf2(1)).toBe(1);
  });

  it('returns next power of 2 for non-powers', () => {
    expect(nextPowerOf2(3)).toBe(4);
    expect(nextPowerOf2(5)).toBe(8);
    expect(nextPowerOf2(100)).toBe(128);
    expect(nextPowerOf2(1000)).toBe(1024);
  });

  it('returns same value for powers of 2', () => {
    expect(nextPowerOf2(2)).toBe(2);
    expect(nextPowerOf2(4)).toBe(4);
    expect(nextPowerOf2(1024)).toBe(1024);
  });
});

describe('RingBuffer', () => {
  it('has correct initial state', () => {
    const rb = RingBuffer.create(1024, 2);
    expect(rb.availableRead).toBe(0);
    expect(rb.availableWrite).toBe(1024);
    expect(rb.capacity).toBe(1024);
    expect(rb.channelCount).toBe(2);
    expect(rb.channels).toBe(2);
  });

  it('rounds capacity to power of 2', () => {
    const rb = RingBuffer.create(100, 1);
    expect(rb.capacity).toBe(128);
  });

  it('write updates availableRead and availableWrite', () => {
    const rb = RingBuffer.create(1024, 1);
    const data = new Float32Array(100);
    const written = rb.write(data, 100);
    expect(written).toBe(100);
    expect(rb.availableRead).toBe(100);
    expect(rb.availableWrite).toBe(1024 - 100);
  });

  it('write then read preserves data (mono)', () => {
    const rb = RingBuffer.create(1024, 1);
    const input = new Float32Array(64);
    for (let i = 0; i < 64; i++) input[i] = i * 0.1;

    rb.write(input, 64);

    const output = new Float32Array(64);
    const readCount = rb.read(output, 64);
    expect(readCount).toBe(64);

    for (let i = 0; i < 64; i++) {
      expect(output[i]).toBeCloseTo(input[i], 5);
    }
  });

  it('write then read preserves data (stereo)', () => {
    const rb = RingBuffer.create(1024, 2);
    // Interleaved: [L0, R0, L1, R1, ...]
    const input = new Float32Array(128); // 64 frames x 2 channels
    for (let i = 0; i < 128; i++) input[i] = i * 0.01;

    rb.write(input, 64);

    const output = new Float32Array(128);
    const readCount = rb.read(output, 64);
    expect(readCount).toBe(64);

    for (let i = 0; i < 128; i++) {
      expect(output[i]).toBeCloseTo(input[i], 5);
    }
  });

  it('handles wrap-around correctly', () => {
    const rb = RingBuffer.create(8, 1); // capacity = 8
    const data = new Float32Array(6);
    for (let i = 0; i < 6; i++) data[i] = i + 1;

    rb.write(data, 6);
    const out1 = new Float32Array(4);
    rb.read(out1, 4); // read 4, freeing slots

    // Write 6 more (wraps around)
    const data2 = new Float32Array(6);
    for (let i = 0; i < 6; i++) data2[i] = (i + 1) * 10;
    rb.write(data2, 6);

    // Read all remaining: 2 from first write + 6 from second
    const out2 = new Float32Array(8);
    const readCount = rb.read(out2, 8);
    expect(readCount).toBe(8);
    expect(out2[0]).toBeCloseTo(5, 5); // last 2 from first write
    expect(out2[1]).toBeCloseTo(6, 5);
    expect(out2[2]).toBeCloseTo(10, 5); // 6 from second write
  });

  it('returns 0 on read when empty', () => {
    const rb = RingBuffer.create(1024, 1);
    const output = new Float32Array(10);
    expect(rb.read(output, 10)).toBe(0);
  });

  it('returns 0 on write when full', () => {
    const rb = RingBuffer.create(4, 1); // capacity = 4
    const full = new Float32Array(4);
    rb.write(full, 4);
    expect(rb.availableWrite).toBe(0);
    expect(rb.write(new Float32Array(1), 1)).toBe(0);
  });

  it('writeDeinterleaved and readDeinterleaved preserve data', () => {
    const rb = RingBuffer.create(1024, 2);
    const left = new Float32Array(32);
    const right = new Float32Array(32);
    for (let i = 0; i < 32; i++) {
      left[i] = i * 0.1;
      right[i] = i * -0.1;
    }

    rb.writeDeinterleaved([left, right], 32);

    const outL = new Float32Array(32);
    const outR = new Float32Array(32);
    const readCount = rb.readDeinterleaved([outL, outR], 32);
    expect(readCount).toBe(32);

    for (let i = 0; i < 32; i++) {
      expect(outL[i]).toBeCloseTo(left[i], 5);
      expect(outR[i]).toBeCloseTo(right[i], 5);
    }
  });

  it('reset clears the buffer', () => {
    const rb = RingBuffer.create(1024, 1);
    rb.write(new Float32Array(100), 100);
    expect(rb.availableRead).toBe(100);

    rb.reset();
    expect(rb.availableRead).toBe(0);
    expect(rb.availableWrite).toBe(1024);
  });

  it('wrap reconstructs from SharedArrayBuffer', () => {
    const rb1 = RingBuffer.create(256, 2);
    const data = new Float32Array(20); // 10 frames x 2ch
    for (let i = 0; i < 20; i++) data[i] = i;
    rb1.write(data, 10);

    // Wrap the same SAB (simulating AudioWorklet receiving it)
    const rb2 = RingBuffer.wrap(rb1.sharedBuffer, 2);
    expect(rb2.capacity).toBe(256);
    expect(rb2.availableRead).toBe(10);

    const output = new Float32Array(20);
    rb2.read(output, 10);
    for (let i = 0; i < 20; i++) {
      expect(output[i]).toBeCloseTo(i, 5);
    }
  });

  it('isSupported returns boolean', () => {
    expect(typeof RingBuffer.isSupported()).toBe('boolean');
  });
});
