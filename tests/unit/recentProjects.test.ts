import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from '../../src/utils/formatRelativeTime';
import {
  buildClipLayout,
  type ClipLayoutItem,
} from '../../src/utils/clipLayout';
import type { Track, Clip } from '../../src/types/project';

describe('formatRelativeTime', () => {
  const now = Date.now();

  it('returns "just now" for timestamps less than 60s ago', () => {
    expect(formatRelativeTime(now - 30_000, now)).toBe('just now');
  });

  it('returns minutes for timestamps less than 60min ago', () => {
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('5m ago');
  });

  it('returns hours for timestamps less than 24h ago', () => {
    expect(formatRelativeTime(now - 3 * 3600_000, now)).toBe('3h ago');
  });

  it('returns days for timestamps less than 30d ago', () => {
    expect(formatRelativeTime(now - 2 * 86400_000, now)).toBe('2d ago');
  });

  it('returns months for timestamps more than 30d ago', () => {
    expect(formatRelativeTime(now - 45 * 86400_000, now)).toBe('1mo ago');
  });

  it('returns "1m ago" for exactly 60 seconds', () => {
    expect(formatRelativeTime(now - 60_000, now)).toBe('1m ago');
  });

  it('returns "1h ago" for exactly 60 minutes', () => {
    expect(formatRelativeTime(now - 3600_000, now)).toBe('1h ago');
  });

  it('returns "1d ago" for exactly 24 hours', () => {
    expect(formatRelativeTime(now - 86400_000, now)).toBe('1d ago');
  });
});

function makeClip(overrides: Partial<Clip>): Clip {
  return {
    id: 'clip-1',
    trackId: 'track-1',
    startTime: 0,
    duration: 4,
    generationStatus: 'ready',
    ...overrides,
  } as Clip;
}

function makeTrack(overrides: Partial<Track>): Track {
  return {
    id: 'track-1',
    trackType: 'stems',
    trackName: 'drums',
    displayName: 'Drums',
    color: '#ef4444',
    order: 0,
    volume: 0.8,
    muted: false,
    soloed: false,
    armed: false,
    inputMonitoring: 'off',
    clips: [],
    ...overrides,
  } as Track;
}

describe('buildClipLayout', () => {
  it('returns empty array for empty tracks', () => {
    expect(buildClipLayout([], 16)).toEqual([]);
  });

  it('returns empty array for tracks with no clips', () => {
    const tracks = [makeTrack({ clips: [] })];
    expect(buildClipLayout(tracks, 16)).toEqual([]);
  });

  it('builds normalized clip layout from tracks', () => {
    const tracks = [
      makeTrack({
        id: 'track-1',
        color: '#ef4444',
        clips: [makeClip({ startTime: 0, duration: 8 })],
      }),
      makeTrack({
        id: 'track-2',
        color: '#3b82f6',
        order: 1,
        clips: [makeClip({ startTime: 4, duration: 4 })],
      }),
    ];

    const layout = buildClipLayout(tracks, 16);

    expect(layout).toHaveLength(2);
    expect(layout[0]).toEqual<ClipLayoutItem>({
      trackIndex: 0,
      startNorm: 0,
      widthNorm: 0.5,
      color: '#ef4444',
    });
    expect(layout[1]).toEqual<ClipLayoutItem>({
      trackIndex: 1,
      startNorm: 0.25,
      widthNorm: 0.25,
      color: '#3b82f6',
    });
  });

  it('clamps values to 0-1 range', () => {
    const tracks = [
      makeTrack({
        clips: [makeClip({ startTime: 0, duration: 20 })],
      }),
    ];
    const layout = buildClipLayout(tracks, 16);
    expect(layout[0].widthNorm).toBeLessThanOrEqual(1);
    expect(layout[0].startNorm).toBeGreaterThanOrEqual(0);
  });

  it('handles totalDuration of 0 gracefully', () => {
    const tracks = [
      makeTrack({ clips: [makeClip({ startTime: 0, duration: 4 })] }),
    ];
    expect(buildClipLayout(tracks, 0)).toEqual([]);
  });
});
