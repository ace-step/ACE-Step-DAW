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

function makeSidechainEffect(sourceTrackId: string, effectId = 'fx1') {
  return {
    id: effectId,
    type: 'compressor' as const,
    params: {
      threshold: -24,
      ratio: 4,
      attack: 0.003,
      release: 0.25,
      knee: 30,
      sidechainSourceTrackId: sourceTrackId,
    } as CompressorParams,
    bypass: false,
  };
}

// ─── buildRoutingGraph ───────────────────────────────────────────────────────

describe('buildRoutingGraph', () => {
  it('returns empty adjacency list for empty input', () => {
    const graph = buildRoutingGraph([], []);
    expect(graph.size).toBe(0);
  });

  it('returns empty adjacency list for tracks with no routing', () => {
    const tracks = [makeTrack('t1'), makeTrack('t2')];
    const graph = buildRoutingGraph(tracks, []);
    expect(graph.size).toBe(0);
  });

  // ── Send edges ──

  it('builds edges from sends (track -> return track)', () => {
    const tracks = [
      makeTrack('t1', { sends: [{ returnTrackId: 'rt1', amount: 0.5, prePost: 'post' }] }),
      makeTrack('t2'),
    ];
    const returns = [makeReturnTrack('rt1')];
    const graph = buildRoutingGraph(tracks, returns);
    expect(graph.get('t1')).toEqual(['rt1']);
    expect(graph.size).toBe(1);
  });

  it('ignores sends with zero amount', () => {
    const tracks = [
      makeTrack('t1', { sends: [{ returnTrackId: 'rt1', amount: 0, prePost: 'post' }] }),
    ];
    const returns = [makeReturnTrack('rt1')];
    const graph = buildRoutingGraph(tracks, returns);
    expect(graph.size).toBe(0);
  });

  it('ignores sends with negative amount', () => {
    const tracks = [
      makeTrack('t1', { sends: [{ returnTrackId: 'rt1', amount: -0.5, prePost: 'post' }] }),
    ];
    const returns = [makeReturnTrack('rt1')];
    const graph = buildRoutingGraph(tracks, returns);
    expect(graph.size).toBe(0);
  });

  it('ignores sends targeting non-existent return tracks', () => {
    const tracks = [
      makeTrack('t1', { sends: [{ returnTrackId: 'rt-missing', amount: 0.8, prePost: 'post' }] }),
    ];
    const graph = buildRoutingGraph(tracks, []);
    expect(graph.size).toBe(0);
  });

  it('creates edges for multiple sends from the same track', () => {
    const tracks = [
      makeTrack('t1', {
        sends: [
          { returnTrackId: 'rt1', amount: 0.5, prePost: 'post' },
          { returnTrackId: 'rt2', amount: 0.3, prePost: 'pre' },
        ],
      }),
    ];
    const returns = [makeReturnTrack('rt1'), makeReturnTrack('rt2')];
    const graph = buildRoutingGraph(tracks, returns);
    expect(graph.get('t1')).toEqual(['rt1', 'rt2']);
  });

  it('does not create duplicate edges for repeated sends to the same return', () => {
    const tracks = [
      makeTrack('t1', {
        sends: [
          { returnTrackId: 'rt1', amount: 0.5, prePost: 'post' },
          { returnTrackId: 'rt1', amount: 0.3, prePost: 'pre' },
        ],
      }),
    ];
    const returns = [makeReturnTrack('rt1')];
    const graph = buildRoutingGraph(tracks, returns);
    expect(graph.get('t1')).toEqual(['rt1']);
  });

  it('handles tracks with undefined sends array', () => {
    const tracks = [makeTrack('t1', { sends: undefined })];
    const graph = buildRoutingGraph(tracks, []);
    expect(graph.size).toBe(0);
  });

  // ── Sidechain edges ──

  it('builds edges from sidechain source (source -> target)', () => {
    const tracks = [
      makeTrack('t1'),
      makeTrack('t2', { effects: [makeSidechainEffect('t1')] }),
    ];
    const graph = buildRoutingGraph(tracks, []);
    expect(graph.get('t1')).toEqual(['t2']);
  });

  it('ignores compressor effects without sidechainSourceTrackId', () => {
    const tracks = [
      makeTrack('t1', {
        effects: [{
          id: 'fx1',
          type: 'compressor',
          params: {
            threshold: -24, ratio: 4, attack: 0.003, release: 0.25, knee: 30,
          } as CompressorParams,
          bypass: false,
        }],
      }),
    ];
    const graph = buildRoutingGraph(tracks, []);
    expect(graph.size).toBe(0);
  });

  it('ignores non-compressor effects', () => {
    const tracks = [
      makeTrack('t1', {
        effects: [{
          id: 'fx1',
          type: 'reverb',
          params: { decay: 1, preDelay: 0, wet: 0.5 },
          bypass: false,
        }],
      }),
    ];
    const graph = buildRoutingGraph(tracks, []);
    expect(graph.size).toBe(0);
  });

  it('handles multiple sidechain compressors on different tracks', () => {
    const tracks = [
      makeTrack('kick'),
      makeTrack('bass', { effects: [makeSidechainEffect('kick', 'fx1')] }),
      makeTrack('pad', { effects: [makeSidechainEffect('kick', 'fx2')] }),
    ];
    const graph = buildRoutingGraph(tracks, []);
    expect(graph.get('kick')).toEqual(['bass', 'pad']);
  });

  it('handles track with undefined effects array', () => {
    const tracks = [makeTrack('t1', { effects: undefined })];
    const graph = buildRoutingGraph(tracks, []);
    expect(graph.size).toBe(0);
  });

  // ── Group bus edges ──

  it('builds edges from group bus (child -> parent)', () => {
    const tracks = [
      makeTrack('t1', { parentTrackId: 'g1' }),
      makeTrack('g1', { isGroup: true }),
    ];
    const graph = buildRoutingGraph(tracks, []);
    expect(graph.get('t1')).toEqual(['g1']);
  });

  it('builds edges for nested groups (child -> parent -> grandparent)', () => {
    const tracks = [
      makeTrack('t1', { parentTrackId: 'g1' }),
      makeTrack('g1', { isGroup: true, parentTrackId: 'g2' }),
      makeTrack('g2', { isGroup: true }),
    ];
    const graph = buildRoutingGraph(tracks, []);
    expect(graph.get('t1')).toEqual(['g1']);
    expect(graph.get('g1')).toEqual(['g2']);
  });

  it('handles multiple children in the same group', () => {
    const tracks = [
      makeTrack('t1', { parentTrackId: 'g1' }),
      makeTrack('t2', { parentTrackId: 'g1' }),
      makeTrack('g1', { isGroup: true }),
    ];
    const graph = buildRoutingGraph(tracks, []);
    expect(graph.get('t1')).toEqual(['g1']);
    expect(graph.get('t2')).toEqual(['g1']);
  });

  // ── Combined edges ──

  it('combines send, sidechain and group edges for the same source', () => {
    const tracks = [
      makeTrack('t1', {
        parentTrackId: 'g1',
        sends: [{ returnTrackId: 'rt1', amount: 0.5, prePost: 'post' }],
      }),
      makeTrack('g1', { isGroup: true }),
      makeTrack('t2', { effects: [makeSidechainEffect('t1')] }),
    ];
    const returns = [makeReturnTrack('rt1')];
    const graph = buildRoutingGraph(tracks, returns);
    const t1Edges = graph.get('t1') ?? [];
    expect(t1Edges).toContain('rt1');
    expect(t1Edges).toContain('t2');
    expect(t1Edges).toContain('g1');
    expect(t1Edges.length).toBe(3);
  });
});

