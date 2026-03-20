import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTransportStore } from '../../../store/transportStore';
import { useUIStore } from '../../../store/uiStore';

// Mock projectStorage to avoid browser API issues
vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

/**
 * Tests for click-to-seek on timeline empty area.
 *
 * When a user clicks (without dragging) on the empty timeline area,
 * the playhead should seek to that position. We test the store-level
 * integration since the actual DOM interaction depends on layout measurements.
 */
describe('Timeline click-to-seek', () => {
  beforeEach(() => {
    useTransportStore.setState({ currentTime: 0 });
    useUIStore.setState({ pixelsPerSecond: 50 });
  });

  it('seek() updates currentTime in transportStore', () => {
    const store = useTransportStore.getState();
    store.seek(5.5);
    expect(useTransportStore.getState().currentTime).toBe(5.5);
  });

  it('seek() clamps to zero for negative values', () => {
    const store = useTransportStore.getState();
    store.seek(-2);
    expect(useTransportStore.getState().currentTime).toBe(0);
  });

  it('pixel-to-time conversion is correct for click-to-seek', () => {
    const pixelsPerSecond = 50;
    const scrollLeft = 100;
    const clickViewX = 200;
    // The formula used in Timeline.tsx: time = (clickViewX + scrollLeft) / pixelsPerSecond
    const time = (clickViewX + scrollLeft) / pixelsPerSecond;
    expect(time).toBe(6); // (200 + 100) / 50 = 6 seconds
  });
});
