import { describe, it, expect } from 'vitest';
import { getSidechainRoutes, type SidechainRoute } from '../sidechainRouting';
import type { Track, CompressorParams } from '../../types/project';

function makeTrack(id: string, displayName: string, effects: Track['effects'] = []): Track {
  return {
    id,
    trackName: 'custom',
    displayName,
    color: '#ff0000',
    order: 0,
    volume: 1,
    muted: false,
    soloed: false,
    clips: [],
    effects,
  };
}

describe('getSidechainRoutes', () => {
  it('returns empty array when no tracks have sidechain compressors', () => {
    const tracks = [
      makeTrack('t1', 'Kick'),
      makeTrack('t2', 'Bass'),
    ];
    expect(getSidechainRoutes(tracks)).toEqual([]);
  });

  it('returns a route when a compressor has a sidechainSourceTrackId', () => {
    const tracks = [
      makeTrack('kick', 'Kick'),
      makeTrack('bass', 'Bass', [
        {
          id: 'comp-1',
          type: 'compressor',
          enabled: true,
          params: {
            threshold: -24,
            ratio: 4,
            attack: 0.02,
            release: 0.2,
            knee: 6,
            sidechainSourceTrackId: 'kick',
          } as CompressorParams,
        },
      ]),
    ];

    const routes = getSidechainRoutes(tracks);
    expect(routes).toHaveLength(1);
    expect(routes[0]).toEqual({
      sourceTrackId: 'kick',
      targetTrackId: 'bass',
      effectId: 'comp-1',
    });
  });

  it('returns multiple routes when multiple compressors have sidechain sources', () => {
    const tracks = [
      makeTrack('kick', 'Kick'),
      makeTrack('bass', 'Bass', [
        {
          id: 'comp-1',
          type: 'compressor',
          enabled: true,
          params: {
            threshold: -24, ratio: 4, attack: 0.02, release: 0.2, knee: 6,
            sidechainSourceTrackId: 'kick',
          } as CompressorParams,
        },
      ]),
      makeTrack('pad', 'Pad', [
        {
          id: 'comp-2',
          type: 'compressor',
          enabled: true,
          params: {
            threshold: -18, ratio: 3, attack: 0.01, release: 0.15, knee: 10,
            sidechainSourceTrackId: 'kick',
          } as CompressorParams,
        },
      ]),
    ];

    const routes = getSidechainRoutes(tracks);
    expect(routes).toHaveLength(2);
    expect(routes[0].targetTrackId).toBe('bass');
    expect(routes[1].targetTrackId).toBe('pad');
  });

  it('ignores compressors without sidechainSourceTrackId', () => {
    const tracks = [
      makeTrack('kick', 'Kick'),
      makeTrack('bass', 'Bass', [
        {
          id: 'comp-1',
          type: 'compressor',
          enabled: true,
          params: {
            threshold: -24, ratio: 4, attack: 0.02, release: 0.2, knee: 6,
          } as CompressorParams,
        },
      ]),
    ];

    expect(getSidechainRoutes(tracks)).toEqual([]);
  });

  it('ignores non-compressor effects', () => {
    const tracks = [
      makeTrack('kick', 'Kick'),
      makeTrack('bass', 'Bass', [
        {
          id: 'rev-1',
          type: 'reverb',
          enabled: true,
          params: { decay: 2, preDelay: 0.02, wet: 0.3 },
        },
      ]),
    ];

    expect(getSidechainRoutes(tracks)).toEqual([]);
  });

  it('ignores routes where source track does not exist', () => {
    const tracks = [
      makeTrack('bass', 'Bass', [
        {
          id: 'comp-1',
          type: 'compressor',
          enabled: true,
          params: {
            threshold: -24, ratio: 4, attack: 0.02, release: 0.2, knee: 6,
            sidechainSourceTrackId: 'nonexistent',
          } as CompressorParams,
        },
      ]),
    ];

    expect(getSidechainRoutes(tracks)).toEqual([]);
  });
});
