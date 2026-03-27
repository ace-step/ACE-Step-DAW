import { describe, it, expect } from 'vitest';
import {
  buildRoutingGraph,
  detectRoutingCycles,
  wouldCreateCycle,
  type RoutingGraph,
} from '../routingGraph';
import type { Track, CompressorParams, ReturnTrack } from '../../types/project';

function makeTrack(
  id: string,
  overrides: Partial<Track> = {},
): Track {
  return {
    id,
    trackName: 'custom',
    displayName: id,
    color: '#ff0000',
    order: 0,
    volume: 1,
    muted: false,
    soloed: false,
    clips: [],
    ...overrides,
  };
}

function makeReturnTrack(id: string): ReturnTrack {
  return { id, name: id, effects: [], volume: 1, pan: 0 };
}

// ─── buildRoutingGraph ───────────────────────────────────────────────────────

describe('buildRoutingGraph', () => {
  it('returns empty adjacency list for tracks with no routing', () => {
    const tracks = [makeTrack('t1'), makeTrack('t2')];
    const graph = buildRoutingGraph(tracks, []);
    expect(graph.size).toBe(0);
  });

  it('builds edges from sends (track -> return track)', () => {
    const tracks = [
      makeTrack('t1', { sends: [{ returnTrackId: 'rt1', amount: 0.5 }] }),
      makeTrack('t2'),
    ];
    const returns = [makeReturnTrack('rt1')];
    const graph = buildRoutingGraph(tracks, returns);
    expect(graph.get('t1')).toEqual(['rt1']);
  });

  it('builds edges from sidechain source (source -> target)', () => {
    const tracks = [
      makeTrack('t1'),
      makeTrack('t2', {
        effects: [
          {
            id: 'fx1',
            type: 'compressor',
            params: {
              threshold: -24,
              ratio: 4,
              attack: 0.003,
              release: 0.25,
              knee: 30,
              sidechainSourceTrackId: 't1',
            } as CompressorParams,
            bypass: false,
          },
        ],
      }),
    ];
    const graph = buildRoutingGraph(tracks, []);
    expect(graph.get('t1')).toEqual(['t2']);
  });

  it('builds edges from group bus (child -> parent)', () => {
    const tracks = [
      makeTrack('t1', { parentTrackId: 'g1' }),
      makeTrack('g1', { isGroup: true }),
    ];
    const graph = buildRoutingGraph(tracks, []);
    expect(graph.get('t1')).toEqual(['g1']);
  });

  it('combines send, sidechain and group edges', () => {
    const tracks = [
      makeTrack('t1', {
        parentTrackId: 'g1',
        sends: [{ returnTrackId: 'rt1', amount: 0.5 }],
      }),
      makeTrack('g1', { isGroup: true }),
      makeTrack('t2', {
        effects: [
          {
            id: 'fx1',
            type: 'compressor',
            params: {
              threshold: -24,
              ratio: 4,
              attack: 0.003,
              release: 0.25,
              knee: 30,
              sidechainSourceTrackId: 't1',
            } as CompressorParams,
            bypass: false,
          },
        ],
      }),
    ];
    const returns = [makeReturnTrack('rt1')];
    const graph = buildRoutingGraph(tracks, returns);
    // t1 -> g1 (group), t1 -> rt1 (send), t1 -> t2 (sidechain)
    const t1Edges = graph.get('t1') ?? [];
    expect(t1Edges).toContain('g1');
    expect(t1Edges).toContain('rt1');
    expect(t1Edges).toContain('t2');
  });

  it('ignores sends with zero amount', () => {
    const tracks = [
      makeTrack('t1', { sends: [{ returnTrackId: 'rt1', amount: 0 }] }),
    ];
    const returns = [makeReturnTrack('rt1')];
    const graph = buildRoutingGraph(tracks, returns);
    expect(graph.size).toBe(0);
  });
});

// ─── detectRoutingCycles ─────────────────────────────────────────────────────

describe('detectRoutingCycles', () => {
  it('returns empty array for acyclic graph', () => {
    const graph: RoutingGraph = new Map([
      ['a', ['b']],
      ['b', ['c']],
    ]);
    expect(detectRoutingCycles(graph)).toEqual([]);
  });

  it('detects a simple 2-node cycle', () => {
    const graph: RoutingGraph = new Map([
      ['a', ['b']],
      ['b', ['a']],
    ]);
    const cycles = detectRoutingCycles(graph);
    expect(cycles.length).toBe(1);
    expect(cycles[0]).toContain('a');
    expect(cycles[0]).toContain('b');
  });

  it('detects a 3-node cycle', () => {
    const graph: RoutingGraph = new Map([
      ['a', ['b']],
      ['b', ['c']],
      ['c', ['a']],
    ]);
    const cycles = detectRoutingCycles(graph);
    expect(cycles.length).toBe(1);
    expect(cycles[0]).toEqual(expect.arrayContaining(['a', 'b', 'c']));
  });

  it('detects self-loop', () => {
    const graph: RoutingGraph = new Map([['a', ['a']]]);
    const cycles = detectRoutingCycles(graph);
    expect(cycles.length).toBe(1);
    expect(cycles[0]).toContain('a');
  });

  it('handles disconnected components (one cyclic, one acyclic)', () => {
    const graph: RoutingGraph = new Map([
      ['a', ['b']],
      ['b', ['a']],
      ['c', ['d']],
    ]);
    const cycles = detectRoutingCycles(graph);
    expect(cycles.length).toBe(1);
    expect(cycles[0]).toContain('a');
    expect(cycles[0]).toContain('b');
  });

  it('returns empty for empty graph', () => {
    expect(detectRoutingCycles(new Map())).toEqual([]);
  });
});

// ─── wouldCreateCycle ────────────────────────────────────────────────────────

describe('wouldCreateCycle', () => {
  it('returns false when adding an edge to an acyclic graph', () => {
    const graph: RoutingGraph = new Map([['a', ['b']]]);
    expect(wouldCreateCycle(graph, 'b', 'c')).toBe(false);
  });

  it('returns true when adding an edge that closes a cycle', () => {
    const graph: RoutingGraph = new Map([
      ['a', ['b']],
      ['b', ['c']],
    ]);
    // c -> a would create a -> b -> c -> a
    expect(wouldCreateCycle(graph, 'c', 'a')).toBe(true);
  });

  it('returns true for self-loop edge', () => {
    const graph: RoutingGraph = new Map();
    expect(wouldCreateCycle(graph, 'a', 'a')).toBe(true);
  });

  it('returns false when target cannot reach source', () => {
    const graph: RoutingGraph = new Map([
      ['a', ['b']],
      ['c', ['d']],
    ]);
    expect(wouldCreateCycle(graph, 'd', 'a')).toBe(false);
  });

  it('returns true when edge would join two paths into a cycle', () => {
    // a -> b, a -> c, b -> d, c -> d, now d -> a would cycle
    const graph: RoutingGraph = new Map([
      ['a', ['b', 'c']],
      ['b', ['d']],
      ['c', ['d']],
    ]);
    expect(wouldCreateCycle(graph, 'd', 'a')).toBe(true);
  });
});
