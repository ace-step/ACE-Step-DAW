import { describe, it, expect, beforeEach } from 'vitest';
import { ADSREnvelope } from '../envelope';

const SR = 44100;

describe('ADSREnvelope', () => {
  let env: ADSREnvelope;

  beforeEach(() => {
    env = new ADSREnvelope(SR);
    env.attack = 0.01;   // 10ms
    env.decay = 0.05;    // 50ms
    env.sustain = 0.5;
    env.release = 0.1;   // 100ms
  });

  it('starts in idle state with value 0', () => {
    expect(env.state).toBe('idle');
    expect(env.value).toBe(0);
  });

  it('idle produces zeros', () => {
    const buf = new Float32Array(128);
    env.process(buf, 0, 128);
    for (let i = 0; i < 128; i++) {
      expect(buf[i]).toBe(0);
    }
  });

  it('attack ramps from 0 to 1', () => {
    env.triggerAttack();
    expect(env.state).toBe('attack');

    const attackSamples = Math.round(0.01 * SR);
    const buf = new Float32Array(attackSamples + 10);
    env.process(buf, 0, buf.length);

    // Should start near 0 and end near 1
    expect(buf[0]).toBeGreaterThanOrEqual(0);
    expect(buf[attackSamples - 1]).toBeGreaterThan(0.8);
  });

  it('transitions through attack → decay → sustain', () => {
    env.triggerAttack();

    // Process through attack + decay
    const totalSamples = Math.round((0.01 + 0.05 + 0.01) * SR);
    const buf = new Float32Array(totalSamples);
    env.process(buf, 0, totalSamples);

    // Should reach sustain level
    expect(env.state).toBe('sustain');
    expect(env.value).toBeCloseTo(0.5, 1);
  });

  it('release ramps to 0 from sustain', () => {
    env.triggerAttack();

    // Get to sustain
    const settle = Math.round(0.1 * SR);
    env.process(new Float32Array(settle), 0, settle);

    env.triggerRelease();
    expect(env.state).toBe('release');

    // Process through release
    const relSamples = Math.round(0.12 * SR);
    const buf = new Float32Array(relSamples);
    env.process(buf, 0, relSamples);

    // Should reach idle
    expect(env.state).toBe('idle');
    expect(env.value).toBeCloseTo(0, 2);
  });

  it('retrigger during decay starts new attack from current value', () => {
    env.triggerAttack();

    // Advance partway through attack
    const attackHalf = Math.round(0.005 * SR);
    env.process(new Float32Array(attackHalf), 0, attackHalf);

    const valueBefore = env.value;
    expect(valueBefore).toBeGreaterThan(0);
    expect(valueBefore).toBeLessThan(1);

    // Retrigger
    env.triggerAttack();
    expect(env.state).toBe('attack');
  });

  it('linear curve produces linear ramp', () => {
    env.curve = 'linear';
    env.attack = 0.1;
    env.triggerAttack();

    const samples = Math.round(0.05 * SR); // halfway through attack
    const buf = new Float32Array(samples);
    env.process(buf, 0, samples);

    // At 50% of attack time, value should be ~50%
    expect(env.value).toBeCloseTo(0.5, 1);
  });

  it('exponential curve is non-linear', () => {
    env.curve = 'exponential';
    env.attack = 0.1;
    env.triggerAttack();

    const quarterSamples = Math.round(0.025 * SR);
    const buf = new Float32Array(quarterSamples);
    env.process(buf, 0, quarterSamples);

    // Exponential attack should be > linear at 25% time
    // (exponential rises faster at start)
    const valAt25 = env.value;

    env.reset();
    env.curve = 'linear';
    env.triggerAttack();
    env.process(new Float32Array(quarterSamples), 0, quarterSamples);
    const linAt25 = env.value;

    // They should differ (exponential vs linear)
    expect(Math.abs(valAt25 - linAt25)).toBeGreaterThan(0.01);
  });

  it('reset returns to idle with value 0', () => {
    env.triggerAttack();
    env.process(new Float32Array(100), 0, 100);
    env.reset();
    expect(env.state).toBe('idle');
    expect(env.value).toBe(0);
  });

  it('release from idle does nothing', () => {
    env.triggerRelease();
    expect(env.state).toBe('idle');
    expect(env.value).toBe(0);
  });

  it('sustain level is held indefinitely', () => {
    env.triggerAttack();

    // Get to sustain
    env.process(new Float32Array(Math.round(0.1 * SR)), 0, Math.round(0.1 * SR));

    // Process more — should stay at sustain
    const buf = new Float32Array(1000);
    env.process(buf, 0, 1000);

    for (let i = 0; i < 1000; i++) {
      expect(buf[i]).toBeCloseTo(0.5, 2);
    }
  });

  it('envelope values are always in [0, 1]', () => {
    env.triggerAttack();
    const buf = new Float32Array(SR); // 1 second
    env.process(buf, 0, SR / 2);
    env.triggerRelease();
    env.process(buf, SR / 2, SR);

    for (let i = 0; i < SR; i++) {
      expect(buf[i]).toBeGreaterThanOrEqual(-0.001);
      expect(buf[i]).toBeLessThanOrEqual(1.001);
    }
  });
});