// ─── detectRoutingCycles ─────────────────────────────────────────────────────

describe('detectRoutingCycles', () => {
  it('returns empty array for empty graph', () => {
    expect(detectRoutingCycles(new Map())).toEqual([]);
  });

  it('returns empty array for acyclic graph', () => {
    const graph: RoutingGraph = new Map([
      ['a', ['b']],
      ['b', ['c']],
    ]);
    expect(detectRoutingCycles(graph)).toEqual([]);
  });

  it('returns empty for single node with no edges', () => {
    const graph: RoutingGraph = new Map([['a', []]]);
    expect(detectRoutingCycles(graph)).toEqual([]);
  });

  it('detects a self-loop', () => {
    const graph: RoutingGraph = new Map([['a', ['a']]]);
    const cycles = detectRoutingCycles(graph);
    expect(cycles.length).toBe(1);
    expect(cycles[0]).toEqual(['a']);
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
    expect(cycles[0].length).toBe(2);
  });

  it('detects a 3-node cycle', () => {
    const graph: RoutingGraph = new Map([
      ['a', ['b']],
      ['b', ['c']],
      ['c', ['a']],
    ]);
    const cycles = detectRoutingCycles(graph);
    expect(cycles.length).toBe(1);
    expect(cycles[0]).toEqual(['a', 'b', 'c']);
  });

  it('detects cycle in a larger graph with a tail', () => {
    // d -> a -> b -> c -> a (cycle is a,b,c; d is a tail)
    const graph: RoutingGraph = new Map([
      ['d', ['a']],
      ['a', ['b']],
      ['b', ['c']],
      ['c', ['a']],
    ]);
    const cycles = detectRoutingCycles(graph);
    expect(cycles.length).toBe(1);
    expect(cycles[0]).toEqual(['a', 'b', 'c']);
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

  it('handles disconnected components with two separate cycles', () => {
    const graph: RoutingGraph = new Map([
      ['a', ['b']],
      ['b', ['a']],
      ['c', ['d']],
      ['d', ['c']],
    ]);
    const cycles = detectRoutingCycles(graph);
    expect(cycles.length).toBe(2);
    // Each cycle should have 2 nodes
    expect(cycles[0].length).toBe(2);
    expect(cycles[1].length).toBe(2);
  });

  it('detects cycle where one node branches to cyclic and acyclic paths', () => {
    // a -> b, a -> c, b -> c -> a
    const graph: RoutingGraph = new Map([
      ['a', ['b', 'c']],
      ['b', ['c']],
      ['c', ['a']],
    ]);
    const cycles = detectRoutingCycles(graph);
    expect(cycles.length).toBeGreaterThanOrEqual(1);
    // At least one cycle should contain a
    const hasCycleWithA = cycles.some((c) => c.includes('a'));
    expect(hasCycleWithA).toBe(true);
  });

  it('handles a node that only appears as a target (not a source)', () => {
    // a -> b (b has no outgoing edges listed, but appears as target)
    const graph: RoutingGraph = new Map([['a', ['b']]]);
    expect(detectRoutingCycles(graph)).toEqual([]);
  });

  it('detects a 4-node cycle', () => {
    const graph: RoutingGraph = new Map([
      ['a', ['b']],
      ['b', ['c']],
      ['c', ['d']],
      ['d', ['a']],
    ]);
    const cycles = detectRoutingCycles(graph);
    expect(cycles.length).toBe(1);
    expect(cycles[0]).toEqual(['a', 'b', 'c', 'd']);
  });
});

// ─── wouldCreateCycle ────────────────────────────────────────────────────────

describe('wouldCreateCycle', () => {
  it('returns true for self-loop edge (from === to)', () => {
    const graph: RoutingGraph = new Map();
    expect(wouldCreateCycle(graph, 'a', 'a')).toBe(true);
  });

  it('returns true for self-loop even with existing edges', () => {
    const graph: RoutingGraph = new Map([['a', ['b']]]);
    expect(wouldCreateCycle(graph, 'a', 'a')).toBe(true);
  });

  it('returns false when adding an edge to an empty graph (non-self-loop)', () => {
    const graph: RoutingGraph = new Map();
    expect(wouldCreateCycle(graph, 'a', 'b')).toBe(false);
  });

  it('returns false when adding a new leaf edge', () => {
    const graph: RoutingGraph = new Map([['a', ['b']]]);
    expect(wouldCreateCycle(graph, 'b', 'c')).toBe(false);
  });

  it('returns true when adding an edge that closes a 2-node cycle', () => {
    const graph: RoutingGraph = new Map([['a', ['b']]]);
    // b -> a would create a <-> b
    expect(wouldCreateCycle(graph, 'b', 'a')).toBe(true);
  });

  it('returns true when adding an edge that closes a 3-node cycle', () => {
    const graph: RoutingGraph = new Map([
      ['a', ['b']],
      ['b', ['c']],
    ]);
    // c -> a would create a -> b -> c -> a
    expect(wouldCreateCycle(graph, 'c', 'a')).toBe(true);
  });

  it('returns true when adding an edge that closes a multi-hop cycle', () => {
    const graph: RoutingGraph = new Map([
      ['a', ['b']],
      ['b', ['c']],
      ['c', ['d']],
      ['d', ['e']],
    ]);
    // e -> a would create a 5-node cycle
    expect(wouldCreateCycle(graph, 'e', 'a')).toBe(true);
  });

  it('returns false when target cannot reach source (disconnected)', () => {
    const graph: RoutingGraph = new Map([
      ['a', ['b']],
      ['c', ['d']],
    ]);
    expect(wouldCreateCycle(graph, 'd', 'a')).toBe(false);
  });

  it('returns false for parallel edges that do not form a cycle', () => {
    // a -> b, a -> c, b -> d — adding c -> d is fine
    const graph: RoutingGraph = new Map([
      ['a', ['b', 'c']],
      ['b', ['d']],
    ]);
    expect(wouldCreateCycle(graph, 'c', 'd')).toBe(false);
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

  it('returns false when from and to are in the same chain but edge is forward', () => {
    // a -> b -> c — adding a -> c is fine (no back edge)
    const graph: RoutingGraph = new Map([
      ['a', ['b']],
      ['b', ['c']],
    ]);
    expect(wouldCreateCycle(graph, 'a', 'c')).toBe(false);
  });

  it('returns true when creating a cycle through an intermediate node', () => {
    // a -> b -> c -> d, adding d -> b would create b -> c -> d -> b
    const graph: RoutingGraph = new Map([
      ['a', ['b']],
      ['b', ['c']],
      ['c', ['d']],
    ]);
    expect(wouldCreateCycle(graph, 'd', 'b')).toBe(true);
  });

  it('returns false when adding edge between two nodes in separate components', () => {
    const graph: RoutingGraph = new Map([
      ['a', ['b']],
      ['c', ['d']],
    ]);
    // Adding b -> c connects components but doesn't cycle
    expect(wouldCreateCycle(graph, 'b', 'c')).toBe(false);
  });

  it('handles a diamond graph without false positive', () => {
    // a -> b, a -> c, b -> d, c -> d
    const graph: RoutingGraph = new Map([
      ['a', ['b', 'c']],
      ['b', ['d']],
      ['c', ['d']],
    ]);
    // Adding a -> d is fine (forward edge)
    expect(wouldCreateCycle(graph, 'a', 'd')).toBe(false);
  });
});

// ─── Integration: buildRoutingGraph + detectRoutingCycles ────────────────────

describe('buildRoutingGraph + detectRoutingCycles integration', () => {
  it('detects no cycles in a typical DAW setup', () => {
    const tracks = [
      makeTrack('drums', {
        sends: [{ returnTrackId: 'reverb', amount: 0.3, prePost: 'post' }],
        parentTrackId: 'rhythm-group',
      }),
      makeTrack('bass', {
        sends: [{ returnTrackId: 'reverb', amount: 0.1, prePost: 'post' }],
        parentTrackId: 'rhythm-group',
        effects: [makeSidechainEffect('drums')],
      }),
      makeTrack('rhythm-group', { isGroup: true }),
    ];
    const returns = [makeReturnTrack('reverb')];
    const graph = buildRoutingGraph(tracks, returns);
    const cycles = detectRoutingCycles(graph);
    expect(cycles).toEqual([]);
  });

  it('detects a circular group hierarchy', () => {
    // g1 -> g2 -> g1 (both claim parentTrackId of each other)
    const tracks = [
      makeTrack('g1', { isGroup: true, parentTrackId: 'g2' }),
      makeTrack('g2', { isGroup: true, parentTrackId: 'g1' }),
    ];
    const graph = buildRoutingGraph(tracks, []);
    const cycles = detectRoutingCycles(graph);
    expect(cycles.length).toBe(1);
    expect(cycles[0]).toContain('g1');
    expect(cycles[0]).toContain('g2');
  });

  it('detects a sidechain cycle (a sidechains b, b sidechains a)', () => {
    const tracks = [
      makeTrack('a', { effects: [makeSidechainEffect('b', 'fx1')] }),
      makeTrack('b', { effects: [makeSidechainEffect('a', 'fx2')] }),
    ];
    const graph = buildRoutingGraph(tracks, []);
    const cycles = detectRoutingCycles(graph);
    expect(cycles.length).toBe(1);
    expect(cycles[0]).toContain('a');
    expect(cycles[0]).toContain('b');
  });
});

// ─── Integration: buildRoutingGraph + wouldCreateCycle ───────────────────────

describe('buildRoutingGraph + wouldCreateCycle integration', () => {
  it('prevents adding a send that would close a cycle through group routing', () => {
    // t1 -> g1 (group), if we add g1 -> t1 it would cycle
    const tracks = [
      makeTrack('t1', { parentTrackId: 'g1' }),
      makeTrack('g1', { isGroup: true }),
    ];
    const graph = buildRoutingGraph(tracks, []);
    expect(wouldCreateCycle(graph, 'g1', 't1')).toBe(true);
  });

  it('allows safe routing that does not create cycles', () => {
    const tracks = [
      makeTrack('t1', { parentTrackId: 'g1' }),
      makeTrack('t2'),
      makeTrack('g1', { isGroup: true }),
    ];
    const graph = buildRoutingGraph(tracks, []);
    // t2 -> g1 is fine
    expect(wouldCreateCycle(graph, 't2', 'g1')).toBe(false);
  });
});
