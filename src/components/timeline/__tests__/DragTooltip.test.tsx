import { describe, it, expect, beforeEach } from 'vitest';
import {
  getDragTooltipCount,
  incrementDragTooltipCount,
  shouldShowDragTooltip,
} from '../DragTooltip';

const STORAGE_KEY = 'ace-step-drag-tooltip-count';

describe('DragTooltip helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('getDragTooltipCount returns 0 when not set', () => {
    expect(getDragTooltipCount()).toBe(0);
  });

  it('incrementDragTooltipCount increases count', () => {
    expect(getDragTooltipCount()).toBe(0);
    incrementDragTooltipCount();
    expect(getDragTooltipCount()).toBe(1);
    incrementDragTooltipCount();
    expect(getDragTooltipCount()).toBe(2);
  });

  it('shouldShowDragTooltip returns true for count < 3', () => {
    expect(shouldShowDragTooltip()).toBe(true);
    incrementDragTooltipCount(); // 1
    expect(shouldShowDragTooltip()).toBe(true);
    incrementDragTooltipCount(); // 2
    expect(shouldShowDragTooltip()).toBe(true);
    incrementDragTooltipCount(); // 3
    expect(shouldShowDragTooltip()).toBe(false);
  });

  it('handles corrupt localStorage gracefully', () => {
    localStorage.setItem(STORAGE_KEY, 'not-a-number');
    expect(getDragTooltipCount()).toBe(0);
    expect(shouldShowDragTooltip()).toBe(true);
  });
});
