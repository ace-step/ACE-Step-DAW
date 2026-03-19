import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('track freeze / unfreeze / flatten', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    useProjectStore.getState().addTrack('vocals');
  });

  function getTrack(trackId?: string) {
    const proj = useProjectStore.getState().project!;
    return trackId
      ? proj.tracks.find((t) => t.id === trackId)!
      : proj.tracks[0];
  }

  function getTrackId() {
    return useProjectStore.getState().project!.tracks[0].id;
  }

  // ── freezeTrack ──────────────────────────────────────────────────────────

  it('freezeTrack sets frozen to true', () => {
    const trackId = getTrackId();
    useProjectStore.getState().freezeTrack(trackId);
    expect(getTrack(trackId).frozen).toBe(true);
  });

  it('freezeTrack stores frozenAudioKey when provided', () => {
    const trackId = getTrackId();
    useProjectStore.getState().freezeTrack(trackId, 'audio:proj:frozen-t1:isolated');
    const track = getTrack(trackId);
    expect(track.frozen).toBe(true);
    expect(track.frozenAudioKey).toBe('audio:proj:frozen-t1:isolated');
  });

  it('freezeTrack without audioKey does not set frozenAudioKey', () => {
    const trackId = getTrackId();
    useProjectStore.getState().freezeTrack(trackId);
    expect(getTrack(trackId).frozenAudioKey).toBeUndefined();
  });

  it('freezeTrack pushes to undo history', () => {
    const trackId = getTrackId();
    useProjectStore.getState().freezeTrack(trackId);
    useProjectStore.getState().undo();
    expect(getTrack(trackId).frozen).toBeFalsy();
  });

  it('freezeTrack updates updatedAt timestamp', () => {
    const trackId = getTrackId();
    const before = useProjectStore.getState().project!.updatedAt;
    useProjectStore.getState().freezeTrack(trackId);
    expect(useProjectStore.getState().project!.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('freezeTrack is a no-op when no project exists', () => {
    useProjectStore.setState({ project: null });
    expect(() => useProjectStore.getState().freezeTrack('nonexistent')).not.toThrow();
  });

  it('freezeTrack only affects the target track', () => {
    useProjectStore.getState().addTrack('drums');
    const tracks = useProjectStore.getState().project!.tracks;
    const vocalsId = tracks[0].id;
    const drumsId = tracks[1].id;

    useProjectStore.getState().freezeTrack(vocalsId, 'key-1');
    expect(getTrack(vocalsId).frozen).toBe(true);
    expect(getTrack(drumsId).frozen).toBeFalsy();
  });

  // ── unfreezeTrack ────────────────────────────────────────────────────────

  it('unfreezeTrack sets frozen to false and clears frozenAudioKey', () => {
    const trackId = getTrackId();
    useProjectStore.getState().freezeTrack(trackId, 'some-audio-key');
    expect(getTrack(trackId).frozenAudioKey).toBe('some-audio-key');

    useProjectStore.getState().unfreezeTrack(trackId);
    const track = getTrack(trackId);
    expect(track.frozen).toBe(false);
    expect(track.frozenAudioKey).toBeUndefined();
  });

  it('unfreezeTrack pushes to undo history', () => {
    const trackId = getTrackId();
    useProjectStore.getState().freezeTrack(trackId, 'key-1');
    useProjectStore.getState().unfreezeTrack(trackId);
    useProjectStore.getState().undo();
    expect(getTrack(trackId).frozen).toBe(true);
    expect(getTrack(trackId).frozenAudioKey).toBe('key-1');
  });

  it('unfreezeTrack on already-unfrozen track still works', () => {
    const trackId = getTrackId();
    expect(getTrack(trackId).frozen).toBeFalsy();
    useProjectStore.getState().unfreezeTrack(trackId);
    expect(getTrack(trackId).frozen).toBe(false);
    expect(getTrack(trackId).frozenAudioKey).toBeUndefined();
  });

  // ── flattenTrack ─────────────────────────────────────────────────────────

  it('flattenTrack converts track to sample type', () => {
    const trackId = getTrackId();
    useProjectStore.getState().flattenTrack(trackId, 'flat-audio-key');
    expect(getTrack(trackId).trackType).toBe('sample');
  });

  it('flattenTrack clears frozen state', () => {
    const trackId = getTrackId();
    useProjectStore.getState().freezeTrack(trackId, 'frozen-key');
    useProjectStore.getState().flattenTrack(trackId, 'flat-audio-key');
    const track = getTrack(trackId);
    expect(track.frozen).toBe(false);
    expect(track.frozenAudioKey).toBeUndefined();
  });

  it('flattenTrack replaces clips with a single ready clip', () => {
    const trackId = getTrackId();
    useProjectStore.getState().flattenTrack(trackId, 'flat-audio-key');
    const track = getTrack(trackId);
    expect(track.clips).toHaveLength(1);
    expect(track.clips[0].generationStatus).toBe('ready');
    expect(track.clips[0].isolatedAudioKey).toBe('flat-audio-key');
  });

  it('flattenTrack uses provided waveformPeaks and duration', () => {
    const trackId = getTrackId();
    const peaks = [0.1, 0.5, 0.9, 0.3];
    useProjectStore.getState().flattenTrack(trackId, 'flat-key', peaks, 42.5);
    const clip = getTrack(trackId).clips[0];
    expect(clip.waveformPeaks).toEqual(peaks);
    expect(clip.duration).toBe(42.5);
  });

  it('flattenTrack falls back to totalDuration when duration not provided', () => {
    const trackId = getTrackId();
    const totalDuration = useProjectStore.getState().project!.totalDuration;
    useProjectStore.getState().flattenTrack(trackId, 'flat-key');
    expect(getTrack(trackId).clips[0].duration).toBe(totalDuration);
  });

  it('flattenTrack removes sequencerPattern and synthPreset', () => {
    useProjectStore.getState().addTrack('drums', 'sequencer');
    const seqTrack = useProjectStore.getState().project!.tracks[1];
    expect(seqTrack.sequencerPattern).toBeDefined();

    useProjectStore.getState().flattenTrack(seqTrack.id, 'flat-key');
    const flattened = getTrack(seqTrack.id);
    expect(flattened.sequencerPattern).toBeUndefined();
    expect(flattened.synthPreset).toBeUndefined();
    expect(flattened.trackType).toBe('sample');
  });

  it('flattenTrack pushes to undo history', () => {
    const trackId = getTrackId();
    const originalType = getTrack(trackId).trackType;
    useProjectStore.getState().flattenTrack(trackId, 'flat-key');
    expect(getTrack(trackId).trackType).toBe('sample');

    useProjectStore.getState().undo();
    expect(getTrack(trackId).trackType).toBe(originalType);
  });

  it('flattenTrack is a no-op for nonexistent track', () => {
    expect(() =>
      useProjectStore.getState().flattenTrack('nonexistent', 'key'),
    ).not.toThrow();
  });

  it('flattenTrack clip has correct trackId', () => {
    const trackId = getTrackId();
    useProjectStore.getState().flattenTrack(trackId, 'flat-key');
    expect(getTrack(trackId).clips[0].trackId).toBe(trackId);
  });

  // ── freeze → flatten round-trip ──────────────────────────────────────────

  it('freeze then flatten produces a sample track', () => {
    const trackId = getTrackId();
    useProjectStore.getState().freezeTrack(trackId, 'frozen-key');
    expect(getTrack(trackId).frozen).toBe(true);

    useProjectStore.getState().flattenTrack(trackId, 'flat-key', [0.5], 10);
    const track = getTrack(trackId);
    expect(track.trackType).toBe('sample');
    expect(track.frozen).toBe(false);
    expect(track.clips).toHaveLength(1);
    expect(track.clips[0].isolatedAudioKey).toBe('flat-key');
  });

  it('full round-trip: freeze → unfreeze → freeze → flatten → undo restores', () => {
    const trackId = getTrackId();

    useProjectStore.getState().freezeTrack(trackId, 'key-1');
    useProjectStore.getState().unfreezeTrack(trackId);
    useProjectStore.getState().freezeTrack(trackId, 'key-2');
    useProjectStore.getState().flattenTrack(trackId, 'flat-key', undefined, 30);
    expect(getTrack(trackId).trackType).toBe('sample');

    // Undo flatten → should be frozen
    useProjectStore.getState().undo();
    expect(getTrack(trackId).frozen).toBe(true);
    expect(getTrack(trackId).frozenAudioKey).toBe('key-2');

    // Undo freeze → should be unfrozen
    useProjectStore.getState().undo();
    expect(getTrack(trackId).frozen).toBe(false);
  });
});
