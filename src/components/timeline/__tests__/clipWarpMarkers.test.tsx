import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClipWarpMarkers } from '../ClipWarpMarkers';
import type { AudioWarpMarker } from '../../../types/project';

const mockAddWarpMarker = vi.fn();
const mockRemoveWarpMarker = vi.fn();
const mockSetWarpMarkers = vi.fn();

vi.mock('../../../store/projectStore', () => ({
  useProjectStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      addWarpMarker: mockAddWarpMarker,
      removeWarpMarker: mockRemoveWarpMarker,
      setWarpMarkers: mockSetWarpMarkers,
    };
    return selector(state);
  }),
}));

describe('ClipWarpMarkers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const markers: AudioWarpMarker[] = [
    { originalTime: 1.0, quantizedTime: 1.0 },
    { originalTime: 2.5, quantizedTime: 2.5 },
  ];

  it('renders warp markers', () => {
    render(
      <ClipWarpMarkers
        clipId="clip-1"
        clipDuration={4}
        width={400}
        markers={markers}
      />,
    );
    const markerElements = screen.getAllByTestId(/^warp-marker-/);
    expect(markerElements).toHaveLength(2);
  });

  it('has correct aria labels on markers', () => {
    render(
      <ClipWarpMarkers
        clipId="clip-1"
        clipDuration={4}
        width={400}
        markers={markers}
      />,
    );
    const marker = screen.getByTestId('warp-marker-0');
    expect(marker.getAttribute('aria-label')).toContain('1.00s');
  });

  it('removes marker on double-click', () => {
    render(
      <ClipWarpMarkers
        clipId="clip-1"
        clipDuration={4}
        width={400}
        markers={markers}
      />,
    );
    const marker = screen.getByTestId('warp-marker-0');
    fireEvent.doubleClick(marker);
    expect(mockRemoveWarpMarker).toHaveBeenCalledWith('clip-1', 0);
  });

  it('renders nothing when clipDuration is 0', () => {
    const { container } = render(
      <ClipWarpMarkers
        clipId="clip-1"
        clipDuration={0}
        width={400}
        markers={markers}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when width is 0', () => {
    const { container } = render(
      <ClipWarpMarkers
        clipId="clip-1"
        clipDuration={4}
        width={0}
        markers={markers}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders add-marker overlay for click-to-add interaction', () => {
    render(
      <ClipWarpMarkers
        clipId="clip-1"
        clipDuration={4}
        width={400}
        markers={markers}
        allowAdd
      />,
    );
    const overlay = screen.getByTestId('warp-add-overlay');
    expect(overlay).toBeTruthy();
  });

  it('calls addWarpMarker when overlay is alt-clicked', () => {
    render(
      <ClipWarpMarkers
        clipId="clip-1"
        clipDuration={4}
        width={400}
        markers={markers}
        allowAdd
      />,
    );
    const overlay = screen.getByTestId('warp-add-overlay');
    // Alt+click at x=200 on a 400px-wide, 4s clip → time ≈ 2.0s
    fireEvent.click(overlay, { altKey: true, clientX: 200 });
    expect(mockAddWarpMarker).toHaveBeenCalledWith('clip-1', expect.objectContaining({
      originalTime: expect.any(Number),
      quantizedTime: expect.any(Number),
    }));
  });
});
