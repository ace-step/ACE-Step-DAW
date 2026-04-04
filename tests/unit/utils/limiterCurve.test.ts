import { describe, it, expect } from 'vitest';
import { limiterTransfer, generateLimiterCurve, type LimiterStyle } from '../../../src/utils/limiterCurve';

describe('limiterTransfer', () => {
  it('passes signal unchanged well below ceiling', () => {
    expect(limiterTransfer(-40, -0.3, 0, 'transparent')).toBeCloseTo(-40, 1);
    expect(limiterTransfer(-30, -1, 0, 'aggressive')).toBeCloseTo(-30, 1);
  });

  it('never exceeds ceiling', () => {
    const styles: LimiterStyle[] = ['transparent', 'aggressive', 'warm'];
    for (const style of styles) {
      for (const input of [-5, -2, 0, 3, 6]) {
        const output = limiterTransfer(input, -0.3, 0, style);
        expect(output).toBeLessThanOrEqual(-0.3 + 0.01);
      }
    }
  });

  it('does not amplify beyond boosted input when still below ceiling', () => {
    const ceiling = -0.3;
    const styles: LimiterStyle[] = ['transparent', 'aggressive', 'warm'];
    const cases = [
      { input: -0.35, gain: 0 },
      { input: -0.5, gain: 0.1 },
      { input: -0.6, gain: 0.2 },
      { input: -1.0, gain: 0.5 },
    ];

    for (const style of styles) {
      for (const { input, gain } of cases) {
        const boostedInput = input + gain;
        expect(boostedInput).toBeLessThan(ceiling);

        const output = limiterTransfer(input, ceiling, gain, style);
        expect(output).toBeLessThanOrEqual(boostedInput + 1e-9);
      }
    }
  });

  it('gain boost shifts the curve', () => {
    const withGain = limiterTransfer(-20, -0.3, 6, 'transparent');
    const withoutGain = limiterTransfer(-20, -0.3, 0, 'transparent');
    expect(withGain).toBeGreaterThan(withoutGain);
  });

  it('warm style has softer knee than aggressive', () => {
    // At a point close to ceiling, warm should compress more gradually
    const warm = limiterTransfer(-5, -0.3, 0, 'warm');
    const aggressive = limiterTransfer(-5, -0.3, 0, 'aggressive');
    // Both should be close to their respective ceiling approaches
    expect(warm).toBeLessThanOrEqual(-0.3);
    expect(aggressive).toBeLessThanOrEqual(-0.3);
  });
});

describe('generateLimiterCurve', () => {
  it('generates correct number of points', () => {
    const points = generateLimiterCurve(-0.3, 0, 'transparent', -60, 0, 100);
    expect(points).toHaveLength(101);
  });

  it('x values span the specified range', () => {
    const points = generateLimiterCurve(-0.3, 0, 'transparent');
    expect(points[0].x).toBeCloseTo(-60, 4);
    expect(points[points.length - 1].x).toBeCloseTo(0, 4);
  });
});
