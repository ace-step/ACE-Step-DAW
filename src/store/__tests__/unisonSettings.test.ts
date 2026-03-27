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

describe('updateUnisonSettings', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
  });

  it('sets unison values on a track', () => {
    const track = setupTrack();
    useProjectStore.getState().updateUnisonSettings(track.id, {
      voices: 4,
      detune: 25,
      spread: 0.8,
    });
    const updated = useProjectStore.getState().project!.tracks.find(t => t.id === track.id)!;
    expect(updated.unisonSettings).toEqual({
      voices: 4,
      detune: 25,
      spread: 0.8,
    });
  });

  it('merges partial unison updates', () => {
    const track = setupTrack();
    useProjectStore.getState().updateUnisonSettings(track.id, {
      voices: 3,
      detune: 50,
      spread: 0.5,
    });
    useProjectStore.getState().updateUnisonSettings(track.id, { detune: 75 });
    const updated = useProjectStore.getState().project!.tracks.find(t => t.id === track.id)!;
    expect(updated.unisonSettings!.voices).toBe(3);
    expect(updated.unisonSettings!.detune).toBe(75);
    expect(updated.unisonSettings!.spread).toBe(0.5);
  });

  it('creates default unison when none exists and partial update applied', () => {
    const track = setupTrack();
    useProjectStore.getState().updateUnisonSettings(track.id, { voices: 6 });
    const updated = useProjectStore.getState().project!.tracks.find(t => t.id === track.id)!;
    expect(updated.unisonSettings!.voices).toBe(6);
    expect(updated.unisonSettings!.detune).toBe(0);
    expect(updated.unisonSettings!.spread).toBe(0);
  });

  it('does nothing when project is null', () => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().updateUnisonSettings('nonexistent', { voices: 2 });
    expect(useProjectStore.getState().project).toBeNull();
  });

  it('clamps voices between 1 and 8', () => {
    const track = setupTrack();
    useProjectStore.getState().updateUnisonSettings(track.id, { voices: 1 });
    let updated = useProjectStore.getState().project!.tracks.find(t => t.id === track.id)!;
    expect(updated.unisonSettings!.voices).toBe(1);

    useProjectStore.getState().updateUnisonSettings(track.id, { voices: 8 });
    updated = useProjectStore.getState().project!.tracks.find(t => t.id === track.id)!;
    expect(updated.unisonSettings!.voices).toBe(8);
  });

  it('clamps detune between 0 and 100', () => {
    const track = setupTrack();
    useProjectStore.getState().updateUnisonSettings(track.id, { detune: 0 });
    let updated = useProjectStore.getState().project!.tracks.find(t => t.id === track.id)!;
    expect(updated.unisonSettings!.detune).toBe(0);

    useProjectStore.getState().updateUnisonSettings(track.id, { detune: 100 });
    updated = useProjectStore.getState().project!.tracks.find(t => t.id === track.id)!;
    expect(updated.unisonSettings!.detune).toBe(100);
  });

  it('clamps spread between 0 and 1', () => {
    const track = setupTrack();
    useProjectStore.getState().updateUnisonSettings(track.id, { spread: 0 });
    let updated = useProjectStore.getState().project!.tracks.find(t => t.id === track.id)!;
    expect(updated.unisonSettings!.spread).toBe(0);

    useProjectStore.getState().updateUnisonSettings(track.id, { spread: 1 });
    updated = useProjectStore.getState().project!.tracks.find(t => t.id === track.id)!;
    expect(updated.unisonSettings!.spread).toBe(1);
  });

  it('supports undo via history', () => {
    const track = setupTrack();
    useProjectStore.getState().updateUnisonSettings(track.id, {
      voices: 4,
      detune: 50,
      spread: 0.5,
    });
    const afterUpdate = useProjectStore.getState().project!.tracks.find(t => t.id === track.id)!;
    expect(afterUpdate.unisonSettings!.voices).toBe(4);

    useProjectStore.getState().undo();
    const afterUndo = useProjectStore.getState().project!.tracks.find(t => t.id === track.id)!;
    expect(afterUndo.unisonSettings).toBeUndefined();
  });
});
