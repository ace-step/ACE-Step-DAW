import { describe, it, expect, beforeEach } from 'vitest';
import {
  EnvelopeFollower,
  Compressor,
  Limiter,
  Gate,
} from '../dynamics';

const SR = 44100;

describe('EnvelopeFollower', () => {
  it('tracks peak of constant signal', () => {
    const ef = new EnvelopeFollower(1, 100, SR, 'peak');
    const buf = new Float32Array(4096).fill(0.5);
    const result = ef.process(buf, 0, 4096);
    expect(result).toBeCloseTo(0.5, 1);
  });

  it('tracks RMS of constant signal', () => {
    const ef = new EnvelopeFollower(1, 100, SR, 'rms');
    const buf = new Float32Array(4096).fill(0.5);
    const result = ef.process(buf, 0, 4096);
    expect(result).toBeCloseTo(0.5, 1);
  });

  it('envelope rises on attack and falls on release', () => {
    const ef = new EnvelopeFollower(1, 50, SR, 'peak');

    // Feed loud signal
    const loud = new Float32Array(1024).fill(1);
    ef.process(loud, 0, 1024);
    const peakEnv = ef.envelope;

    // Feed silence
    const silence = new Float32Array(2048).fill(0);
    ef.process(silence, 0, 2048);

    expect(ef.envelope).toBeLessThan(peakEnv);
  });

  it('reset clears envelope', () => {
    const ef = new EnvelopeFollower(1, 100, SR, 'peak');
    ef.process(new Float32Array(100).fill(1), 0, 100);
    ef.reset();
    expect(ef.envelope).toBe(0);
  });
});

describe('Compressor', () => {
  let comp: Compressor;

  beforeEach(() => {
    comp = new Compressor({
      threshold: -20,
      ratio: 4,
      attack: 1,
      release: 50,
      knee: 0,
      makeupGain: 0,
    }, SR);
  });

  it('does not affect signals below threshold', () => {
    // -30 dB signal (below -20 dB threshold)
    const level = Math.pow(10, -30 / 20); // ~0.0316
    const buf = new Float32Array(1024).fill(level);
    const original = Float32Array.from(buf);

    comp.process(buf, 0, 1024);

    // Should be essentially unchanged
    for (let i = 100; i < 1024; i++) {
      expect(buf[i]).toBeCloseTo(original[i], 3);
    }
  });

  it('reduces level of signals above threshold', () => {
    // 0 dB signal (well above -20 dB threshold)
    const buf = new Float32Array(4096).fill(1.0);
    comp.process(buf, 0, 4096);

    // Should be reduced
    expect(buf[4095]).toBeLessThan(1.0);
    expect(buf[4095]).toBeGreaterThan(0);
  });

  it('makeup gain compensates for compression', () => {
    comp.makeupGain = 10;
    const buf = new Float32Array(1024).fill(0.5);
    comp.process(buf, 0, 1024);

    // With 10dB makeup, output should be louder than input
    // (depending on compression amount)
    expect(buf[1023]).toBeGreaterThan(0);
  });

  it('gainReductionDb is available for metering', () => {
    const buf = new Float32Array(1024).fill(1.0);
    comp.process(buf, 0, 1024);
    expect(comp.gainReductionDb).toBeGreaterThan(0);
  });

  it('reset clears state', () => {
    comp.process(new Float32Array(100).fill(1), 0, 100);
    comp.reset();
    expect(comp.gainReductionDb).toBe(0);
  });
});

describe('Limiter', () => {
  it('prevents output from exceeding threshold', () => {
    const lim = new Limiter(-3, 100, SR);
    const threshLin = Math.pow(10, -3 / 20);

    // Hot signal
    const buf = new Float32Array(4096);
    for (let i = 0; i < 4096; i++) buf[i] = Math.sin(i * 0.1) * 2;

    lim.process(buf, 0, 4096);

    // After settling, no sample should exceed threshold (with small tolerance)
    for (let i = 100; i < 4096; i++) {
      expect(Math.abs(buf[i])).toBeLessThanOrEqual(threshLin + 0.05);
    }
  });

  it('does not affect signals below threshold', () => {
    const lim = new Limiter(-1, 100, SR);
    const level = 0.5; // well below -1 dB
    const buf = new Float32Array(1024).fill(level);

    lim.process(buf, 0, 1024);

    for (let i = 0; i < 1024; i++) {
      expect(buf[i]).toBeCloseTo(level, 2);
    }
  });

  it('reset clears state', () => {
    const lim = new Limiter(-1, 100, SR);
    lim.process(new Float32Array(100).fill(2), 0, 100);
    lim.reset();
    // After reset, a quiet signal should pass unaffected
    const buf = new Float32Array(100).fill(0.1);
    lim.process(buf, 0, 100);
    expect(buf[0]).toBeCloseTo(0.1, 2);
  });
});

describe('Gate', () => {
  it('silences signals below threshold', () => {
    const gate = new Gate(-20, 0.1, 50, SR);
    const level = Math.pow(10, -40 / 20); // -40 dB, well below -20 dB threshold
    const buf = new Float32Array(1024).fill(level);

    gate.process(buf, 0, 1024);

    for (let i = 0; i < 1024; i++) {
      expect(buf[i]).toBe(0);
    }
  });

  it('passes signals above threshold', () => {
    const gate = new Gate(-40, 0.1, 50, SR);
    const level = 0.5; // well above -40 dB
    const buf = new Float32Array(1024).fill(level);

    gate.process(buf, 0, 1024);

    for (let i = 0; i < 1024; i++) {
      expect(buf[i]).toBeCloseTo(level, 5);
    }
  });

  it('reset clears state', () => {
    const gate = new Gate(-20, 0.1, 50, SR);
    gate.process(new Float32Array(100).fill(1), 0, 100);
    gate.reset();
    // Just ensure no crash
    const buf = new Float32Array(100).fill(0.001);
    gate.process(buf, 0, 100);
  });
});
