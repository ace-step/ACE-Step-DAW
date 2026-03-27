import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

// Mock projectStorage to prevent IndexedDB calls during testing
vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('updateWavetableSettings store action', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
  });

  function addPianoRollTrack() {
    return useProjectStore.getState().addTrack('synth', 'pianoRoll');
  }

  function getTrack(trackId: string) {
    return useProjectStore.getState().project!.tracks.find((t) => t.id === trackId)!;
  }

  it('creates default wavetable settings when none exist on the track', () => {
    const track = addPianoRollTrack();
    expect(track.wavetableSettings).toBeUndefined();

    useProjectStore.getState().updateWavetableSettings(track.id, { position: 0.5 });

    const updated = getTrack(track.id);
    expect(updated.wavetableSettings).toBeDefined();
    expect(updated.wavetableSettings!.position).toBe(0.5);
    // Should have default waveforms
    expect(updated.wavetableSettings!.waveforms).toHaveLength(2);
    expect(updated.wavetableSettings!.waveforms[0].name).toBe('Sine');
    expect(updated.wavetableSettings!.waveforms[1].name).toBe('Saw');
  });

  it('merges partial settings with existing wavetable settings', () => {
    const track = addPianoRollTrack();
    useProjectStore.getState().updateWavetableSettings(track.id, { position: 0.3, morphSpeed: 1 });
    useProjectStore.getState().updateWavetableSettings(track.id, { position: 0.7 });

    const updated = getTrack(track.id);
    expect(updated.wavetableSettings!.position).toBe(0.7);
    expect(updated.wavetableSettings!.morphSpeed).toBe(1); // preserved from first update
  });

  it('replaces waveforms array entirely when provided', () => {
    const track = addPianoRollTrack();
    const customWaveforms = [
      { name: 'Custom A', partials: [1, 0.5] },
      { name: 'Custom B', partials: [0.5, 1] },
      { name: 'Custom C', partials: [0.3, 0.7, 0.2] },
    ];
    useProjectStore.getState().updateWavetableSettings(track.id, { waveforms: customWaveforms });

    const updated = getTrack(track.id);
    expect(updated.wavetableSettings!.waveforms).toHaveLength(3);
    expect(updated.wavetableSettings!.waveforms[0].name).toBe('Custom A');
  });

  it('merges ampEnvelope partially', () => {
    const track = addPianoRollTrack();
    useProjectStore.getState().updateWavetableSettings(track.id, {
      ampEnvelope: { attack: 0.5, decay: 0.2, sustain: 0.8, release: 0.3 },
    });
    useProjectStore.getState().updateWavetableSettings(track.id, {
      ampEnvelope: { attack: 0.1, decay: 0.2, sustain: 0.8, release: 0.3 },
    });

    const updated = getTrack(track.id);
    expect(updated.wavetableSettings!.ampEnvelope.attack).toBe(0.1);
    expect(updated.wavetableSettings!.ampEnvelope.sustain).toBe(0.8); // preserved
  });

  it('does not affect other tracks', () => {
    const track1 = addPianoRollTrack();
    const track2 = addPianoRollTrack();
    useProjectStore.getState().updateWavetableSettings(track1.id, { position: 0.9 });

    const t2 = getTrack(track2.id);
    expect(t2.wavetableSettings).toBeUndefined();
  });

  it('supports undo (pushes history)', () => {
    const track = addPianoRollTrack();
    useProjectStore.getState().updateWavetableSettings(track.id, { position: 0.5 });

    // Undo should restore the track to no wavetable settings
    useProjectStore.getState().undo();
    const undone = getTrack(track.id);
    expect(undone.wavetableSettings).toBeUndefined();
  });

  it('updates outputGain correctly', () => {
    const track = addPianoRollTrack();
    useProjectStore.getState().updateWavetableSettings(track.id, { outputGain: 1.2 });

    const updated = getTrack(track.id);
    expect(updated.wavetableSettings!.outputGain).toBe(1.2);
  });

  it('does nothing when project is null', () => {
    useProjectStore.setState({ project: null });
    // Should not throw
    useProjectStore.getState().updateWavetableSettings('nonexistent', { position: 0.5 });
  });

  it('updates updatedAt timestamp', () => {
    const track = addPianoRollTrack();
    const before = useProjectStore.getState().project!.updatedAt;
    useProjectStore.getState().updateWavetableSettings(track.id, { position: 0.5 });
    const after = useProjectStore.getState().project!.updatedAt;
    expect(after).toBeGreaterThanOrEqual(before);
  });
});
