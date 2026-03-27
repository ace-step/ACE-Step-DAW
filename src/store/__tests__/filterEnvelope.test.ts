import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

function setupTrack() {
  useProjectStore.getState().createProject();
  const track = useProjectStore.getState().addTrack('pianoRoll');
  return track;
}

describe('updateFilterEnvelope', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
  });

  it('sets full filter envelope values on a track', () => {
    const track = setupTrack();
    useProjectStore.getState().updateFilterEnvelope(track.id, {
      attack: 0.05,
      decay: 0.2,
      sustain: 0.4,
      release: 0.8,
      baseFrequency: 200,
      octaves: 4,
    });
    const updated = useProjectStore.getState().project!.tracks.find(t => t.id === track.id)!;
    expect(updated.filterEnvelope).toEqual({
      attack: 0.05,
      decay: 0.2,
      sustain: 0.4,
      release: 0.8,
      baseFrequency: 200,
      octaves: 4,
    });
  });

  it('merges partial filter envelope updates', () => {
    const track = setupTrack();
    useProjectStore.getState().updateFilterEnvelope(track.id, {
      attack: 0.1,
      decay: 0.3,
      sustain: 0.5,
      release: 1.0,
      baseFrequency: 300,
      octaves: 3,
    });
    useProjectStore.getState().updateFilterEnvelope(track.id, { baseFrequency: 500 });
    const updated = useProjectStore.getState().project!.tracks.find(t => t.id === track.id)!;
    expect(updated.filterEnvelope!.baseFrequency).toBe(500);
    expect(updated.filterEnvelope!.attack).toBe(0.1);
    expect(updated.filterEnvelope!.octaves).toBe(3);
  });

  it('creates default filter envelope when none exists and partial update applied', () => {
    const track = setupTrack();
    useProjectStore.getState().updateFilterEnvelope(track.id, { octaves: 5 });
    const updated = useProjectStore.getState().project!.tracks.find(t => t.id === track.id)!;
    expect(updated.filterEnvelope!.attack).toBe(0.01);
    expect(updated.filterEnvelope!.decay).toBe(0.3);
    expect(updated.filterEnvelope!.sustain).toBe(0.5);
    expect(updated.filterEnvelope!.release).toBe(0.8);
    expect(updated.filterEnvelope!.baseFrequency).toBe(200);
    expect(updated.filterEnvelope!.octaves).toBe(5);
  });

  it('does nothing when project is null', () => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().updateFilterEnvelope('nonexistent', { attack: 1 });
    expect(useProjectStore.getState().project).toBeNull();
  });

  it('updates updatedAt timestamp', () => {
    const track = setupTrack();
    const before = useProjectStore.getState().project!.updatedAt;
    useProjectStore.getState().updateFilterEnvelope(track.id, { attack: 0.5 });
    const after = useProjectStore.getState().project!.updatedAt;
    expect(after).toBeGreaterThanOrEqual(before);
  });
});
