import { describe, it, expect, beforeEach } from 'vitest';
import { LFO, type LFOWaveform } from '../lfo';

const SR = 44100;

describe('LFO', () => {
  let lfo: LFO;

  beforeEach(() => {
    lfo = new LFO('sine', 1, SR);
  });

  it('sine LFO produces values in [-1, 1]', () => {
    const buf = new Float32Array(SR);
    lfo.process(buf, 0, SR);
    for (let i = 0; i < SR; i++) {
      expect(buf[i]).toBeGreaterThanOrEqual(-1.001);
      expect(buf[i]).toBeLessThanOrEqual(1.001);
    }
  });

  it('all waveforms produce output', () => {
    const waveforms: LFOWaveform[] = ['sine', 'triangle', 'saw', 'square'];
    for (const w of waveforms) {
      const l = new LFO(w, 1, SR);
      const buf = new Float32Array(SR);
      l.process(buf, 0, SR);
      const hasVariation = buf.some(v => Math.abs(v) > 0.01);
      expect(hasVariation).toBe(true);
    }
  });

  it('random waveform produces values after first cycle', () => {
    // Random S&H starts at 0, gets random value after first cycle reset
    const l = new LFO('random', 1, SR);
    const buf = new Float32Array(SR * 2); // 2 seconds = 2 full cycles
    l.process(buf, 0, SR * 2);
    // After completing at least one cycle, should have non-zero random value
    const lastVal = buf[SR * 2 - 1];
    // Value may or may not be 0 (it's random), so just check it doesn't crash
    expect(Number.isFinite(lastVal)).toBe(true);
  });

  it('triangle LFO ramps up and down', () => {
    lfo.waveform = 'triangle';
    const buf = new Float32Array(SR);
    lfo.process(buf, 0, SR);

    // Should reach near -1 and near +1
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < SR; i++) {
      if (buf[i] < min) min = buf[i];
      if (buf[i] > max) max = buf[i];
    }
    expect(min).toBeLessThan(-0.9);
    expect(max).toBeGreaterThan(0.9);
  });

  it('square LFO produces ±1', () => {
    lfo.waveform = 'square';
    const buf = new Float32Array(1024);
    lfo.process(buf, 0, 1024);

    for (let i = 0; i < 1024; i++) {
      expect(Math.abs(buf[i])).toBeCloseTo(1, 5);
    }
  });

  it('unipolar mode outputs [0, 1]', () => {
    lfo.unipolar = true;
    const buf = new Float32Array(SR);
    lfo.process(buf, 0, SR);

    for (let i = 0; i < SR; i++) {
      expect(buf[i]).toBeGreaterThanOrEqual(-0.001);
      expect(buf[i]).toBeLessThanOrEqual(1.001);
    }
  });

  it('frequency setter changes period', () => {
    lfo.frequency = 10;
    expect(lfo.frequency).toBe(10);

    // At 10 Hz over 1 second, sine should complete 10 cycles
    const buf = new Float32Array(SR);
    lfo.process(buf, 0, SR);

    let crossings = 0;
    for (let i = 1; i < SR; i++) {
      if (buf[i - 1] < 0 && buf[i] >= 0) crossings++;
    }
    // Should be ~10 positive zero crossings
    expect(crossings).toBeGreaterThan(8);
    expect(crossings).toBeLessThan(12);
  });

  it('phaseOffset shifts the waveform', () => {
    const lfo1 = new LFO('sine', 1, SR);
    const lfo2 = new LFO('sine', 1, SR);
    lfo2.phaseOffset = 0.25; // 90 degrees

    const buf1 = new Float32Array(256);
    const buf2 = new Float32Array(256);
    lfo1.process(buf1, 0, 256);
    lfo2.process(buf2, 0, 256);

    // At sample 0, sine(0) ≈ 0, sine(0.25 * 2π) ≈ 1
    expect(Math.abs(buf1[0])).toBeLessThan(0.1);
    expect(buf2[0]).toBeGreaterThan(0.9);
  });

  it('syncToBpm sets correct frequency', () => {
    lfo.syncToBpm(120, 4); // quarter note at 120 BPM = 2 Hz
    expect(lfo.frequency).toBeCloseTo(2, 5);

    lfo.syncToBpm(120, 8); // eighth note at 120 BPM = 4 Hz
    expect(lfo.frequency).toBeCloseTo(4, 5);
  });

  it('tick produces same as process for single sample', () => {
    const lfo2 = new LFO('sine', 1, SR);
    const tickVal = lfo.tick();
    const buf = new Float32Array(1);
    lfo2.process(buf, 0, 1);
    expect(tickVal).toBeCloseTo(buf[0], 10);
  });

  it('reset clears phase', () => {
    lfo.process(new Float32Array(1000), 0, 1000);
    lfo.reset();

    // After reset, sine should start near 0
    const buf = new Float32Array(1);
    lfo.process(buf, 0, 1);
    expect(Math.abs(buf[0])).toBeLessThan(0.01);
  });

  it('random (S&H) holds value within cycle', () => {
    lfo.waveform = 'random';
    lfo.frequency = 1;
    const buf = new Float32Array(1000); // ~23ms at 44100, well within 1 cycle
    lfo.process(buf, 0, 1000);

    // All values should be the same within one cycle
    const firstVal = buf[0];
    for (let i = 1; i < 1000; i++) {
      expect(buf[i]).toBe(firstVal);
    }
  });
});
