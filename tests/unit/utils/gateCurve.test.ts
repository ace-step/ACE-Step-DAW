import { describe, it, expect } from 'vitest';
import { gateTransfer, generateGateCurve } from '../../../src/utils/gateCurve';

describe('gateTransfer', () => {
  it('passes signal unchanged above threshold', () => {
    expect(gateTransfer(-10, -20, -80, 4, 'gate')).toBe(-10);
    expect(gateTransfer(0, -20, -80, 4, 'gate')).toBe(0);
  });

  it('attenuates signal below close threshold by range', () => {
    const result = gateTransfer(-50, -20, -80, 4, 'gate');
    expect(result).toBeCloseTo(-50 + (-80), 0);
  });

  it('interpolates in hysteresis zone', () => {
    // Threshold = -20, hysteresis = 4 => close = -24
    // At -22 (midpoint of [-24, -20]), should get ~50% of range
    const result = gateTransfer(-22, -20, -80, 4, 'gate');
    expect(result).toBeGreaterThan(-22 + (-80));
    expect(result).toBeLessThan(-22);
  });

  it('expander mode reduces signal proportionally below threshold', () => {
    const inputDb = -40;
    const threshold = -20;
    const range = -80;
    const result = gateTransfer(inputDb, threshold, range, 4, 'expander');
    // Engine uses: reduction = min(belowDb * 0.5, abs(range))
    // belowDb = 20, reduction = min(10, 80) = 10
    const expectedReduction = Math.min((threshold - inputDb) * 0.5, Math.abs(range));
    expect(result).toBeCloseTo(inputDb - expectedReduction, 5);
  });
});

describe('generateGateCurve', () => {
  it('generates correct number of points', () => {
    const points = generateGateCurve(-40, -80, 4, 'gate', -80, 0, 100);
    expect(points).toHaveLength(101);
  });

  it('x values span the specified range', () => {
    const points = generateGateCurve(-40, -80, 4, 'gate', -80, 0);
    expect(points[0].x).toBeCloseTo(-80, 4);
    expect(points[points.length - 1].x).toBeCloseTo(0, 4);
  });

  it('above threshold, output equals input (unity)', () => {
    const points = generateGateCurve(-40, -80, 4, 'gate', -80, 0, 200);
    const aboveThreshold = points.filter((p) => p.x >= -36); // well above threshold + hysteresis
    for (const p of aboveThreshold) {
      expect(p.y).toBeCloseTo(p.x, 0);
    }
  });
});
