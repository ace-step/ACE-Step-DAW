import { describe, expect, it } from 'vitest';
import { RingBuffer } from '../ringBuffer';

describe('RingBuffer', () => {
  it('initial state: availableRead=0, availableWrite=capacity', () => {
    const rb = RingBuffer.create(1024, 2);
    expect(rb.availableRead).toBe(0);
    expect(rb.availableWrite).toBe(1024);
    expect(rb.capacity).toBe(1024);
    expect(rb.channelCount).toBe(2);
  });

  it('write N frames, verify availableRead=N, availableWrite=capacity-N', () => {
    const rb = RingBuffer.create(1024, 1);
    const data = new Float32Array(100);
    for (let i = 0; i < 100; i++) data[i] = i * 0.01;

    const written = rb.write(data, 100);
    expect(written).toBe(100);
    expect(rb.availableRead).toBe(100);
    expect(rb.availableWrite).toBe(1024 - 100);
  });

  it('write then read N frames, data matches', () => {
    const rb = RingBuffer.create(1024, 1);
    const input = new Float32Array(64);
    for (let i = 0; i < 64; i++) input[i] = i * 0.1;

    rb.write(input, 64);

    const output = new Float32Array(64);
    const read = rb.read(output, 64);
    expect(read).toBe(64);
    expect(output).toEqual(input);
    expect(rb.availableRead).toBe(0);
    expect(rb.availableWrite).toBe(1024);
  });

  it('multi-channel stereo write/read round-trip', () => {
    const rb = RingBuffer.create(512, 2);
    const frames = 128;
    // Interleaved: L0 R0 L1 R1 ...
    const input = new Float32Array(frames * 2);
    for (let i = 0; i < frames; i++) {
      input[i * 2] = i * 0.01;       // left
      input[i * 2 + 1] = -i * 0.01;  // right
    }

    const written = rb.write(input, frames);
    expect(written).toBe(frames);
    expect(rb.availableRead).toBe(frames);

    const output = new Float32Array(frames * 2);
    const read = rb.read(output, frames);
    expect(read).toBe(frames);
    expect(output).toEqual(input);
  });

  it('buffer overflow: write more than capacity, only capacity frames stored', () => {
    const rb = RingBuffer.create(64, 1);
    const cap = rb.capacity; // 64
    const input = new Float32Array(cap + 32);
    for (let i = 0; i < input.length; i++) input[i] = i;

    const written = rb.write(input, cap + 32);
    // Should only write up to capacity
    expect(written).toBe(cap);
    expect(rb.availableRead).toBe(cap);
    expect(rb.availableWrite).toBe(0);
  });

  it('buffer underflow: read from empty buffer returns 0', () => {
    const rb = RingBuffer.create(256, 1);
    const output = new Float32Array(64);
    const read = rb.read(output, 64);
    expect(read).toBe(0);
  });

  it('wrap-around: fill buffer, read half, write more, verify data integrity', () => {
    const rb = RingBuffer.create(8, 1);
    const cap = rb.capacity; // 8

    // Fill completely
    const fill = new Float32Array(cap);
    for (let i = 0; i < cap; i++) fill[i] = i + 1;
    rb.write(fill, cap);
    expect(rb.availableRead).toBe(cap);

    // Read half
    const half = new Float32Array(4);
    rb.read(half, 4);
    expect(half[0]).toBe(1);
    expect(half[3]).toBe(4);
    expect(rb.availableRead).toBe(4);
    expect(rb.availableWrite).toBe(4);

    // Write 4 more (wraps around)
    const more = new Float32Array([100, 200, 300, 400]);
    const written = rb.write(more, 4);
    expect(written).toBe(4);
    expect(rb.availableRead).toBe(cap);

    // Read all 8 and verify order
    const all = new Float32Array(cap);
    rb.read(all, cap);
    // Should be: 5,6,7,8 (remaining original) then 100,200,300,400 (newly written)
    expect(all[0]).toBe(5);
    expect(all[1]).toBe(6);
    expect(all[2]).toBe(7);
    expect(all[3]).toBe(8);
    expect(all[4]).toBe(100);
    expect(all[5]).toBe(200);
    expect(all[6]).toBe(300);
    expect(all[7]).toBe(400);
  });

  it('writeDeinterleaved/readDeinterleaved round-trip', () => {
    const rb = RingBuffer.create(256, 2);
    const frames = 64;
    const left = new Float32Array(frames);
    const right = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      left[i] = i * 0.01;
      right[i] = -i * 0.01;
    }

    const written = rb.writeDeinterleaved([left, right], frames);
    expect(written).toBe(frames);

    const outLeft = new Float32Array(frames);
    const outRight = new Float32Array(frames);
    const read = rb.readDeinterleaved([outLeft, outRight], frames);
    expect(read).toBe(frames);

    for (let i = 0; i < frames; i++) {
      expect(outLeft[i]).toBeCloseTo(left[i], 6);
      expect(outRight[i]).toBeCloseTo(right[i], 6);
    }
  });

  it('reset: write data, reset, verify empty', () => {
    const rb = RingBuffer.create(256, 1);
    const data = new Float32Array(100);
    rb.write(data, 100);
    expect(rb.availableRead).toBe(100);

    rb.reset();
    expect(rb.availableRead).toBe(0);
    expect(rb.availableWrite).toBe(256);
  });

  it('power-of-2 rounding: create with non-power-of-2, verify rounded up', () => {
    const rb = RingBuffer.create(100, 1);
    expect(rb.capacity).toBe(128); // next power of 2 above 100

    const rb2 = RingBuffer.create(7, 2);
    expect(rb2.capacity).toBe(8);

    const rb3 = RingBuffer.create(1, 1);
    expect(rb3.capacity).toBe(1);

    const rb4 = RingBuffer.create(256, 1);
    expect(rb4.capacity).toBe(256); // already power of 2
  });

  it('wrap: reconstruct from SharedArrayBuffer', () => {
    const rb1 = RingBuffer.create(512, 2);
    const frames = 64;
    const input = new Float32Array(frames * 2);
    for (let i = 0; i < input.length; i++) input[i] = i * 0.001;

    rb1.write(input, frames);

    // Wrap the same SAB (simulating AudioWorklet receiving it)
    const rb2 = RingBuffer.wrap(rb1.sharedBuffer, 2);
    expect(rb2.availableRead).toBe(frames);
    expect(rb2.capacity).toBe(512);
    expect(rb2.channelCount).toBe(2);

    const output = new Float32Array(frames * 2);
    const read = rb2.read(output, frames);
    expect(read).toBe(frames);
    expect(output).toEqual(input);
  });

  it('partial read: read fewer frames than available', () => {
    const rb = RingBuffer.create(256, 1);
    const input = new Float32Array(100);
    for (let i = 0; i < 100; i++) input[i] = i;
    rb.write(input, 100);

    const out = new Float32Array(30);
    const read = rb.read(out, 30);
    expect(read).toBe(30);
    for (let i = 0; i < 30; i++) expect(out[i]).toBe(i);
    expect(rb.availableRead).toBe(70);
  });

  it('partial write: write when partially full', () => {
    const rb = RingBuffer.create(8, 1);
    const cap = rb.capacity;

    // Fill 6 of 8
    const data = new Float32Array(6).fill(1);
    rb.write(data, 6);
    expect(rb.availableWrite).toBe(cap - 6);

    // Try to write 4 more, only 2 should fit
    const more = new Float32Array([10, 20, 30, 40]);
    const written = rb.write(more, 4);
    expect(written).toBe(2);
    expect(rb.availableRead).toBe(cap);
  });
});
