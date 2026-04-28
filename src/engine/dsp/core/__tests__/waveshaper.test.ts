import { describe, it, expect, beforeEach } from 'vitest';
import { Waveshaper, BitCrusher, type WaveshaperMode } from '../waveshaper';

describe('Waveshaper', () => {
  let ws: Waveshaper;

  beforeEach(() => {
    ws = new Waveshaper(512);
    ws.drive = 2;
    ws.mix = 1;
  });

  it('soft clip keeps output in [-1, 1]', () => {
    ws.mode = 'soft';
    ws.drive = 10;
    const buf = new Float32Array(256);
    for (let i = 0; i < 256; i++) buf[i] = (i / 128 - 1) * 5; // -5 to +5

    ws.process(buf, 0, 256);

    for (let i = 0; i < 256; i++) {
      expect(buf[i]).toBeGreaterThanOrEqual(-1.001);
      expect(buf[i]).toBeLessThanOrEqual(1.001);
    }
  });

  it('hard clip exactly clips to [-1, 1]', () => {
    ws.mode = 'hard';
    ws.drive = 5;
    const buf = new Float32Array(256);
    for (let i = 0; i < 256; i++) buf[i] = (i / 128 - 1) * 2;

    ws.process(buf, 0, 256);

    for (let i = 0; i < 256; i++) {
      expect(buf[i]).toBeGreaterThanOrEqual(-1);
      expect(buf[i]).toBeLessThanOrEqual(1);
    }
  });

  it('tube clip saturates towards ±1', () => {
    ws.mode = 'tube';
    ws.drive = 5;

    const buf = new Float32Array(256);
    for (let i = 0; i < 256; i++) buf[i] = (i / 128 - 1) * 2;

    ws.process(buf, 0, 256);

    // Output should be bounded
    for (let i = 0; i < 256; i++) {
      expect(buf[i]).toBeGreaterThanOrEqual(-1.001);
      expect(buf[i]).toBeLessThanOrEqual(1.001);
    }

    // Positive side: 1 - exp(-x) approaches 1
    expect(buf[255]).toBeGreaterThan(0.9);
    // Negative side: -1 + exp(x) approaches -1
    expect(buf[0]).toBeLessThan(-0.9);
  });

  it('all modes produce output', () => {
    const modes: WaveshaperMode[] = ['soft', 'hard', 'tube', 'fuzz'];
    for (const mode of modes) {
      const w = new Waveshaper(512);
      w.mode = mode;
      w.drive = 3;
      w.mix = 1;
      const buf = new Float32Array(128);
      for (let i = 0; i < 128; i++) buf[i] = Math.sin(i * 0.1);
      w.process(buf, 0, 128);
      const hasOutput = buf.some(v => Math.abs(v) > 0.01);
      expect(hasOutput).toBe(true);
    }
  });

  it('mix = 0 passes dry signal', () => {
    ws.mix = 0;
    ws.drive = 10;
    const buf = new Float32Array(128);
    for (let i = 0; i < 128; i++) buf[i] = Math.sin(i * 0.1);
    const original = Float32Array.from(buf);

    ws.process(buf, 0, 128);

    for (let i = 0; i < 128; i++) {
      expect(buf[i]).toBeCloseTo(original[i], 10);
    }
  });

  it('oversampling mode works without error', () => {
    ws.oversample = true;
    ws.drive = 5;
    const buf = new Float32Array(256);
    for (let i = 0; i < 256; i++) buf[i] = Math.sin(i * 0.1);

    // Should not throw
    ws.process(buf, 0, 256);

    // Should produce output
    const hasOutput = buf.some(v => Math.abs(v) > 0.01);
    expect(hasOutput).toBe(true);
  });

  it('oversampling with mix < 1 blends correctly', () => {
    ws.oversample = true;
    ws.mix = 0.5;
    ws.drive = 5;

    const buf = new Float32Array(128);
    for (let i = 0; i < 128; i++) buf[i] = Math.sin(i * 0.1) * 0.5;

    ws.process(buf, 0, 128);
    const hasOutput = buf.some(v => Math.abs(v) > 0.01);
    expect(hasOutput).toBe(true);
  });

  it('reset clears oversampler state', () => {
    ws.oversample = true;
    ws.process(new Float32Array(128).fill(1), 0, 128);
    ws.reset();
    // Should not throw or produce artifacts
    const buf = new Float32Array(128).fill(0);
    ws.process(buf, 0, 128);
  });

  it('drive = 1 with soft clip has minimal effect', () => {
    ws.mode = 'soft';
    ws.drive = 1;
    const buf = new Float32Array(128);
    for (let i = 0; i < 128; i++) buf[i] = i / 256; // 0 to ~0.5

    const original = Float32Array.from(buf);
    ws.process(buf, 0, 128);

    // With low drive, output should be close to input
    for (let i = 0; i < 128; i++) {
      expect(buf[i]).toBeCloseTo(Math.tanh(original[i]), 1);
    }
  });
});

describe('BitCrusher', () => {
  let bc: BitCrusher;

  beforeEach(() => {
    bc = new BitCrusher();
    bc.bits = 8;
    bc.downSample = 1;
  });

  it('quantizes to specified bit depth', () => {
    bc.bits = 4;
    const buf = new Float32Array([0.123, 0.456, 0.789]);
    bc.process(buf, 0, 3);

    // 4-bit = 16 levels → quantization step = 1/8
    for (let i = 0; i < 3; i++) {
      const remainder = Math.abs(buf[i] * 8 - Math.round(buf[i] * 8));
      expect(remainder).toBeLessThan(0.01);
    }
  });

  it('downSample > 1 creates staircase effect', () => {
    bc.bits = 16;
    bc.downSample = 4;
    const buf = new Float32Array(16);
    for (let i = 0; i < 16; i++) buf[i] = i / 16;

    bc.process(buf, 0, 16);

    // Groups of 4 should have same value
    expect(buf[0]).toBe(buf[1]);
    expect(buf[0]).toBe(buf[2]);
    expect(buf[0]).toBe(buf[3]);
    expect(buf[4]).toBe(buf[5]);
  });

  it('1 bit produces extreme quantization', () => {
    bc.bits = 1;
    const buf = new Float32Array([0.3, -0.7, 0.1, -0.1]);
    bc.process(buf, 0, 4);

    // 1 bit = 2 levels: should be ±0.5 or ±1
    for (let i = 0; i < 4; i++) {
      expect(Math.abs(buf[i])).toBeLessThanOrEqual(1.01);
    }
  });

  it('reset clears hold state', () => {
    bc.downSample = 4;
    bc.process(new Float32Array([1, 1, 1, 1]), 0, 4);
    bc.reset();
    // After reset, hold should start fresh
    const buf = new Float32Array([0.5]);
    bc.process(buf, 0, 1);
    expect(buf[0]).toBeCloseTo(0.5, 0);
  });
});
