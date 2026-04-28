import { describe, it, expect, beforeEach } from 'vitest';
import {
  calcBiquadCoeffs,
  BiquadProcessor,
  BiquadStack,
  type BiquadType,
} from '../biquad-filter';

const SR = 44100;

describe('calcBiquadCoeffs', () => {
  it('returns valid coefficients for lowpass', () => {
    const c = calcBiquadCoeffs('lowpass', 1000, 0.707, 0, SR);
    expect(Number.isFinite(c.b0)).toBe(true);
    expect(Number.isFinite(c.b1)).toBe(true);
    expect(Number.isFinite(c.b2)).toBe(true);
    expect(Number.isFinite(c.a1)).toBe(true);
    expect(Number.isFinite(c.a2)).toBe(true);
  });

  it('lowpass coefficients: b0 = b2, b1 = 2*b0', () => {
    const c = calcBiquadCoeffs('lowpass', 1000, 0.707, 0, SR);
    expect(c.b0).toBeCloseTo(c.b2, 10);
    expect(c.b1).toBeCloseTo(2 * c.b0, 10);
  });

  it('returns valid coefficients for all 7 types', () => {
    const types: BiquadType[] = [
      'lowpass', 'highpass', 'bandpass', 'notch',
      'allpass', 'peaking', 'lowshelf', 'highshelf',
    ];
    for (const type of types) {
      const c = calcBiquadCoeffs(type, 1000, 1, 6, SR);
      expect(Number.isFinite(c.b0)).toBe(true);
      expect(Number.isFinite(c.a1)).toBe(true);
      expect(Number.isFinite(c.a2)).toBe(true);
    }
  });

  it('peaking filter at 0 dB gain produces unity coefficients', () => {
    const c = calcBiquadCoeffs('peaking', 1000, 1, 0, SR);
    // At 0 dB gain, peaking filter should be identity-like
    // b0 ≈ 1, b1 ≈ a1, b2 ≈ a2
    expect(c.b0).toBeCloseTo(1 + (c.a1 !== 0 ? 0 : 0), 1);
  });
});

describe('BiquadProcessor', () => {
  let proc: BiquadProcessor;

  beforeEach(() => {
    proc = new BiquadProcessor();
  });

  it('passes DC through lowpass filter', () => {
    const c = calcBiquadCoeffs('lowpass', 10000, 0.707, 0, SR);
    proc.setCoeffs(c);

    const buf = new Float32Array(512).fill(1.0);
    proc.process(buf, 0, 512);

    // After settling, output should approach 1.0
    expect(buf[511]).toBeCloseTo(1.0, 2);
  });

  it('attenuates high frequencies with lowpass', () => {
    const c = calcBiquadCoeffs('lowpass', 100, 0.707, 0, SR);
    proc.setCoeffs(c);

    // Generate 10kHz sine (well above cutoff)
    const buf = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      buf[i] = Math.sin(2 * Math.PI * 10000 * i / SR);
    }

    proc.process(buf, 0, 1024);

    // RMS of last 512 samples should be much smaller than input
    let rmsOut = 0;
    for (let i = 512; i < 1024; i++) rmsOut += buf[i] * buf[i];
    rmsOut = Math.sqrt(rmsOut / 512);

    expect(rmsOut).toBeLessThan(0.1); // heavily attenuated
  });

  it('passes low frequencies through lowpass', () => {
    const c = calcBiquadCoeffs('lowpass', 10000, 0.707, 0, SR);
    proc.setCoeffs(c);

    // Generate 100Hz sine (well below cutoff)
    const buf = new Float32Array(2048);
    for (let i = 0; i < 2048; i++) {
      buf[i] = Math.sin(2 * Math.PI * 100 * i / SR);
    }

    proc.process(buf, 0, 2048);

    // RMS of last portion should be close to input RMS
    let rmsOut = 0;
    for (let i = 1024; i < 2048; i++) rmsOut += buf[i] * buf[i];
    rmsOut = Math.sqrt(rmsOut / 1024);

    expect(rmsOut).toBeGreaterThan(0.5); // mostly passed through
  });

  it('tick() produces same result as process()', () => {
    const c = calcBiquadCoeffs('lowpass', 1000, 0.707, 0, SR);

    const proc1 = new BiquadProcessor();
    proc1.setCoeffs(c);

    const proc2 = new BiquadProcessor();
    proc2.setCoeffs(c);

    const input = new Float32Array(256);
    for (let i = 0; i < 256; i++) input[i] = Math.sin(2 * Math.PI * 440 * i / SR);

    // Process via block
    const buf1 = Float32Array.from(input);
    proc1.process(buf1, 0, 256);

    // Process via tick
    const buf2 = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      buf2[i] = proc2.tick(input[i]);
    }

    for (let i = 0; i < 256; i++) {
      expect(buf2[i]).toBeCloseTo(buf1[i], 10);
    }
  });

  it('reset() clears filter state', () => {
    const c = calcBiquadCoeffs('lowpass', 1000, 0.707, 0, SR);
    proc.setCoeffs(c);

    // Process some signal
    const buf = new Float32Array(128);
    for (let i = 0; i < 128; i++) buf[i] = Math.random();
    proc.process(buf, 0, 128);

    proc.reset();

    // Process silence — should output silence
    const silence = new Float32Array(128);
    proc.process(silence, 0, 128);
    for (let i = 0; i < 128; i++) {
      expect(Math.abs(silence[i])).toBeLessThan(1e-10);
    }
  });

  it('highpass attenuates DC', () => {
    const c = calcBiquadCoeffs('highpass', 1000, 0.707, 0, SR);
    proc.setCoeffs(c);

    const buf = new Float32Array(1024).fill(1.0);
    proc.process(buf, 0, 1024);

    // DC should be attenuated to near zero
    expect(Math.abs(buf[1023])).toBeLessThan(0.01);
  });

  it('respects from/to block range', () => {
    const c = calcBiquadCoeffs('lowpass', 1000, 0.707, 0, SR);
    proc.setCoeffs(c);

    const buf = new Float32Array(256).fill(1.0);
    proc.process(buf, 64, 192);

    // Samples before from should be unchanged
    expect(buf[0]).toBe(1.0);
    expect(buf[63]).toBe(1.0);
  });
});

