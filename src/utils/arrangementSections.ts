import type { Marker } from '../types/project';

export interface ArrangementSection {
  marker: Marker;
  startTime: number;
  endTime: number;
}

/**
 * Compute contiguous sections from markers.
 * Each marker defines the start of a section; it ends where the next marker begins
 * (or at totalDuration for the last one).
 */
export function computeSections(markers: Marker[], totalDuration: number): ArrangementSection[] {
  if (markers.length === 0) return [];

  const sorted = [...markers].sort((a, b) => a.time - b.time);

  return sorted.map((marker, i) => ({
    marker,
    startTime: marker.time,
    endTime: i < sorted.length - 1 ? sorted[i + 1].time : totalDuration,
  }));
}
