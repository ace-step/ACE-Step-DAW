import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../projectStore';
import { createDefaultZone } from '../../utils/sampleZones';
import type { Project, Track, SampleZone } from '../../types/project';

function createTestProject(trackOverrides: Partial<Track> = {}): Project {
  const track: Track = {
    id: 'track-1',
    displayName: 'Test Sampler',
    trackType: 'pianoRoll',
    color: '#ffffff',
    volume: 0.8,
    pan: 0,
    mute: false,
    solo: false,
    clips: [],
    laneHeight: 120,
    samplerConfig: {
      audioKey: 'primary-audio',
      rootNote: 60,
      trimStart: 0,
      trimEnd: 1,
      playbackMode: 'classic',
      loopStart: 0,
      loopEnd: 1,
      attack: 0.005,
      decay: 0.1,
      sustain: 1,
      release: 0.3,
    },
    ...trackOverrides,
  } as Track;

  return {
    id: 'proj-1',
    name: 'Test',
    bpm: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    tracks: [track],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    clips: [],
    markers: [],
  } as unknown as Project;
}

describe('projectStore sample zone actions', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: createTestProject() });
  });

  it('addSampleZone appends a zone', () => {
    const zone = createDefaultZone('zone-audio-1', { rootNote: 48, lowKey: 36, highKey: 60 });
    useProjectStore.getState().addSampleZone('track-1', zone);

    const track = useProjectStore.getState().project!.tracks[0];
    expect(track.samplerConfig!.zones).toHaveLength(1);
    expect(track.samplerConfig!.zones![0].audioKey).toBe('zone-audio-1');
    expect(track.samplerConfig!.zones![0].lowKey).toBe(36);
  });

  it('addSampleZone appends multiple zones', () => {
    const z1 = createDefaultZone('key-1', { id: 'z1', lowKey: 0, highKey: 60 });
    const z2 = createDefaultZone('key-2', { id: 'z2', lowKey: 61, highKey: 127 });
    const store = useProjectStore.getState();
    store.addSampleZone('track-1', z1);
    store.addSampleZone('track-1', z2);

    const zones = useProjectStore.getState().project!.tracks[0].samplerConfig!.zones!;
    expect(zones).toHaveLength(2);
    expect(zones[0].id).toBe('z1');
    expect(zones[1].id).toBe('z2');
  });

  it('removeSampleZone removes by ID', () => {
    const z1 = createDefaultZone('key-1', { id: 'z1' });
    const z2 = createDefaultZone('key-2', { id: 'z2' });
    const store = useProjectStore.getState();
    store.addSampleZone('track-1', z1);
    store.addSampleZone('track-1', z2);
    store.removeSampleZone('track-1', 'z1');

    const zones = useProjectStore.getState().project!.tracks[0].samplerConfig!.zones!;
    expect(zones).toHaveLength(1);
    expect(zones[0].id).toBe('z2');
  });

  it('updateSampleZone updates partial fields', () => {
    const zone = createDefaultZone('key-1', { id: 'z1', volume: 1, pan: 0 });
    const store = useProjectStore.getState();
    store.addSampleZone('track-1', zone);
    store.updateSampleZone('track-1', 'z1', { volume: 0.7, pan: -0.3, tuneOffset: 50 });

    const updated = useProjectStore.getState().project!.tracks[0].samplerConfig!.zones![0];
    expect(updated.volume).toBe(0.7);
    expect(updated.pan).toBe(-0.3);
    expect(updated.tuneOffset).toBe(50);
    // Unchanged fields preserved
    expect(updated.audioKey).toBe('key-1');
  });

  it('setSampleZones replaces all zones', () => {
    const z1 = createDefaultZone('key-1', { id: 'z1' });
    const store = useProjectStore.getState();
    store.addSampleZone('track-1', z1);

    const newZones = [
      createDefaultZone('new-1', { id: 'n1' }),
      createDefaultZone('new-2', { id: 'n2' }),
      createDefaultZone('new-3', { id: 'n3' }),
    ];
    store.setSampleZones('track-1', newZones);

    const zones = useProjectStore.getState().project!.tracks[0].samplerConfig!.zones!;
    expect(zones).toHaveLength(3);
    expect(zones.map((z) => z.id)).toEqual(['n1', 'n2', 'n3']);
  });

  it('no-ops on nonexistent track', () => {
    const zone = createDefaultZone('key-1');
    useProjectStore.getState().addSampleZone('nonexistent', zone);
    const track = useProjectStore.getState().project!.tracks[0];
    expect(track.samplerConfig!.zones).toBeUndefined();
  });

  it('no-ops on track without samplerConfig', () => {
    useProjectStore.setState({
      project: createTestProject({ samplerConfig: undefined }),
    });
    const zone = createDefaultZone('key-1');
    useProjectStore.getState().addSampleZone('track-1', zone);
    // No crash
    expect(useProjectStore.getState().project!.tracks[0].samplerConfig).toBeUndefined();
  });
});
