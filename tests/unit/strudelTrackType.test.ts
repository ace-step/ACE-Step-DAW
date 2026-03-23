/**
 * Phase 1: Strudel track type — store integration tests
 *
 * Tests: T1 (createTrackFromTemplate), T2 (updateStrudelCode),
 *        T4 (addTrack via store), T12 (undo/redo strudel code)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

const DEFAULT_PROJECT = {
  id: 'test-project',
  name: 'Test',
  bpm: 120,
  timeSignature: 4,
  measures: 64,
  totalDuration: 128,
  tracks: [],
  tempoMap: [],
  timeSignatureMap: [],
  sampleRate: 44100,
  keyScale: 'C major',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  masterVolume: 0,
};

describe('Strudel track type', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: DEFAULT_PROJECT as never });
  });

  it('T1: creates a strudel track with correct defaults', () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('custom', 'strudel');

    expect(track.trackType).toBe('strudel');
    expect(track.displayName).toBe('Strudel');
    expect(track.color).toBe('#e67e22');
    expect(track.strudelCode).toContain('note(');
    expect(track.strudelCycleLength).toBe(1);
    expect(track.volume).toBe(0.8);
    expect(track.muted).toBe(false);
    expect(track.soloed).toBe(false);
  });

  it('T1b: auto-numbers subsequent strudel tracks', () => {
    const store = useProjectStore.getState();
    store.addTrack('custom', 'strudel');
    const track2 = store.addTrack('custom', 'strudel');

    expect(track2.displayName).toBe('Strudel 2');
  });

  it('T4: strudel track appears in project.tracks', () => {
    const store = useProjectStore.getState();
    store.addTrack('custom', 'strudel');

    const tracks = useProjectStore.getState().project!.tracks;
    expect(tracks.length).toBe(1);
    expect(tracks[0].trackType).toBe('strudel');
  });

  it('T2: updateStrudelCode updates the pattern and pushes history', () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('custom', 'strudel');

    useProjectStore.getState().updateStrudelCode(track.id, 's("hh*8")');

    const updated = useProjectStore.getState().project!.tracks[0];
    expect(updated.strudelCode).toBe('s("hh*8")');
  });

  it('T3: getStrudelCode reads current pattern', () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('custom', 'strudel');

    const code = useProjectStore.getState().getStrudelCode(track.id);
    expect(code).toContain('note(');
  });

  it('T12: undo reverts strudel code change', () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('custom', 'strudel');

    useProjectStore.getState().updateStrudelCode(track.id, 's("hh*8")');
    expect(useProjectStore.getState().project!.tracks[0].strudelCode).toBe('s("hh*8")');

    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project!.tracks[0].strudelCode).toContain('note(');
  });

  it('does not add strudel fields to non-strudel tracks', () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('custom', 'sample');

    expect(track.strudelCode).toBeUndefined();
    expect(track.strudelCycleLength).toBeUndefined();
  });

  it('strudel track has no sequencerPattern or drumMachine', () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('custom', 'strudel');

    expect(track.sequencerPattern).toBeUndefined();
    expect(track.drumMachine).toBeUndefined();
  });
});
