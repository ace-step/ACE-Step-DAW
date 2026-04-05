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

  it('different styles have different knee widths', () => {
    const ceiling = -0.3;
    // Well above all knees — all styles should return ceiling
    const agg = limiterTransfer(10, ceiling, 0, 'aggressive');
    const trans = limiterTransfer(10, ceiling, 0, 'transparent');
    const warm = limiterTransfer(10, ceiling, 0, 'warm');
    expect(agg).toBe(ceiling);
    expect(trans).toBe(ceiling);
    expect(warm).toBe(ceiling);

    // At ceiling - 2: aggressive (halfKnee=1.5) is in passthrough,
    // but warm (halfKnee=4.5) is in knee and reducing
    const aggBelow = limiterTransfer(-2.3, ceiling, 0, 'aggressive');
    const warmBelow = limiterTransfer(-2.3, ceiling, 0, 'warm');
    expect(aggBelow).toBe(-2.3); // passthrough (below knee start at -1.8)
    expect(warmBelow).toBeLessThan(-2.3); // warm is already reducing
  });
});

describe('generateLimiterCurve', () => {
  it('generates correct number of points', () => {
    const points = generateLimiterCurve(-0.3, 0, 'transparent', -60, 0, 100);
    expect(points).toHaveLength(101);
  });

  it('x values span the specified range', () => {
    const points = generateLimiterCurve(-0.3, 0, 'transparent');
    expect(points[0].inputDb).toBeCloseTo(-48, 4);
    expect(points[points.length - 1].inputDb).toBeCloseTo(6, 4);
  });
});
