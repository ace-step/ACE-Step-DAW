import type { Track, CompressorParams, ReturnTrack } from '../types/project';

/** Adjacency list: node id -> list of target node ids. */
export type RoutingGraph = Map<string, string[]>;

/**
 * Builds a directed routing graph from DAW tracks and return tracks.
 *
 * Edges represent audio signal flow:
 * - Send: track -> return track (when send amount > 0)
 * - Sidechain: source track -> target track (compressor with sidechainSourceTrackId)
 * - Group bus: child track -> parent group track
 */
export function buildRoutingGraph(
  tracks: Track[],
  returnTracks: ReturnTrack[],
): RoutingGraph {
  const graph: RoutingGraph = new Map();
  const returnTrackIds = new Set(returnTracks.map((rt) => rt.id));

  function addEdge(from: string, to: string): void {
    const existing = graph.get(from);
    if (existing) {
      if (!existing.includes(to)) existing.push(to);
    } else {
      graph.set(from, [to]);
    }
  }

  for (const track of tracks) {
    // Send edges: track -> return track
    for (const send of track.sends ?? []) {
      if (send.amount > 0 && returnTrackIds.has(send.returnTrackId)) {
        addEdge(track.id, send.returnTrackId);
      }
    }

    // Sidechain edges: source -> target (the track with the compressor)
    for (const effect of track.effects ?? []) {
      if (effect.type !== 'compressor') continue;
      const params = effect.params as CompressorParams;
      if (params.sidechainSourceTrackId) {
        addEdge(params.sidechainSourceTrackId, track.id);
      }
    }

    // Group bus edges: child -> parent
    if (track.parentTrackId) {
      addEdge(track.id, track.parentTrackId);
    }
  }

  return graph;
}

/**
 * Detects all cycles in a directed routing graph using DFS.
 * Returns an array of cycles, where each cycle is an array of node ids
 * forming a loop (in traversal order).
 */
export function detectRoutingCycles(graph: RoutingGraph): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const path: string[] = [];

  // Collect all nodes (both sources and targets)
  const allNodes = new Set<string>();
  for (const [from, tos] of graph) {
    allNodes.add(from);
    for (const to of tos) allNodes.add(to);
  }

  function dfs(node: string): void {
    visited.add(node);
    inStack.add(node);
    path.push(node);

    for (const neighbor of graph.get(node) ?? []) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (inStack.has(neighbor)) {
        // Found a cycle — extract it from the path
        const cycleStart = path.indexOf(neighbor);
        cycles.push(path.slice(cycleStart));
      }
    }

    path.pop();
    inStack.delete(node);
  }

  for (const node of allNodes) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles;
}

/**
 * Checks whether adding edge `from -> to` to the existing graph would create a cycle.
 * Uses reachability check: a cycle forms if `to` can already reach `from` in the current graph,
 * or if `from === to` (self-loop).
 */
export function wouldCreateCycle(
  graph: RoutingGraph,
  from: string,
  to: string,
): boolean {
  if (from === to) return true;

  // BFS/DFS from `to` to see if `from` is reachable
  const visited = new Set<string>();
  const queue = [to];

  while (queue.length > 0) {
    const current = queue.pop()!;
    if (current === from) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const neighbor of graph.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        queue.push(neighbor);
      }
    }
  }

  return false;
}