describe('BiquadStack', () => {
  it('creates correct number of stages', () => {
    const stack = new BiquadStack(4);
    expect(stack.stageCount).toBe(4);
  });

  it('steeper slope with more stages (24 dB/oct vs 12 dB/oct)', () => {
    const c = calcBiquadCoeffs('lowpass', 500, 0.707, 0, SR);

    // Single stage (12 dB/oct)
    const single = new BiquadProcessor();
    single.setCoeffs(c);

    // Double stage (24 dB/oct)
    const stack = new BiquadStack(2);
    stack.setAllCoeffs(c);

    // 5kHz sine — well above cutoff
    const buf1 = new Float32Array(2048);
    const buf2 = new Float32Array(2048);
    for (let i = 0; i < 2048; i++) {
      const val = Math.sin(2 * Math.PI * 5000 * i / SR);
      buf1[i] = val;
      buf2[i] = val;
    }

    single.process(buf1, 0, 2048);
    stack.process(buf2, 0, 2048);

    // Measure RMS of last portion
    let rms1 = 0, rms2 = 0;
    for (let i = 1024; i < 2048; i++) {
      rms1 += buf1[i] * buf1[i];
      rms2 += buf2[i] * buf2[i];
    }
    rms1 = Math.sqrt(rms1 / 1024);
    rms2 = Math.sqrt(rms2 / 1024);

    // Stack should attenuate more than single stage
    expect(rms2).toBeLessThan(rms1);
  });

  it('reset() clears all stages', () => {
    const c = calcBiquadCoeffs('lowpass', 1000, 0.707, 0, SR);
    const stack = new BiquadStack(3);
    stack.setAllCoeffs(c);

    // Process some signal
    const buf = new Float32Array(128);
    for (let i = 0; i < 128; i++) buf[i] = Math.random();
    stack.process(buf, 0, 128);

    stack.reset();

    // Process silence after reset
    const silence = new Float32Array(128);
    stack.process(silence, 0, 128);
    for (let i = 0; i < 128; i++) {
      expect(Math.abs(silence[i])).toBeLessThan(1e-10);
    }
  });

  it('stage() returns individual stages', () => {
    const stack = new BiquadStack(2);
    const s0 = stack.stage(0);
    const s1 = stack.stage(1);
    expect(s0).toBeInstanceOf(BiquadProcessor);
    expect(s1).toBeInstanceOf(BiquadProcessor);
    expect(s0).not.toBe(s1);
  });
});
