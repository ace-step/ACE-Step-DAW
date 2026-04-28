import { describe, it, expect, beforeEach } from 'vitest';
import { Oscillator, type OscillatorWaveform } from '../oscillator';

const SR = 44100;

describe('Oscillator', () => {
  let osc: Oscillator;

  beforeEach(() => {
    osc = new Oscillator('sine', 440, SR);
  });

  it('produces sine wave in [-1, 1] range', () => {
    const buf = new Float32Array(1024);
    osc.process(buf, 0, 1024);
    for (let i = 0; i < 1024; i++) {
      expect(buf[i]).toBeGreaterThanOrEqual(-1.001);
      expect(buf[i]).toBeLessThanOrEqual(1.001);
    }
  });

  it('sine wave has correct frequency', () => {
    osc.frequency = 100;
    const buf = new Float32Array(SR); // 1 second
    osc.process(buf, 0, SR);

    // Count zero crossings (should be ~200 for 100 Hz)
    let crossings = 0;
    for (let i = 1; i < SR; i++) {
      if ((buf[i - 1] < 0 && buf[i] >= 0) || (buf[i - 1] >= 0 && buf[i] < 0)) {
        crossings++;
      }
    }
    // 100Hz = 200 zero crossings/sec ± tolerance
    expect(crossings).toBeGreaterThan(195);
    expect(crossings).toBeLessThan(205);
  });

  it('saw wave swings between -1 and 1', () => {
    osc.waveform = 'saw';
    const buf = new Float32Array(4096);
    osc.process(buf, 0, 4096);

    let min = Infinity, max = -Infinity;
    for (let i = 0; i < 4096; i++) {
      if (buf[i] < min) min = buf[i];
      if (buf[i] > max) max = buf[i];
    }
    expect(min).toBeLessThan(-0.9);
    expect(max).toBeGreaterThan(0.9);
  });

  it('square wave produces values near ±1', () => {
    osc.waveform = 'square';
    osc.frequency = 100;
    const buf = new Float32Array(4096);
    osc.process(buf, 0, 4096);

    // Most samples should be near ±1
    let nearOne = 0;
    for (let i = 0; i < 4096; i++) {
      if (Math.abs(Math.abs(buf[i]) - 1) < 0.2) nearOne++;
    }
    expect(nearOne / 4096).toBeGreaterThan(0.8);
  });

  it('triangle wave settles to bounded range', () => {
    osc.waveform = 'triangle';
    osc.frequency = 440;
    // Let it settle for a bit
    osc.process(new Float32Array(4096), 0, 4096);

    const buf = new Float32Array(4096);
    osc.process(buf, 0, 4096);

    // After settling, should be roughly in [-1.2, 1.2]
    for (let i = 0; i < 4096; i++) {
      expect(buf[i]).toBeGreaterThanOrEqual(-2);
      expect(buf[i]).toBeLessThanOrEqual(2);
    }
  });

  it('all waveforms produce output', () => {
    const waveforms: OscillatorWaveform[] = ['sine', 'saw', 'square', 'triangle'];
    for (const w of waveforms) {
      const o = new Oscillator(w, 440, SR);
      const buf = new Float32Array(256);
      o.process(buf, 0, 256);
      const hasNonZero = buf.some(v => Math.abs(v) > 0.01);
      expect(hasNonZero).toBe(true);
    }
  });

  it('frequency setter updates output', () => {
    osc.frequency = 1000;
    expect(osc.frequency).toBe(1000);

    const buf = new Float32Array(256);
    osc.process(buf, 0, 256);
    const hasOutput = buf.some(v => Math.abs(v) > 0.01);
    expect(hasOutput).toBe(true);
  });

  it('reset sets phase to 0', () => {
    osc.process(new Float32Array(100), 0, 100);
    osc.reset();
    expect(osc.phase).toBe(0);
  });

  it('tick produces same as process for single sample', () => {
    const osc2 = new Oscillator('sine', 440, SR);
    osc2.phase = osc.phase;

    const tickVal = osc.tick();
    const buf = new Float32Array(1);
    osc2.process(buf, 0, 1);
    expect(tickVal).toBeCloseTo(buf[0], 10);
  });

  it('pulseWidth affects square wave duty cycle', () => {
    osc.waveform = 'square';
    osc.frequency = 100;

    // Narrow pulse
    osc.pulseWidth = 0.1;
    const buf1 = new Float32Array(4096);
    osc.process(buf1, 0, 4096);
    osc.reset();

    // Wide pulse
    osc.pulseWidth = 0.9;
    const buf2 = new Float32Array(4096);
    osc.process(buf2, 0, 4096);

    // Count positive samples — narrow should have fewer
    const pos1 = buf1.filter(v => v > 0).length;
    const pos2 = buf2.filter(v => v > 0).length;
    expect(pos1).toBeLessThan(pos2);
  });

  it('respects from/to range', () => {
    const buf = new Float32Array(256);
    buf.fill(-99);
    osc.process(buf, 64, 192);
    // Before from should be untouched
    expect(buf[0]).toBe(-99);
    expect(buf[63]).toBe(-99);
    // Within range should be modified
    expect(buf[64]).not.toBe(-99);
    expect(buf[191]).not.toBe(-99);
  });
});
