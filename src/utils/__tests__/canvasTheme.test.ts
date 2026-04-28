import { describe, it, expect } from 'vitest';
import { CANVAS_GRID } from '../canvasTheme';

describe('canvasTheme', () => {
  it('exports grid constants', () => {
    expect(CANVAS_GRID.lineColor).toContain('rgba');
    expect(CANVAS_GRID.labelColor).toContain('rgba');
    expect(CANVAS_GRID.labelFont).toContain('monospace');
    expect(CANVAS_GRID.zeroLineColor).toContain('rgba');
  });

  it('grid line color is subtle (low opacity)', () => {
    // Verify the grid is not too bright
    const match = CANVAS_GRID.lineColor.match(/[\d.]+\)$/);
    expect(match).not.toBeNull();
    const opacity = parseFloat(match![0]);
    expect(opacity).toBeLessThan(0.15);
  });
});
