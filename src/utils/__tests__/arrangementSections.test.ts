import { describe, it, expect } from 'vitest';
import { computeSections } from '../arrangementSections';
import type { Marker } from '../../types/project';

function mkMarker(time: number, name: string, color = '#facc15'): Marker {
  return { id: `m-${time}`, time, name, color };
}

describe('computeSections', () => {
  it('returns empty array when no markers', () => {
    expect(computeSections([], 60)).toEqual([]);
  });

  it('creates sections from markers sorted by time', () => {
    const markers = [mkMarker(20, 'Chorus'), mkMarker(0, 'Intro'), mkMarker(10, 'Verse')];
    const sections = computeSections(markers, 60);
    expect(sections).toEqual([
      { marker: expect.objectContaining({ name: 'Intro' }), startTime: 0, endTime: 10 },
      { marker: expect.objectContaining({ name: 'Verse' }), startTime: 10, endTime: 20 },
      { marker: expect.objectContaining({ name: 'Chorus' }), startTime: 20, endTime: 60 },
    ]);
  });

  it('single marker spans to totalDuration', () => {
    const sections = computeSections([mkMarker(5, 'Bridge')], 30);
    expect(sections).toHaveLength(1);
    expect(sections[0].startTime).toBe(5);
    expect(sections[0].endTime).toBe(30);
  });

  it('handles markers at same time (stable order by id)', () => {
    const markers = [
      { id: 'b', time: 0, name: 'B', color: '#ff0000' },
      { id: 'a', time: 0, name: 'A', color: '#00ff00' },
    ];
    const sections = computeSections(markers, 10);
    expect(sections[0].marker.name).toBe('B');
    expect(sections[1].marker.name).toBe('A');
  });
});
